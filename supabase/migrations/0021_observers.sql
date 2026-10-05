-- ---------------------------------------------------------------------------
-- 0021. Роли-наблюдатели: родитель, классный руководитель, завуч.
--
-- Схема под них заведена в 0017 (person_roles, person_classes,
-- parent_children). Здесь — право читать чужие оценки, посещаемость и работы.
--
-- Политики добавляются рядом с существующими, а не вместо них: в PostgreSQL
-- разрешающие политики складываются по ИЛИ, поэтому ученик по-прежнему видит
-- своё, а наблюдатель — только своих подопечных.
-- ---------------------------------------------------------------------------

/**
 * Может ли текущий пользователь наблюдать за этим человеком.
 *
 * Родитель — за своими детьми, классный руководитель и завуч — за учениками
 * закреплённых классов. Администратор школы и так видит всё по своим
 * политикам, поэтому здесь его нет.
 */
create or replace function public.can_observe_user(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.school_people child
    join public.school_people me
      on me.school_id = child.school_id and me.user_id = auth.uid()
    where child.user_id = p_user
      and (
        exists (
          select 1 from public.parent_children pc
          where pc.parent_id = me.id and pc.child_id = child.id
        )
        or (
          child.class_id is not null
          and exists (
            select 1 from public.person_classes pcl
            where pcl.person_id = me.id and pcl.class_id = child.class_id
          )
        )
      )
  );
$$;

grant execute on function public.can_observe_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Чтение данных подопечных
-- ---------------------------------------------------------------------------
drop policy if exists grades_observer_read on public.grades;
create policy grades_observer_read on public.grades for select
  using (public.can_observe_user(student_id));

drop policy if exists attendance_observer_read on public.attendance;
create policy attendance_observer_read on public.attendance for select
  using (public.can_observe_user(student_id));

drop policy if exists submissions_observer_read on public.submissions;
create policy submissions_observer_read on public.submissions for select
  using (public.can_observe_user(student_id));

-- Чтобы оценка читалась осмысленно, нужны и колонки журнала, и занятия, и
-- задания тех пространств, где учится подопечный.
drop policy if exists grade_items_observer_read on public.grade_items;
create policy grade_items_observer_read on public.grade_items for select using (
  exists (
    select 1 from public.space_members m
    join public.school_people child on child.user_id = m.user_id
    join public.school_people me on me.school_id = child.school_id and me.user_id = auth.uid()
    where m.space_id = grade_items.space_id
      and public.can_observe_user(m.user_id)
  )
);

drop policy if exists lessons_observer_read on public.lessons;
create policy lessons_observer_read on public.lessons for select using (
  exists (
    select 1 from public.space_members m
    where m.space_id = lessons.space_id and public.can_observe_user(m.user_id)
  )
);

drop policy if exists assignments_observer_read on public.assignments;
create policy assignments_observer_read on public.assignments for select using (
  exists (
    select 1 from public.space_members m
    where m.space_id = assignments.space_id and public.can_observe_user(m.user_id)
  )
);

drop policy if exists spaces_observer_read on public.spaces;
create policy spaces_observer_read on public.spaces for select using (
  exists (
    select 1 from public.space_members m
    where m.space_id = spaces.id and public.can_observe_user(m.user_id)
  )
);

-- Родитель может писать в чат работы своего ребёнка: сдавать за него нельзя,
-- а спросить учителя — можно.
drop policy if exists submission_messages_observer_read on public.submission_messages;
create policy submission_messages_observer_read on public.submission_messages for select using (
  exists (
    select 1 from public.submissions s
    where s.id = submission_id and public.can_observe_user(s.student_id)
  )
);

drop policy if exists submission_messages_observer_write on public.submission_messages;
create policy submission_messages_observer_write on public.submission_messages for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.submissions s
    where s.id = submission_id and public.can_observe_user(s.student_id)
  )
);
