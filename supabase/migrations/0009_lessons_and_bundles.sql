-- ===========================================================================
-- CornFlow · 0009 — уроки, настраиваемые справочники и наборы пространств
--
--  * уроки: к ним привязываются задания и работы журнала;
--  * статусы занятий и уровни важности — настраиваемые справочники,
--    ничего не зашито в код;
--  * типы работ получают код (SA / FA / …), важность по умолчанию и флаг
--    «учитывать в среднем балле»;
--  * наборы пространств: один код открывает доступ сразу к нескольким
--    пространствам, в том числе с других аккаунтов.
--
-- Выполнять после 0008_criteria.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Справочник статусов занятия
-- ---------------------------------------------------------------------------
create table if not exists public.lesson_statuses (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  name        text not null,
  color       card_color not null default 'blue',
  is_held     boolean not null default false,
  is_default  boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists lesson_statuses_space_idx on public.lesson_statuses(space_id, position);
create unique index if not exists lesson_statuses_one_default
  on public.lesson_statuses(space_id) where is_default;

-- ---------------------------------------------------------------------------
-- Справочник уровней важности
-- ---------------------------------------------------------------------------
create table if not exists public.lesson_priorities (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  name        text not null,
  color       card_color not null default 'blue',
  rank        integer not null default 0,
  is_default  boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists lesson_priorities_space_idx on public.lesson_priorities(space_id, rank desc);
create unique index if not exists lesson_priorities_one_default
  on public.lesson_priorities(space_id) where is_default;

-- ---------------------------------------------------------------------------
-- Типы работ: код, важность по умолчанию, участие в среднем балле
-- ---------------------------------------------------------------------------
alter table public.grade_categories
  add column if not exists code text,
  add column if not exists default_priority_id uuid references public.lesson_priorities(id) on delete set null,
  add column if not exists counts_toward_grade boolean not null default true,
  add column if not exists position integer not null default 0;

-- ---------------------------------------------------------------------------
-- Занятия
-- ---------------------------------------------------------------------------
create table if not exists public.lessons (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  period_id     uuid references public.grade_periods(id) on delete set null,
  category_id   uuid references public.grade_categories(id) on delete set null,
  status_id     uuid references public.lesson_statuses(id) on delete set null,
  priority_id   uuid references public.lesson_priorities(id) on delete set null,
  title         text not null,
  topic         text,
  date          date not null default current_date,
  starts_at     text,
  duration_min  integer,
  homework      text,
  notes         text,
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists lessons_space_idx on public.lessons(space_id, date);
create index if not exists lessons_period_idx on public.lessons(period_id);

-- Работы журнала и задания привязываются к занятию
alter table public.grade_items add column if not exists lesson_id uuid references public.lessons(id) on delete set null;
alter table public.assignments add column if not exists lesson_id uuid references public.lessons(id) on delete set null;
create index if not exists grade_items_lesson_idx on public.grade_items(lesson_id);
create index if not exists assignments_lesson_idx on public.assignments(lesson_id);

-- ---------------------------------------------------------------------------
-- RLS для занятий и справочников: читают участники, меняют редакторы
-- ---------------------------------------------------------------------------
alter table public.lessons           enable row level security;
alter table public.lesson_statuses   enable row level security;
alter table public.lesson_priorities enable row level security;

do $$
declare t text;
begin
  foreach t in array array['lessons','lesson_statuses','lesson_priorities']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using (public.is_space_member(space_id))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.can_edit_space(space_id)) with check (public.can_edit_space(space_id))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Наборы пространств: один код на несколько пространств
-- ---------------------------------------------------------------------------
create table if not exists public.space_bundles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  code         text not null unique,
  owner_id     uuid not null references public.users(id) on delete cascade,
  permission   member_permission not null default 'view',
  created_at   timestamptz not null default now()
);
create index if not exists space_bundles_owner_idx on public.space_bundles(owner_id);

create table if not exists public.bundle_spaces (
  bundle_id  uuid not null references public.space_bundles(id) on delete cascade,
  space_id   uuid not null references public.spaces(id) on delete cascade,
  added_by   uuid references public.users(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (bundle_id, space_id)
);
create index if not exists bundle_spaces_space_idx on public.bundle_spaces(space_id);

alter table public.space_bundles enable row level security;
alter table public.bundle_spaces enable row level security;

-- Набор видит владелец и тот, чьё пространство в него добавлено
drop policy if exists space_bundles_read on public.space_bundles;
create policy space_bundles_read on public.space_bundles for select using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.bundle_spaces bs
    where bs.bundle_id = space_bundles.id and public.is_space_member(bs.space_id)
  )
);

drop policy if exists space_bundles_write on public.space_bundles;
create policy space_bundles_write on public.space_bundles for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists bundle_spaces_read on public.bundle_spaces;
create policy bundle_spaces_read on public.bundle_spaces for select using (
  public.is_space_member(space_id)
  or exists (select 1 from public.space_bundles b where b.id = bundle_id and b.owner_id = auth.uid())
);

-- Ключевое правило: добавить пространство в набор может только тот,
-- кто вправе это пространство редактировать. Иначе чужой доступ раздавался бы
-- без ведома владельца.
drop policy if exists bundle_spaces_insert on public.bundle_spaces;
create policy bundle_spaces_insert on public.bundle_spaces for insert
  with check (public.can_edit_space(space_id));

drop policy if exists bundle_spaces_delete on public.bundle_spaces;
create policy bundle_spaces_delete on public.bundle_spaces for delete using (
  public.can_edit_space(space_id)
  or exists (select 1 from public.space_bundles b where b.id = bundle_id and b.owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- Вход по коду набора: вступаем во все пространства сразу
-- ---------------------------------------------------------------------------
create or replace function public.join_bundle_by_code(p_code text)
returns public.spaces
language plpgsql security definer set search_path = public
as $$
declare
  v_bundle public.space_bundles;
  v_space  public.spaces;
  v_first  public.spaces;
begin
  select * into v_bundle from public.space_bundles where upper(code) = upper(p_code);
  if v_bundle.id is null then
    return null;
  end if;

  for v_space in
    select s.* from public.spaces s
    join public.bundle_spaces bs on bs.space_id = s.id
    where bs.bundle_id = v_bundle.id
    order by s.created_at
  loop
    if v_first.id is null then
      v_first := v_space;
    end if;
    insert into public.space_members (space_id, user_id, permission)
    values (v_space.id, auth.uid(), v_bundle.permission)
    on conflict (space_id, user_id) do nothing;
  end loop;

  return v_first;
end $$;

-- ---------------------------------------------------------------------------
-- Подключить своё пространство к чужому набору по его коду.
-- Право на само пространство проверяется здесь же — функция не даёт
-- добавить то, что тебе не принадлежит.
-- ---------------------------------------------------------------------------
create or replace function public.attach_space_to_bundle(p_code text, p_space uuid)
returns public.space_bundles
language plpgsql security definer set search_path = public
as $$
declare v_bundle public.space_bundles;
begin
  if not public.can_edit_space(p_space) then
    raise exception 'Нет прав на это пространство';
  end if;

  select * into v_bundle from public.space_bundles where upper(code) = upper(p_code);
  if v_bundle.id is null then
    return null;
  end if;

  insert into public.bundle_spaces (bundle_id, space_id, added_by)
  values (v_bundle.id, p_space, auth.uid())
  on conflict (bundle_id, space_id) do nothing;

  return v_bundle;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lessons','lesson_statuses','lesson_priorities','space_bundles','bundle_spaces']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
