-- ---------------------------------------------------------------------------
-- 0016. Главный админ может не только смотреть, но и вмешиваться.
--
-- Две разные задачи, и решаются они по-разному:
--
--   1. Модерация. Нашёл опасное или запрещённое — убрать из доступа и
--      сохранить доказательство. Материал не удаляется совсем: он прячется и
--      попадает в снимок инцидента, потому что удалённое нечем подтвердить,
--      если дойдёт до разбирательства.
--
--   2. Правка данных. Владелец платформы и так может менять что угодно через
--      SQL, поэтому вопрос не в том, дать или не дать, а в том, останется ли
--      след. Здесь след остаётся: триггеры пишут старое и новое значение в
--      platform_audit на уровне базы — мимо них не пройдёт ни интерфейс, ни
--      запрос из SQL-редактора.
-- ---------------------------------------------------------------------------

-- 1. Право на запись ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'spaces','space_members','folders','materials','material_tags',
    'assignments','submissions','tasks','progress','comments',
    'quizzes','quiz_questions','quiz_options','quiz_attempts',
    'grade_scales','grade_periods','grade_categories','grade_items','grades',
    'grade_criteria','criterion_scores','attendance',
    'lessons','lesson_statuses','lesson_priorities',
    'school_parallels','school_classes','school_departments','school_subjects',
    'subject_classes','subject_assessment_types','school_groups','group_members',
    'group_teachers','teaching_assignments','teaching_teachers'
  ]
  loop
    execute format('drop policy if exists %I_platform_write on public.%I', t, t);
    execute format(
      'create policy %I_platform_write on public.%I for all '
      'using (public.is_platform_admin()) with check (public.is_platform_admin())', t, t);
  end loop;
end $$;

-- 2. Скрытие вместо удаления -------------------------------------------------
alter table public.materials add column if not exists is_hidden boolean not null default false;
alter table public.materials add column if not exists hidden_reason text;
alter table public.materials add column if not exists hidden_at timestamptz;

alter table public.comments add column if not exists is_hidden boolean not null default false;
alter table public.comments add column if not exists hidden_reason text;
alter table public.comments add column if not exists hidden_at timestamptz;

-- 3. Инциденты: снимок содержимого на момент находки -------------------------
create table if not exists public.platform_incidents (
  id            uuid primary key default gen_random_uuid(),
  opened_by     uuid references public.users(id) on delete set null,
  kind          text not null default 'content',
  status        text not null default 'open',
  title         text not null,
  note          text,
  -- снимок: что именно нашли, чей, где и когда. Если оригинал потом удалят
  -- или поправят, здесь останется то, что было в момент находки.
  snapshot      jsonb not null default '{}'::jsonb,
  source_type   text,
  source_id     uuid,
  space_id      uuid references public.spaces(id) on delete set null,
  school_id     uuid references public.schools(id) on delete set null,
  author_id     uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);
create index if not exists platform_incidents_created_idx on public.platform_incidents(created_at desc);

alter table public.platform_incidents enable row level security;

drop policy if exists platform_incidents_read on public.platform_incidents;
create policy platform_incidents_read on public.platform_incidents for select
  using (public.is_platform_admin());
drop policy if exists platform_incidents_insert on public.platform_incidents;
create policy platform_incidents_insert on public.platform_incidents for insert
  with check (public.is_platform_admin() and opened_by = auth.uid());
-- статус менять можно, содержимое снимка — нет: для этого есть отдельный
-- триггер ниже, он возвращает snapshot к исходному при любой попытке правки
drop policy if exists platform_incidents_update on public.platform_incidents;
create policy platform_incidents_update on public.platform_incidents for update
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.platform_incident_freeze()
returns trigger language plpgsql as $$
begin
  new.snapshot   := old.snapshot;
  new.created_at := old.created_at;
  new.opened_by  := old.opened_by;
  return new;
end $$;

drop trigger if exists platform_incidents_freeze on public.platform_incidents;
create trigger platform_incidents_freeze before update on public.platform_incidents
  for each row execute function public.platform_incident_freeze();

-- 4. Триггеры аудита ---------------------------------------------------------
-- Пишем только то, что сделал главный админ: обычная работа учителей в журнал
-- платформы не попадает, иначе он превратится в шум и им перестанут пользоваться.
create or replace function public.platform_audit_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  before_v jsonb;
  after_v  jsonb;
begin
  if not public.is_platform_admin() then
    return coalesce(new, old);
  end if;

  before_v := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_v  := case when tg_op = 'DELETE' then null else to_jsonb(new) end;

  insert into public.platform_audit (actor_id, action, target_type, target_id, meta)
  values (
    auth.uid(),
    lower(tg_table_name) || '.' || lower(tg_op),
    tg_table_name,
    coalesce((after_v ->> 'id')::uuid, (before_v ->> 'id')::uuid),
    jsonb_build_object('before', before_v, 'after', after_v)
  );

  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'grades','grade_items','grade_categories','grade_scales','grade_periods',
    'attendance','materials','comments','assignments','submissions',
    'spaces','school_people','schools'
  ]
  loop
    execute format('drop trigger if exists %I_platform_audit on public.%I', t, t);
    execute format(
      'create trigger %I_platform_audit after insert or update or delete on public.%I '
      'for each row execute function public.platform_audit_change()', t, t);
  end loop;
end $$;

-- Журнал дописывается триггером от имени definer — политика на вставку должна
-- это разрешать, иначе собственные же записи не пройдут проверку.
drop policy if exists platform_audit_write on public.platform_audit;
create policy platform_audit_write on public.platform_audit for insert
  with check (public.is_platform_admin());

-- 5. Поиск по содержимому платформы ------------------------------------------
-- Одним запросом по материалам, конспектам, комментариям и заданиям. Нужен,
-- чтобы находить опасное содержимое, а не листать школы руками.
create or replace function public.platform_search(p_query text, p_limit int default 100)
returns table (
  kind        text,
  id          uuid,
  space_id    uuid,
  space_name  text,
  school_name text,
  author_id   uuid,
  author_name text,
  title       text,
  excerpt     text,
  is_hidden   boolean,
  created_at  timestamptz
)
language sql stable security definer set search_path = public
as $$
  with q as (select '%' || btrim(p_query) || '%' as like_pattern)
  select * from (
    select 'material'::text, m.id, m.space_id, s.name, sc.name, m.author_id, u.name,
           m.title,
           left(coalesce(m.description, '') || ' ' || coalesce(m.content, ''), 300),
           m.is_hidden, m.created_at
    from public.materials m
    join public.spaces s on s.id = m.space_id
    left join public.schools sc on sc.id = s.school_id
    left join public.users u on u.id = m.author_id, q
    where public.is_platform_admin()
      and (m.title ilike q.like_pattern
        or m.description ilike q.like_pattern
        or m.content ilike q.like_pattern
        or m.file_name ilike q.like_pattern)

    union all
    select 'comment'::text, c.id, c.space_id, s.name, sc.name, c.author_id, u.name,
           left(c.body, 80), left(c.body, 300), c.is_hidden, c.created_at
    from public.comments c
    join public.spaces s on s.id = c.space_id
    left join public.schools sc on sc.id = s.school_id
    left join public.users u on u.id = c.author_id, q
    where public.is_platform_admin() and c.body ilike q.like_pattern

    union all
    select 'assignment'::text, a.id, a.space_id, s.name, sc.name, null::uuid, null::text,
           a.title, left(coalesce(a.description, ''), 300), false, a.created_at
    from public.assignments a
    join public.spaces s on s.id = a.space_id
    left join public.schools sc on sc.id = s.school_id, q
    where public.is_platform_admin()
      and (a.title ilike q.like_pattern or a.description ilike q.like_pattern)
  ) found
  order by found.created_at desc
  limit greatest(1, least(p_limit, 500));
$$;

grant execute on function public.platform_search(text, int) to authenticated;

-- 6. Скрытое не видно обычным участникам -------------------------------------
-- Политики складываются по ИЛИ, поэтому просто добавить новую мало: нужно
-- сузить существующую. Переписываем её целиком, с той же логикой плюс
-- условие видимости.
drop policy if exists materials_select on public.materials;
create policy materials_select on public.materials for select using (
  (public.is_space_member(space_id) and not is_hidden)
  or public.is_platform_admin()
);

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select using (
  (public.is_space_member(space_id) and not is_hidden)
  or public.is_platform_admin()
);

-- Скрыть или вернуть материал. Пишет и в журнал, и в инцидент, если он указан.
create or replace function public.platform_hide_material(
  p_id uuid, p_hidden boolean, p_reason text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Только для главного администратора';
  end if;
  update public.materials
     set is_hidden = p_hidden,
         hidden_reason = case when p_hidden then p_reason else null end,
         hidden_at = case when p_hidden then now() else null end
   where id = p_id;
end $$;

create or replace function public.platform_hide_comment(
  p_id uuid, p_hidden boolean, p_reason text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Только для главного администратора';
  end if;
  update public.comments
     set is_hidden = p_hidden,
         hidden_reason = case when p_hidden then p_reason else null end,
         hidden_at = case when p_hidden then now() else null end
   where id = p_id;
end $$;

grant execute on function public.platform_hide_material(uuid, boolean, text) to authenticated;
grant execute on function public.platform_hide_comment(uuid, boolean, text) to authenticated;
