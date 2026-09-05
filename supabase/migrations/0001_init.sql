-- ===========================================================================
-- CornFlow — начальная схема.
-- Выполните этот файл в SQL Editor проекта Supabase (или `supabase db push`).
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Перечисления
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_permission as enum ('view', 'edit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type material_type as enum
    ('document','pdf','presentation','video','link','image','audio','note','assignment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type card_color as enum ('red','yellow','green','blue','purple');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tag_color as enum ('blue','green','purple','orange','navy','teal','red');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_status as enum ('assigned','submitted','graded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type progress_status as enum ('viewed','studied');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  role        user_role not null default 'student',
  avatar      text,
  created_at  timestamptz not null default now()
);

create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  owner_id    uuid not null references public.users(id) on delete cascade,
  color       card_color not null default 'blue',
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id   uuid not null references public.spaces(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  permission member_permission not null default 'view',
  joined_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  parent_id  uuid references public.folders(id) on delete cascade,
  name       text not null,
  color      card_color not null default 'blue',
  created_at timestamptz not null default now()
);

create table if not exists public.materials (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  folder_id   uuid references public.folders(id) on delete set null,
  title       text not null,
  description text,
  type        material_type not null default 'document',
  file_url    text,          -- 'storage:<path>' для файлов из Storage, либо внешний URL
  file_name   text,
  file_size   bigint,
  mime_type   text,
  content     text,          -- HTML конспекта (type = 'note')
  color       card_color not null default 'blue',
  author_id   uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tags (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique,
  color tag_color not null default 'blue',
  icon  text not null default 'Hash'
);

create table if not exists public.material_tags (
  material_id uuid not null references public.materials(id) on delete cascade,
  tag_id      uuid not null references public.tags(id) on delete cascade,
  primary key (material_id, tag_id)
);

create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  title       text not null,
  description text,
  due_date    timestamptz,
  attachments uuid[] not null default '{}',
  author_id   uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id    uuid not null references public.users(id) on delete cascade,
  status        submission_status not null default 'assigned',
  comment       text,
  attachments   uuid[] not null default '{}',
  grade         int,
  submitted_at  timestamptz,
  unique (assignment_id, student_id)
);

create table if not exists public.starred (
  user_id     uuid not null references public.users(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, material_id)
);

create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  space_id   uuid references public.spaces(id) on delete set null,
  title      text not null,
  done       boolean not null default false,
  due_date   timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.progress (
  user_id     uuid not null references public.users(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  status      progress_status not null default 'viewed',
  updated_at  timestamptz not null default now(),
  primary key (user_id, material_id)
);

-- ---------------------------------------------------------------------------
-- Индексы
-- ---------------------------------------------------------------------------
create index if not exists idx_materials_space      on public.materials(space_id);
create index if not exists idx_materials_folder     on public.materials(folder_id);
create index if not exists idx_materials_created    on public.materials(created_at desc);
create index if not exists idx_folders_space        on public.folders(space_id);
create index if not exists idx_assignments_space    on public.assignments(space_id);
create index if not exists idx_assignments_due      on public.assignments(due_date);
create index if not exists idx_submissions_asg      on public.submissions(assignment_id);
create index if not exists idx_space_members_user   on public.space_members(user_id);
create index if not exists idx_tasks_user           on public.tasks(user_id);

-- Полнотекстовый поиск по названию, описанию и содержимому конспектов
create index if not exists idx_materials_search on public.materials
  using gin (to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(content,'')));

-- ---------------------------------------------------------------------------
-- Профиль создаётся автоматически при регистрации в auth
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, name, email, role, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'student'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Вспомогательные функции доступа (security definer — чтобы не ловить
-- рекурсию политик при обращении к space_members изнутри политик)
-- ---------------------------------------------------------------------------
create or replace function public.is_space_member(p_space uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_space(p_space uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space and m.user_id = auth.uid() and m.permission = 'edit'
  );
$$;

create or replace function public.is_space_owner(p_space uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space and s.owner_id = auth.uid()
  );
$$;

-- Вход в пространство по коду приглашения
create or replace function public.join_space_by_code(p_code text)
returns public.spaces
language plpgsql security definer set search_path = public
as $$
declare
  s public.spaces;
  r user_role;
begin
  select * into s from public.spaces where upper(invite_code) = upper(p_code);
  if not found then
    raise exception 'Пространство с таким кодом не найдено';
  end if;

  select role into r from public.users where id = auth.uid();

  insert into public.space_members (space_id, user_id, permission)
  values (s.id, auth.uid(), case when r = 'teacher' then 'edit'::member_permission else 'view'::member_permission end)
  on conflict (space_id, user_id) do nothing;

  return s;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.users         enable row level security;
alter table public.spaces        enable row level security;
alter table public.space_members enable row level security;
alter table public.folders       enable row level security;
alter table public.materials     enable row level security;
alter table public.tags          enable row level security;
alter table public.material_tags enable row level security;
alter table public.assignments   enable row level security;
alter table public.submissions   enable row level security;
alter table public.starred       enable row level security;
alter table public.tasks         enable row level security;
alter table public.progress      enable row level security;

-- users: видно себя и всех, с кем есть общее пространство
drop policy if exists users_select on public.users;
create policy users_select on public.users for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.space_members me
    join public.space_members other on other.space_id = me.space_id
    where me.user_id = auth.uid() and other.user_id = public.users.id
  )
);

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users for insert with check (id = auth.uid());

-- spaces
drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces for select using (public.is_space_member(id) or owner_id = auth.uid());

drop policy if exists spaces_insert on public.spaces;
create policy spaces_insert on public.spaces for insert with check (owner_id = auth.uid());

drop policy if exists spaces_update on public.spaces;
create policy spaces_update on public.spaces for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists spaces_delete on public.spaces;
create policy spaces_delete on public.spaces for delete using (owner_id = auth.uid());

-- space_members
drop policy if exists members_select on public.space_members;
create policy members_select on public.space_members for select using (
  user_id = auth.uid() or public.is_space_member(space_id)
);

drop policy if exists members_insert on public.space_members;
create policy members_insert on public.space_members for insert with check (
  user_id = auth.uid() or public.is_space_owner(space_id)
);

drop policy if exists members_update on public.space_members;
create policy members_update on public.space_members for update using (public.is_space_owner(space_id));

drop policy if exists members_delete on public.space_members;
create policy members_delete on public.space_members for delete using (
  user_id = auth.uid() or public.is_space_owner(space_id)
);

-- folders
drop policy if exists folders_select on public.folders;
create policy folders_select on public.folders for select using (public.is_space_member(space_id));

drop policy if exists folders_write on public.folders;
create policy folders_write on public.folders for all
  using (public.can_edit_space(space_id))
  with check (public.can_edit_space(space_id));

-- materials
drop policy if exists materials_select on public.materials;
create policy materials_select on public.materials for select using (public.is_space_member(space_id));

drop policy if exists materials_insert on public.materials;
create policy materials_insert on public.materials for insert
  with check (public.can_edit_space(space_id) and author_id = auth.uid());

drop policy if exists materials_update on public.materials;
create policy materials_update on public.materials for update
  using (public.can_edit_space(space_id)) with check (public.can_edit_space(space_id));

drop policy if exists materials_delete on public.materials;
create policy materials_delete on public.materials for delete
  using (author_id = auth.uid() or public.is_space_owner(space_id));

-- tags — общий словарь: читают все, создают авторизованные, удаляют только их авторы-учителя
drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags for select using (auth.uid() is not null);

drop policy if exists tags_insert on public.tags;
create policy tags_insert on public.tags for insert with check (auth.uid() is not null);

drop policy if exists tags_delete on public.tags;
create policy tags_delete on public.tags for delete using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'teacher')
);

-- material_tags
drop policy if exists material_tags_select on public.material_tags;
create policy material_tags_select on public.material_tags for select using (
  exists (select 1 from public.materials m where m.id = material_id and public.is_space_member(m.space_id))
);

drop policy if exists material_tags_write on public.material_tags;
create policy material_tags_write on public.material_tags for all
  using (exists (select 1 from public.materials m where m.id = material_id and public.can_edit_space(m.space_id)))
  with check (exists (select 1 from public.materials m where m.id = material_id and public.can_edit_space(m.space_id)));

-- assignments
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select using (public.is_space_member(space_id));

drop policy if exists assignments_write on public.assignments;
create policy assignments_write on public.assignments for all
  using (public.can_edit_space(space_id))
  with check (public.can_edit_space(space_id));

-- submissions: ученик видит и правит свои, редакторы пространства — все
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions for select using (
  student_id = auth.uid()
  or exists (select 1 from public.assignments a where a.id = assignment_id and public.can_edit_space(a.space_id))
);

drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions for insert with check (
  student_id = auth.uid()
  and exists (select 1 from public.assignments a where a.id = assignment_id and public.is_space_member(a.space_id))
);

drop policy if exists submissions_update on public.submissions;
create policy submissions_update on public.submissions for update using (
  student_id = auth.uid()
  or exists (select 1 from public.assignments a where a.id = assignment_id and public.can_edit_space(a.space_id))
);

drop policy if exists submissions_delete on public.submissions;
create policy submissions_delete on public.submissions for delete using (student_id = auth.uid());

-- starred / tasks / progress — строго личные
drop policy if exists starred_own on public.starred;
create policy starred_own on public.starred for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists tasks_own on public.tasks;
create policy tasks_own on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- прогресс: свой — читаем и пишем; редакторы пространства видят прогресс учеников
drop policy if exists progress_select on public.progress;
create policy progress_select on public.progress for select using (
  user_id = auth.uid()
  or exists (select 1 from public.materials m where m.id = material_id and public.can_edit_space(m.space_id))
);

drop policy if exists progress_write on public.progress;
create policy progress_write on public.progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: приватный бакет для файлов материалов.
-- Путь файла — <space_id>/<uuid>-<имя>, поэтому доступ проверяется по
-- первому сегменту пути.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 104857600)
on conflict (id) do nothing;

drop policy if exists materials_storage_read on storage.objects;
create policy materials_storage_read on storage.objects for select using (
  bucket_id = 'materials' and public.is_space_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists materials_storage_write on storage.objects;
create policy materials_storage_write on storage.objects for insert with check (
  bucket_id = 'materials' and public.can_edit_space(((storage.foldername(name))[1])::uuid)
);

drop policy if exists materials_storage_delete on storage.objects;
create policy materials_storage_delete on storage.objects for delete using (
  bucket_id = 'materials' and public.can_edit_space(((storage.foldername(name))[1])::uuid)
);

-- ---------------------------------------------------------------------------
-- Realtime: публикуем таблицы, которые слушает клиент
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['materials','folders','assignments','submissions','tasks','spaces','tags','progress','starred']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
