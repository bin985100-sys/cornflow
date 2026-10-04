-- ---------------------------------------------------------------------------
-- 0017. Фундамент школы. Четыре вещи, которые меняют схему, поэтому делаются
-- до всего остального: периоды, роли, уровни классов, принадлежность к МО.
-- ---------------------------------------------------------------------------

-- 1. Уровень класса ----------------------------------------------------------
do $$ begin create type school_level as enum ('primary','middle','senior');
exception when duplicate_object then null; end $$;

alter table public.school_classes
  add column if not exists level school_level;

-- 2. Учитель относится к МО --------------------------------------------------
alter table public.school_people
  add column if not exists department_id uuid references public.school_departments(id) on delete set null;
create index if not exists school_people_department_idx on public.school_people(department_id);

-- 3. Отчётные периоды школы --------------------------------------------------
-- Периоды журнала (grade_periods) живут внутри каждого курса и остаются как
-- есть. Здесь — общий календарь школы: учебный год, четверти, полугодия.
-- Группа привязывается к нему, и из него считаются своды оценок.
do $$ begin create type term_kind as enum ('year','semester','quarter');
exception when duplicate_object then null; end $$;

create table if not exists public.school_terms (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  -- год, в который вложены полугодия и четверти
  parent_id   uuid references public.school_terms(id) on delete cascade,
  kind        term_kind not null,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  position    integer not null default 0,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint school_terms_dates check (end_date >= start_date),
  -- год верхнего уровня, у четверти и полугодия родитель обязателен
  constraint school_terms_parent check (
    (kind = 'year' and parent_id is null) or (kind <> 'year' and parent_id is not null)
  )
);
create index if not exists school_terms_school_idx on public.school_terms(school_id, kind, position);
create index if not exists school_terms_parent_idx on public.school_terms(parent_id);

-- 4. Группа относится к отчётному периоду ------------------------------------
alter table public.school_groups
  add column if not exists term_id uuid references public.school_terms(id) on delete set null;
create index if not exists school_groups_term_idx on public.school_groups(term_id);

-- 5. Каникулы ----------------------------------------------------------------
-- Нужны уже сейчас: расписание строится по неделям, а каникулы вырезают из
-- него дни, и своды оценок не должны считать их пропусками.
create table if not exists public.school_holidays (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  constraint school_holidays_dates check (end_date >= start_date)
);
create index if not exists school_holidays_school_idx on public.school_holidays(school_id, start_date);

-- ---------------------------------------------------------------------------
-- 6. Несколько ролей у человека
--
-- Было: school_people.role — ровно одна роль. Остаётся на месте как основная,
-- чтобы ничего не сломать, но теперь это не единственная роль человека.
-- Добавляются родитель, классный руководитель и завуч.
-- ---------------------------------------------------------------------------
-- ALTER TYPE ... ADD VALUE нельзя вызвать из функции или DO-блока, поэтому
-- отдельными строками. IF NOT EXISTS делает повторный запуск безопасным.
alter type school_role add value if not exists 'parent';
alter type school_role add value if not exists 'homeroom';
alter type school_role add value if not exists 'headteacher';

create table if not exists public.person_roles (
  person_id   uuid not null references public.school_people(id) on delete cascade,
  role        school_role not null,
  created_at  timestamptz not null default now(),
  primary key (person_id, role)
);
create index if not exists person_roles_role_idx on public.person_roles(role);

-- переносим текущую единственную роль, чтобы данные не разъехались
insert into public.person_roles (person_id, role)
select p.id, p.role from public.school_people p
on conflict do nothing;

-- Классы, закреплённые за человеком: один у классного руководителя,
-- несколько у завуча. Одна таблица на обе роли — разница только в количестве.
create table if not exists public.person_classes (
  person_id   uuid not null references public.school_people(id) on delete cascade,
  class_id    uuid not null references public.school_classes(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (person_id, class_id)
);
create index if not exists person_classes_class_idx on public.person_classes(class_id);

-- Родитель и его дети. Детей может быть сколько угодно, и у ребёнка может
-- быть несколько родителей — поэтому связь многие-ко-многим.
create table if not exists public.parent_children (
  parent_id   uuid not null references public.school_people(id) on delete cascade,
  child_id    uuid not null references public.school_people(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (parent_id, child_id),
  constraint parent_children_distinct check (parent_id <> child_id)
);
create index if not exists parent_children_child_idx on public.parent_children(child_id);

-- ---------------------------------------------------------------------------
-- 7. Доступ
-- ---------------------------------------------------------------------------
alter table public.school_terms     enable row level security;
alter table public.school_holidays  enable row level security;
alter table public.person_roles     enable row level security;
alter table public.person_classes   enable row level security;
alter table public.parent_children  enable row level security;

-- привязанные к школе напрямую: читают все свои, меняет администратор
do $$
declare t text;
begin
  foreach t in array array['school_terms','school_holidays']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using (public.is_school_member(school_id))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.is_school_admin(school_id)) '
      'with check (public.is_school_admin(school_id))', t, t);
  end loop;
end $$;

-- связки вокруг человека: право наследуется от его школы
do $$
declare t text;
begin
  foreach t in array array['person_roles','person_classes']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using ('
      '  exists (select 1 from public.school_people p where p.id = person_id '
      '          and public.is_school_member(p.school_id)))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using ('
      '  exists (select 1 from public.school_people p where p.id = person_id '
      '          and public.is_school_admin(p.school_id))) with check ('
      '  exists (select 1 from public.school_people p where p.id = person_id '
      '          and public.is_school_admin(p.school_id)))', t, t);
  end loop;
end $$;

drop policy if exists parent_children_read on public.parent_children;
create policy parent_children_read on public.parent_children for select using (
  exists (select 1 from public.school_people p where p.id = parent_id and public.is_school_member(p.school_id))
);
drop policy if exists parent_children_write on public.parent_children;
create policy parent_children_write on public.parent_children for all using (
  exists (select 1 from public.school_people p where p.id = parent_id and public.is_school_admin(p.school_id))
) with check (
  exists (select 1 from public.school_people p where p.id = parent_id and public.is_school_admin(p.school_id))
);

-- главный админ платформы видит и правит это тоже
do $$
declare t text;
begin
  foreach t in array array['school_terms','school_holidays','person_roles','person_classes','parent_children']
  loop
    execute format('drop policy if exists %I_platform_read on public.%I', t, t);
    execute format(
      'create policy %I_platform_read on public.%I for select using (public.is_platform_admin())', t, t);
    execute format('drop policy if exists %I_platform_write on public.%I', t, t);
    execute format(
      'create policy %I_platform_write on public.%I for all '
      'using (public.is_platform_admin()) with check (public.is_platform_admin())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Удобства
-- ---------------------------------------------------------------------------

-- Все роли человека одной строкой: основная плюс добавленные.
create or replace function public.person_role_list(p_person uuid)
returns school_role[]
language sql stable security definer set search_path = public
as $fn$
  select array_agg(distinct r.role order by r.role)
  from (
    select role from public.person_roles where person_id = p_person
    union
    select role from public.school_people where id = p_person
  ) r;
$fn$;

-- Готовый учебный год: год, два полугодия и пять четвертей вместе с летней.
-- Админу остаётся поправить даты, а не заводить девять строк руками.
create or replace function public.school_term_preset(p_school uuid, p_year_start date)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  y_id uuid;
  y_end date := (p_year_start + interval '1 year' - interval '1 day')::date;
  h1 uuid; h2 uuid;
begin
  if not public.is_school_admin(p_school) then
    raise exception 'Только администратор школы';
  end if;

  insert into public.school_terms (school_id, kind, name, start_date, end_date, position, is_current)
  values (p_school, 'year', to_char(p_year_start, 'YYYY') || '/' ||
          to_char(y_end, 'YYYY'), p_year_start, y_end, 0, true)
  returning id into y_id;

  insert into public.school_terms (school_id, parent_id, kind, name, start_date, end_date, position)
  values (p_school, y_id, 'semester', 'I полугодие', p_year_start, (p_year_start + interval '4 months')::date, 0)
  returning id into h1;
  insert into public.school_terms (school_id, parent_id, kind, name, start_date, end_date, position)
  values (p_school, y_id, 'semester', 'II полугодие',
          (p_year_start + interval '4 months' + interval '1 day')::date, y_end, 1)
  returning id into h2;

  insert into public.school_terms (school_id, parent_id, kind, name, start_date, end_date, position)
  values
    (p_school, h1, 'quarter', 'I четверть',   p_year_start,
       (p_year_start + interval '2 months')::date, 0),
    (p_school, h1, 'quarter', 'II четверть',  (p_year_start + interval '2 months' + interval '1 day')::date,
       (p_year_start + interval '4 months')::date, 1),
    (p_school, h2, 'quarter', 'III четверть', (p_year_start + interval '4 months' + interval '1 day')::date,
       (p_year_start + interval '7 months')::date, 2),
    (p_school, h2, 'quarter', 'IV четверть',  (p_year_start + interval '7 months' + interval '1 day')::date,
       (p_year_start + interval '9 months')::date, 3),
    (p_school, h2, 'quarter', 'Летний период',(p_year_start + interval '9 months' + interval '1 day')::date,
       y_end, 4);

  return y_id;
end $fn$;

grant execute on function public.person_role_list(uuid) to authenticated;
grant execute on function public.school_term_preset(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['school_terms','school_holidays','person_roles','person_classes','parent_children']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
