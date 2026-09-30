-- ---------------------------------------------------------------------------
-- 0013. Три вещи:
--   1) МО — методические объединения. Предмет относится к одному МО:
--      «Алгебра», «Геометрия», «Математика» → МО «Математика».
--   2) Учителя группы. К группе прикрепляются не только ученики, но и
--      учителя, которые её ведут, и их может быть больше одного.
--   3) Учителя курса. Предмет × группа ведут один или несколько учителей;
--      журнал у них общий, иначе оценки одной группы разъехались бы по
--      двум журналам и в дневнике ученика предмет задвоился бы.
-- ---------------------------------------------------------------------------

-- 1. Методические объединения ------------------------------------------------
create table if not exists public.school_departments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  color       card_color not null default 'blue',
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists school_departments_name_uniq
  on public.school_departments(school_id, lower(name));

alter table public.school_subjects
  add column if not exists department_id uuid references public.school_departments(id) on delete set null;
create index if not exists school_subjects_department_idx on public.school_subjects(department_id);

-- 2. Учителя группы ----------------------------------------------------------
create table if not exists public.group_teachers (
  group_id   uuid not null references public.school_groups(id) on delete cascade,
  person_id  uuid not null references public.school_people(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, person_id)
);
create index if not exists group_teachers_person_idx on public.group_teachers(person_id);

-- 3. Учителя курса -----------------------------------------------------------
create table if not exists public.teaching_teachers (
  assignment_id uuid not null references public.teaching_assignments(id) on delete cascade,
  teacher_id    uuid not null references public.school_people(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (assignment_id, teacher_id)
);
create index if not exists teaching_teachers_teacher_idx on public.teaching_teachers(teacher_id);

-- переносим уже назначенных учителей в новую таблицу
insert into public.teaching_teachers (assignment_id, teacher_id)
select a.id, a.teacher_id
from public.teaching_assignments a
where a.teacher_id is not null
on conflict do nothing;

-- учитель курса автоматически считается и учителем группы
insert into public.group_teachers (group_id, person_id)
select a.group_id, a.teacher_id
from public.teaching_assignments a
where a.teacher_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Доступ
-- ---------------------------------------------------------------------------
alter table public.school_departments enable row level security;
alter table public.group_teachers     enable row level security;
alter table public.teaching_teachers  enable row level security;

drop policy if exists school_departments_read on public.school_departments;
create policy school_departments_read on public.school_departments for select
  using (public.is_school_member(school_id));
drop policy if exists school_departments_write on public.school_departments;
create policy school_departments_write on public.school_departments for all
  using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

drop policy if exists group_teachers_read on public.group_teachers;
create policy group_teachers_read on public.group_teachers for select using (
  exists (select 1 from public.school_groups g where g.id = group_id and public.is_school_member(g.school_id))
);
drop policy if exists group_teachers_write on public.group_teachers;
create policy group_teachers_write on public.group_teachers for all using (
  exists (select 1 from public.school_groups g where g.id = group_id and public.is_school_admin(g.school_id))
) with check (
  exists (select 1 from public.school_groups g where g.id = group_id and public.is_school_admin(g.school_id))
);

drop policy if exists teaching_teachers_read on public.teaching_teachers;
create policy teaching_teachers_read on public.teaching_teachers for select using (
  exists (select 1 from public.teaching_assignments a where a.id = assignment_id and public.is_school_member(a.school_id))
);
drop policy if exists teaching_teachers_write on public.teaching_teachers;
create policy teaching_teachers_write on public.teaching_teachers for all using (
  exists (select 1 from public.teaching_assignments a where a.id = assignment_id and public.is_school_admin(a.school_id))
) with check (
  exists (select 1 from public.teaching_assignments a where a.id = assignment_id and public.is_school_admin(a.school_id))
);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['school_departments','group_teachers','teaching_teachers']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
