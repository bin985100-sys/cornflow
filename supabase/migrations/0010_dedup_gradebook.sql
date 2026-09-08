-- ===========================================================================
-- CornFlow · 0010 — убираем дубли справочников журнала и закрываем гонку
--
-- Первый заход в журнал заводит шкалу, периоды, типы работ и справочники
-- занятий. Проверка «пусто ли» и вставка шли двумя запросами, поэтому два
-- параллельных захода (перемонтирование хука, realtime-обновление) успевали
-- оба увидеть пустоту и оба вставить набор по умолчанию.
--
-- Здесь: схлопываем уже созданные дубли (ссылки переводим на самую раннюю
-- запись) и ставим уникальные индексы, чтобы повторная вставка была
-- невозможна на уровне базы.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Уровни важности занятий
-- ---------------------------------------------------------------------------
with keep as (
  select id, space_id, name,
         first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.lesson_priorities
)
update public.lessons l set priority_id = k.keep_id
from keep k where l.priority_id = k.id and k.id <> k.keep_id;

with keep as (
  select id, space_id, name,
         first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.lesson_priorities
)
update public.grade_categories c set default_priority_id = k.keep_id
from keep k where c.default_priority_id = k.id and k.id <> k.keep_id;

delete from public.lesson_priorities p using (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.lesson_priorities
) k where p.id = k.id and k.id <> k.keep_id;

-- ---------------------------------------------------------------------------
-- Статусы занятий
-- ---------------------------------------------------------------------------
with keep as (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.lesson_statuses
)
update public.lessons l set status_id = k.keep_id
from keep k where l.status_id = k.id and k.id <> k.keep_id;

delete from public.lesson_statuses s using (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.lesson_statuses
) k where s.id = k.id and k.id <> k.keep_id;

-- ---------------------------------------------------------------------------
-- Типы работ
-- ---------------------------------------------------------------------------
with keep as (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.grade_categories
)
update public.grade_items i set category_id = k.keep_id
from keep k where i.category_id = k.id and k.id <> k.keep_id;

with keep as (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.grade_categories
)
update public.lessons l set category_id = k.keep_id
from keep k where l.category_id = k.id and k.id <> k.keep_id;

delete from public.grade_categories c using (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.grade_categories
) k where c.id = k.id and k.id <> k.keep_id;

-- ---------------------------------------------------------------------------
-- Периоды
-- ---------------------------------------------------------------------------
with keep as (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.grade_periods
)
update public.grade_items i set period_id = k.keep_id
from keep k where i.period_id = k.id and k.id <> k.keep_id;

with keep as (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.grade_periods
)
update public.lessons l set period_id = k.keep_id
from keep k where l.period_id = k.id and k.id <> k.keep_id;

delete from public.grade_periods p using (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.grade_periods
) k where p.id = k.id and k.id <> k.keep_id;

-- ---------------------------------------------------------------------------
-- Шкалы
-- ---------------------------------------------------------------------------
with keep as (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.grade_scales
)
update public.grade_items i set scale_id = k.keep_id
from keep k where i.scale_id = k.id and k.id <> k.keep_id;

delete from public.grade_scales s using (
  select id, first_value(id) over (partition by space_id, name order by created_at, id) as keep_id
  from public.grade_scales
) k where s.id = k.id and k.id <> k.keep_id;

-- ---------------------------------------------------------------------------
-- Больше одинаковых имён в одном пространстве быть не может
-- ---------------------------------------------------------------------------
create unique index if not exists grade_categories_space_name on public.grade_categories(space_id, name);
create unique index if not exists grade_periods_space_name    on public.grade_periods(space_id, name);
create unique index if not exists grade_scales_space_name     on public.grade_scales(space_id, name);
create unique index if not exists lesson_statuses_space_name  on public.lesson_statuses(space_id, name);
create unique index if not exists lesson_priorities_space_name on public.lesson_priorities(space_id, name);
