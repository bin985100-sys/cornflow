-- ===========================================================================
-- CornFlow · 0011 — школа: параллели, классы, люди, предметы, группы
--
-- Уровень «школа» стоит НАД пространствами. Пространство остаётся журналом
-- и библиотекой одного курса, а школа — это справочник, из которого курсы
-- собираются: кто учится, в каком классе, какие предметы и кто их ведёт.
--
-- Всё заводит администратор. Ученики и учителя получают логин и пароль,
-- аккаунты создаются серверной функцией school-accounts (service_role живёт
-- только в ней, в браузер не попадает).
--
-- Выполнять после 0010_dedup_gradebook.sql.
-- ===========================================================================

do $$ begin create type school_role as enum ('admin','teacher','student');
  exception when duplicate_object then null; end $$;
do $$ begin create type group_kind as enum ('class','mixed');
  exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Школа
-- ---------------------------------------------------------------------------
create table if not exists public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- код школы: его вводят на экране «Войти в школу» вместе с логином
  code        text not null unique,
  owner_id    uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists schools_owner_idx on public.schools(owner_id);

-- ---------------------------------------------------------------------------
-- Люди школы: администраторы, учителя, ученики
--
-- Одна таблица на всех — потому что логин, пароль и привязка аккаунта у них
-- устроены одинаково. Отличается только class_id, он есть у учеников.
-- user_id пустой, пока аккаунт не заведён.
-- ---------------------------------------------------------------------------
create table if not exists public.school_people (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  role         school_role not null default 'student',
  last_name    text not null default '',
  first_name   text not null default '',
  middle_name  text,
  -- логин для входа в школу, уникален внутри школы
  login        text,
  user_id      uuid references public.users(id) on delete set null,
  class_id     uuid,           -- ссылка добавляется ниже, после classes
  is_active    boolean not null default true,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists school_people_school_idx on public.school_people(school_id, role);
create index if not exists school_people_user_idx   on public.school_people(user_id);
create unique index if not exists school_people_login_uniq
  on public.school_people(school_id, lower(login)) where login is not null;
create unique index if not exists school_people_user_uniq
  on public.school_people(school_id, user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- Параллели. Название — что угодно: «9», «11», «Начальная школа».
-- ---------------------------------------------------------------------------
create table if not exists public.school_parallels (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists school_parallels_name_uniq
  on public.school_parallels(school_id, lower(name));

-- ---------------------------------------------------------------------------
-- Классы: параллель + литера или номер. Полное имя собирается в приложении:
-- параллель «9» + класс «А» => «9А».
-- ---------------------------------------------------------------------------
create table if not exists public.school_classes (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  parallel_id  uuid not null references public.school_parallels(id) on delete cascade,
  name         text not null,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
create unique index if not exists school_classes_name_uniq
  on public.school_classes(parallel_id, lower(name));
create index if not exists school_classes_school_idx on public.school_classes(school_id);

do $$ begin
  alter table public.school_people
    add constraint school_people_class_fk
    foreign key (class_id) references public.school_classes(id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists school_people_class_idx on public.school_people(class_id);

-- ---------------------------------------------------------------------------
-- Предметы: название, классы где предмет ведётся, типы оценивания
-- ---------------------------------------------------------------------------
create table if not exists public.school_subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  code        text,
  color       card_color not null default 'blue',
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists school_subjects_name_uniq
  on public.school_subjects(school_id, lower(name));

-- в каких классах предмет можно проводить
create table if not exists public.subject_classes (
  subject_id  uuid not null references public.school_subjects(id) on delete cascade,
  class_id    uuid not null references public.school_classes(id) on delete cascade,
  primary key (subject_id, class_id)
);
create index if not exists subject_classes_class_idx on public.subject_classes(class_id);

-- типы оценивания предмета: шаблон, который переносится в журнал курса
create table if not exists public.subject_assessment_types (
  id                   uuid primary key default gen_random_uuid(),
  subject_id           uuid not null references public.school_subjects(id) on delete cascade,
  name                 text not null,
  code                 text,
  weight               numeric not null default 1,
  color                card_color not null default 'blue',
  counts_toward_grade  boolean not null default true,
  position             integer not null default 0,
  created_at           timestamptz not null default now()
);
create unique index if not exists subject_assessment_types_name_uniq
  on public.subject_assessment_types(subject_id, lower(name));

-- ---------------------------------------------------------------------------
-- Группы. Два типа:
--   class — группа внутри класса или параллели (состав ограничен ими),
--   mixed — смешанная: любые ученики из любых классов и параллелей.
-- ---------------------------------------------------------------------------
create table if not exists public.school_groups (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  name         text not null,
  kind         group_kind not null default 'class',
  parallel_id  uuid references public.school_parallels(id) on delete set null,
  class_id     uuid references public.school_classes(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- группа класса обязана быть привязана к классу или к параллели
  constraint school_groups_scope check (
    kind = 'mixed' or parallel_id is not null or class_id is not null
  )
);
create index if not exists school_groups_school_idx on public.school_groups(school_id, kind);

create table if not exists public.group_members (
  group_id   uuid not null references public.school_groups(id) on delete cascade,
  person_id  uuid not null references public.school_people(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, person_id)
);
create index if not exists group_members_person_idx on public.group_members(person_id);

-- ---------------------------------------------------------------------------
-- Преподавание: предмет × группа × учитель. Отсюда вырастает пространство —
-- у каждого учителя своё на каждый предмет.
-- ---------------------------------------------------------------------------
create table if not exists public.teaching_assignments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  subject_id  uuid not null references public.school_subjects(id) on delete cascade,
  group_id    uuid not null references public.school_groups(id) on delete cascade,
  teacher_id  uuid references public.school_people(id) on delete set null,
  space_id    uuid references public.spaces(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists teaching_assignments_uniq
  on public.teaching_assignments(subject_id, group_id);
create index if not exists teaching_assignments_school_idx on public.teaching_assignments(school_id);
create index if not exists teaching_assignments_teacher_idx on public.teaching_assignments(teacher_id);

-- пространство знает, из какой школы и какого предмета оно выросло
alter table public.spaces add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table public.spaces add column if not exists subject_id uuid references public.school_subjects(id) on delete set null;
create index if not exists spaces_school_idx on public.spaces(school_id);

-- ---------------------------------------------------------------------------
-- Доступ. Справочник видят все люди школы, меняет только администратор.
-- ---------------------------------------------------------------------------
create or replace function public.is_school_member(p_school uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.schools s where s.id = p_school and s.owner_id = auth.uid()
  ) or exists (
    select 1 from public.school_people p
    where p.school_id = p_school and p.user_id = auth.uid()
  );
$$;

create or replace function public.is_school_admin(p_school uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.schools s where s.id = p_school and s.owner_id = auth.uid()
  ) or exists (
    select 1 from public.school_people p
    where p.school_id = p_school and p.user_id = auth.uid() and p.role = 'admin'
  );
$$;

alter table public.schools                  enable row level security;
alter table public.school_people            enable row level security;
alter table public.school_parallels         enable row level security;
alter table public.school_classes           enable row level security;
alter table public.school_subjects          enable row level security;
alter table public.subject_classes          enable row level security;
alter table public.subject_assessment_types enable row level security;
alter table public.school_groups            enable row level security;
alter table public.group_members            enable row level security;
alter table public.teaching_assignments     enable row level security;

drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools for select using (public.is_school_member(id));
drop policy if exists schools_insert on public.schools;
create policy schools_insert on public.schools for insert with check (owner_id = auth.uid());
drop policy if exists schools_write on public.schools;
create policy schools_write on public.schools for update using (public.is_school_admin(id))
  with check (public.is_school_admin(id));
drop policy if exists schools_delete on public.schools;
create policy schools_delete on public.schools for delete using (owner_id = auth.uid());

-- таблицы, привязанные к школе напрямую
do $$
declare t text;
begin
  foreach t in array array[
    'school_people','school_parallels','school_classes','school_subjects',
    'school_groups','teaching_assignments'
  ]
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using (public.is_school_member(school_id))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id))', t, t);
  end loop;
end $$;

-- связки: право наследуется от родителя
drop policy if exists subject_classes_read on public.subject_classes;
create policy subject_classes_read on public.subject_classes for select using (
  exists (select 1 from public.school_subjects s where s.id = subject_id and public.is_school_member(s.school_id))
);
drop policy if exists subject_classes_write on public.subject_classes;
create policy subject_classes_write on public.subject_classes for all using (
  exists (select 1 from public.school_subjects s where s.id = subject_id and public.is_school_admin(s.school_id))
) with check (
  exists (select 1 from public.school_subjects s where s.id = subject_id and public.is_school_admin(s.school_id))
);

drop policy if exists subject_assessment_types_read on public.subject_assessment_types;
create policy subject_assessment_types_read on public.subject_assessment_types for select using (
  exists (select 1 from public.school_subjects s where s.id = subject_id and public.is_school_member(s.school_id))
);
drop policy if exists subject_assessment_types_write on public.subject_assessment_types;
create policy subject_assessment_types_write on public.subject_assessment_types for all using (
  exists (select 1 from public.school_subjects s where s.id = subject_id and public.is_school_admin(s.school_id))
) with check (
  exists (select 1 from public.school_subjects s where s.id = subject_id and public.is_school_admin(s.school_id))
);

drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members for select using (
  exists (select 1 from public.school_groups g where g.id = group_id and public.is_school_member(g.school_id))
);
drop policy if exists group_members_write on public.group_members;
create policy group_members_write on public.group_members for all using (
  exists (select 1 from public.school_groups g where g.id = group_id and public.is_school_admin(g.school_id))
) with check (
  exists (select 1 from public.school_groups g where g.id = group_id and public.is_school_admin(g.school_id))
);

-- ---------------------------------------------------------------------------
-- Вход в школу: по коду школы и логину находим почту аккаунта.
-- Пароль здесь не проверяется — им занимается Supabase Auth. Функция только
-- переводит «код школы + логин» в служебный e-mail, под которым заведён
-- аккаунт, и ничего не рассказывает о том, существует ли такой логин.
-- ---------------------------------------------------------------------------
create or replace function public.school_login_email(p_code text, p_login text)
returns text
language sql stable security definer set search_path = public
as $$
  select u.email
  from public.school_people p
  join public.schools s on s.id = p.school_id
  join public.users u on u.id = p.user_id
  where upper(s.code) = upper(trim(p_code))
    and lower(p.login) = lower(trim(p_login))
    and p.is_active
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'schools','school_people','school_parallels','school_classes','school_subjects',
    'subject_classes','subject_assessment_types','school_groups','group_members',
    'teaching_assignments'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
