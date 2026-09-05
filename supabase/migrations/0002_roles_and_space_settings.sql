-- ===========================================================================
-- CornFlow — права ролей, настройки пространства и дедлайны заданий.
-- Выполняется после 0001_init.sql.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Настройки пространства (управляет владелец)
-- --------------------------------------------------------------------------
alter table public.spaces add column if not exists join_open        boolean not null default true;
alter table public.spaces add column if not exists is_locked        boolean not null default false;
alter table public.spaces add column if not exists student_upload   boolean not null default false;
alter table public.spaces add column if not exists show_assignments boolean not null default true;
alter table public.spaces add column if not exists show_calendar    boolean not null default true;
alter table public.spaces add column if not exists show_members     boolean not null default true;

-- --------------------------------------------------------------------------
-- Вход по коду: всегда только просмотр. Права повышает владелец вручную —
-- иначе любой, кто знает код, мог бы сменить себе роль и получить редактирование.
-- --------------------------------------------------------------------------
create or replace function public.join_space_by_code(p_code text)
returns public.spaces
language plpgsql security definer set search_path = public
as $$
declare s public.spaces;
begin
  select * into s from public.spaces where upper(invite_code) = upper(p_code);
  if not found then
    raise exception 'Пространство с таким кодом не найдено';
  end if;
  if not s.join_open then
    raise exception 'Приём новых участников в это пространство закрыт';
  end if;
  if s.is_locked and s.owner_id <> auth.uid() then
    raise exception 'Пространство закрыто преподавателем';
  end if;
  insert into public.space_members (space_id, user_id, permission)
  values (s.id, auth.uid(),
          case when s.owner_id = auth.uid() then 'edit'::member_permission
               else 'view'::member_permission end)
  on conflict (space_id, user_id) do nothing;
  return s;
end $$;

-- --------------------------------------------------------------------------
-- Уровни доступа:
--   is_space_member  — видит содержимое (закрытое пространство — только владелец)
--   can_edit_space   — добавляет материалы (редакторы + ученики, если разрешено)
--   can_manage_space — задания, папки, правка чужих материалов (только редакторы)
-- --------------------------------------------------------------------------
create or replace function public.is_space_member(p_space uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.spaces s
    join public.space_members m on m.space_id = s.id
    where s.id = p_space and m.user_id = auth.uid()
      and (not s.is_locked or s.owner_id = auth.uid())
  );
$$;

create or replace function public.can_edit_space(p_space uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.spaces s
    left join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
    where s.id = p_space
      and (
        s.owner_id = auth.uid()
        or (m.permission = 'edit' and not s.is_locked)
        or (s.student_upload and m.user_id is not null and not s.is_locked)
      )
  );
$$;

create or replace function public.can_manage_space(p_space uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.spaces s
    left join public.space_members m on m.space_id = s.id and m.user_id = auth.uid()
    where s.id = p_space
      and not s.is_locked
      and (s.owner_id = auth.uid() or m.permission = 'edit')
  );
$$;

drop policy if exists assignments_write on public.assignments;
create policy assignments_write on public.assignments for all
  using (public.can_manage_space(space_id)) with check (public.can_manage_space(space_id));

drop policy if exists folders_write on public.folders;
create policy folders_write on public.folders for all
  using (public.can_manage_space(space_id)) with check (public.can_manage_space(space_id));

drop policy if exists materials_update on public.materials;
create policy materials_update on public.materials for update
  using (public.can_manage_space(space_id) or author_id = auth.uid())
  with check (public.can_manage_space(space_id) or author_id = auth.uid());

drop policy if exists materials_delete on public.materials;
create policy materials_delete on public.materials for delete
  using (author_id = auth.uid() or public.is_space_owner(space_id));

-- --------------------------------------------------------------------------
-- Дедлайны: приём работ после срока и отметка опоздания
-- --------------------------------------------------------------------------
alter table public.assignments add column if not exists allow_late boolean not null default true;
alter table public.submissions add column if not exists is_late    boolean not null default false;

create or replace function public.check_submission_deadline()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.assignments;
begin
  select * into a from public.assignments where id = new.assignment_id;
  -- проверяем только сдачу учеником; оценивание преподавателем не трогаем
  if new.student_id = auth.uid()
     and new.status <> 'assigned'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if a.due_date is not null and coalesce(new.submitted_at, now()) > a.due_date then
      if not a.allow_late then
        raise exception 'Срок сдачи истёк — преподаватель закрыл приём работ';
      end if;
      new.is_late := true;
    else
      new.is_late := false;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists submissions_deadline on public.submissions;
create trigger submissions_deadline
  before insert or update on public.submissions
  for each row execute function public.check_submission_deadline();
