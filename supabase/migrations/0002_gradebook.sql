-- ===========================================================================
-- CornFlow · 0002 — журнал оценок
-- Пространство остаётся библиотекой материалов и одновременно становится
-- школьным дневником: шкалы, периоды, категории работ, оценки, посещаемость.
-- Выполнять после 0001_init.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Типы
-- ---------------------------------------------------------------------------
do $$ begin create type scale_kind as enum ('points','levels'); exception when duplicate_object then null; end $$;
do $$ begin create type grade_flag as enum ('none','absent','excused','pending'); exception when duplicate_object then null; end $$;
do $$ begin create type attendance_status as enum ('present','late','absent','excused'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Шкалы оценивания. levels — массив уровней:
-- [{ "id":"…", "label":"5", "min_percent":90, "value":5, "color":"green" }]
-- ---------------------------------------------------------------------------
create table if not exists public.grade_scales (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.spaces(id) on delete cascade,
  name             text not null,
  kind             scale_kind not null default 'points',
  min_value        numeric not null default 0,
  max_value        numeric not null default 5,
  levels           jsonb not null default '[]'::jsonb,
  passing_percent  numeric not null default 50,
  is_default       boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists grade_scales_space_idx on public.grade_scales(space_id);
create unique index if not exists grade_scales_one_default
  on public.grade_scales(space_id) where is_default;

-- ---------------------------------------------------------------------------
-- Учебные периоды (четверти, семестры, модули)
-- ---------------------------------------------------------------------------
create table if not exists public.grade_periods (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists grade_periods_space_idx on public.grade_periods(space_id, start_date);
create unique index if not exists grade_periods_one_current
  on public.grade_periods(space_id) where is_current;

-- ---------------------------------------------------------------------------
-- Категории работ с весами
-- ---------------------------------------------------------------------------
create table if not exists public.grade_categories (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  name        text not null,
  weight      numeric not null default 1,
  color       card_color not null default 'blue',
  created_at  timestamptz not null default now()
);
create index if not exists grade_categories_space_idx on public.grade_categories(space_id);

-- ---------------------------------------------------------------------------
-- Колонки журнала — конкретные работы
-- ---------------------------------------------------------------------------
create table if not exists public.grade_items (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces(id) on delete cascade,
  period_id      uuid references public.grade_periods(id) on delete set null,
  category_id    uuid references public.grade_categories(id) on delete set null,
  assignment_id  uuid references public.assignments(id) on delete set null,
  title          text not null,
  date           date not null default current_date,
  max_score      numeric not null default 5,
  weight         numeric not null default 1,
  scale_id       uuid references public.grade_scales(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists grade_items_space_idx on public.grade_items(space_id, date);
create index if not exists grade_items_period_idx on public.grade_items(period_id);
create index if not exists grade_items_assignment_idx on public.grade_items(assignment_id);

-- ---------------------------------------------------------------------------
-- Оценки
-- ---------------------------------------------------------------------------
create table if not exists public.grades (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.grade_items(id) on delete cascade,
  student_id  uuid not null references public.users(id) on delete cascade,
  score       numeric,
  flag        grade_flag not null default 'none',
  comment     text,
  graded_by   uuid references public.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (item_id, student_id)
);
create index if not exists grades_item_idx on public.grades(item_id);
create index if not exists grades_student_idx on public.grades(student_id);

-- ---------------------------------------------------------------------------
-- Посещаемость
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  student_id  uuid not null references public.users(id) on delete cascade,
  date        date not null,
  status      attendance_status not null default 'present',
  note        text,
  created_at  timestamptz not null default now(),
  unique (space_id, student_id, date)
);
create index if not exists attendance_space_idx on public.attendance(space_id, date);

-- ---------------------------------------------------------------------------
-- Вспомогательная функция: пространство работы (для политик по grades)
-- ---------------------------------------------------------------------------
create or replace function public.grade_item_space(p_item uuid)
returns uuid
language sql stable security definer set search_path = public
as $$ select space_id from public.grade_items where id = p_item $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.grade_scales     enable row level security;
alter table public.grade_periods    enable row level security;
alter table public.grade_categories enable row level security;
alter table public.grade_items      enable row level security;
alter table public.grades           enable row level security;
alter table public.attendance       enable row level security;

-- Справочники журнала: читают все участники, меняют — редакторы пространства
do $$
declare t text;
begin
  foreach t in array array['grade_scales','grade_periods','grade_categories','grade_items']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using (public.is_space_member(space_id))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.can_edit_space(space_id)) with check (public.can_edit_space(space_id))', t, t);
  end loop;
end $$;

-- Оценки: ученик видит только свои, редактор — все оценки пространства
drop policy if exists grades_read on public.grades;
create policy grades_read on public.grades for select using (
  student_id = auth.uid() or public.can_edit_space(public.grade_item_space(item_id))
);

drop policy if exists grades_write on public.grades;
create policy grades_write on public.grades for all
  using (public.can_edit_space(public.grade_item_space(item_id)))
  with check (public.can_edit_space(public.grade_item_space(item_id)));

-- Посещаемость: та же логика
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select using (
  student_id = auth.uid() or public.can_edit_space(space_id)
);

drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance for all
  using (public.can_edit_space(space_id))
  with check (public.can_edit_space(space_id));

-- ---------------------------------------------------------------------------
-- Перенос оценки за задание в журнал: как только учитель ставит оценку
-- в submissions, она попадает в колонку журнала, связанную с этим заданием.
-- ---------------------------------------------------------------------------
create or replace function public.sync_submission_grade()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_item uuid;
begin
  if new.grade is null then
    return new;
  end if;

  select id into v_item from public.grade_items where assignment_id = new.assignment_id limit 1;
  if v_item is null then
    return new;
  end if;

  insert into public.grades (item_id, student_id, score, flag, graded_by, updated_at)
  values (v_item, new.student_id, new.grade, 'none', auth.uid(), now())
  on conflict (item_id, student_id)
  do update set score = excluded.score, flag = 'none', updated_at = now();

  return new;
end $$;

drop trigger if exists submissions_grade_sync on public.submissions;
create trigger submissions_grade_sync
  after insert or update of grade on public.submissions
  for each row execute function public.sync_submission_grade();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['grade_scales','grade_periods','grade_categories','grade_items','grades','attendance']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
