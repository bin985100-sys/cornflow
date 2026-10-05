-- ---------------------------------------------------------------------------
-- 0020. Расписание: сетка звонков и расстановка групп по ячейкам.
--
-- Одна сетка на школу, одна расстановка — из них собирается и расписание
-- ученика, и расписание учителя. Два отдельных расписания неизбежно
-- разъехались бы.
--
-- Каникулы (0017) вырезаются при чтении, а не хранятся в расписании: даты
-- каникул двигают, и перестраивать из-за этого сетку никто не станет.
-- ---------------------------------------------------------------------------

-- 1. Сетка звонков -----------------------------------------------------------
-- Номер урока плюс время начала и конца. Ступень необязательна: у младшей
-- школы звонки часто свои, а если ступень не указана — сетка общая.
create table if not exists public.bell_slots (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  level       school_level,
  position    integer not null,
  starts_at   text not null,
  ends_at     text not null,
  created_at  timestamptz not null default now(),
  constraint bell_slots_position check (position between 0 and 20)
);
create index if not exists bell_slots_school_idx on public.bell_slots(school_id, level, position);

-- 2. Расстановка групп -------------------------------------------------------
-- Ячейка «день × номер урока» для курса. Период обязателен: расписание меняют
-- от четверти к четверти, и старое должно оставаться читаемым.
create table if not exists public.schedule_entries (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  assignment_id uuid not null references public.teaching_assignments(id) on delete cascade,
  term_id       uuid references public.school_terms(id) on delete cascade,
  -- 1 — понедельник, 7 — воскресенье
  weekday       integer not null,
  slot_id       uuid not null references public.bell_slots(id) on delete cascade,
  room          text,
  created_at    timestamptz not null default now(),
  constraint schedule_entries_weekday check (weekday between 1 and 7)
);
create index if not exists schedule_entries_school_idx
  on public.schedule_entries(school_id, term_id, weekday);
create index if not exists schedule_entries_assignment_idx
  on public.schedule_entries(assignment_id);

-- Одна группа не может стоять в одной ячейке дважды. Остальные накладки
-- (учитель или кабинет заняты) — не ошибка базы: школа иногда ставит их
-- сознательно, поэтому их показывает интерфейс, а не запрещает ограничение.
create unique index if not exists schedule_entries_unique
  on public.schedule_entries(assignment_id, weekday, slot_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- 3. Доступ: читает вся школа, ставит администратор
-- ---------------------------------------------------------------------------
alter table public.bell_slots        enable row level security;
alter table public.schedule_entries  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['bell_slots','schedule_entries']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using (public.is_school_member(school_id))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.is_school_admin(school_id)) '
      'with check (public.is_school_admin(school_id))', t, t);
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
-- 4. Готовая сетка звонков: восемь уроков по 45 минут с переменами
-- ---------------------------------------------------------------------------
create or replace function public.bell_preset(p_school uuid, p_first text default '08:30')
returns integer
language plpgsql security definer set search_path = public
as $fn$
declare
  i integer;
  start_min integer;
  cur integer;
  made integer := 0;
begin
  if not public.is_school_admin(p_school) then
    raise exception 'Только администратор школы';
  end if;

  start_min := split_part(p_first, ':', 1)::int * 60 + split_part(p_first, ':', 2)::int;
  for i in 0..7 loop
    -- после второго и четвёртого урока перемена длиннее: обед
    cur := start_min + i * 55 + (case when i >= 2 then 15 else 0 end) + (case when i >= 4 then 15 else 0 end);
    insert into public.bell_slots (school_id, position, starts_at, ends_at)
    values (
      p_school, i,
      to_char((cur || ' minutes')::interval, 'HH24:MI'),
      to_char(((cur + 45) || ' minutes')::interval, 'HH24:MI')
    );
    made := made + 1;
  end loop;
  return made;
end $fn$;

grant execute on function public.bell_preset(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['bell_slots','schedule_entries']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
