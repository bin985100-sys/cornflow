-- ---------------------------------------------------------------------------
-- 0018. КТП: типы уроков, темы, плановые уроки с теорией и заданием.
--
-- КТП — своё у каждого учителя. Чужое можно взять за основу: копия, а не
-- ссылка, иначе правки одного учителя поедут у всех.
--
-- Привязывается к курсу (teaching_assignments = группа + предмет + учителя),
-- потому что у одной группы бывает несколько предметов. В интерфейсе это
-- по-прежнему «группа», просто внутри предмета.
-- ---------------------------------------------------------------------------

-- 1. Типы уроков -------------------------------------------------------------
-- Справочник школы, а не захардкоженный список: «Лекция», «Практикум»,
-- «Контрольная» — каждая школа называет по-своему.
create table if not exists public.lesson_kinds (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  color       text not null default 'blue',
  -- урок этого типа идёт в счёт часов по теме
  counts_hours boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists lesson_kinds_school_idx on public.lesson_kinds(school_id, position);

-- 2. КТП ---------------------------------------------------------------------
create table if not exists public.curricula (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  subject_id  uuid references public.school_subjects(id) on delete set null,
  -- владелец: учитель, который его ведёт. Правит только он и администратор.
  owner_id    uuid references public.school_people(id) on delete set null,
  name        text not null,
  description text,
  -- заведено автоматически под курс, у которого КТП не было
  is_auto     boolean not null default false,
  -- откуда скопировано, если брали чужое за основу
  source_id   uuid references public.curricula(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists curricula_school_idx on public.curricula(school_id, subject_id);
create index if not exists curricula_owner_idx on public.curricula(owner_id);

-- 3. Темы и плановые уроки ---------------------------------------------------
create table if not exists public.curriculum_topics (
  id            uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  name          text not null,
  -- сколько часов планируется на тему; факт считается по урокам
  hours         integer,
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists curriculum_topics_idx on public.curriculum_topics(curriculum_id, position);

create table if not exists public.curriculum_lessons (
  id            uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  -- урок вне тем допустим: не каждый план разложен по темам
  topic_id      uuid references public.curriculum_topics(id) on delete set null,
  kind_id       uuid references public.lesson_kinds(id) on delete set null,
  title         text not null,
  -- то, что объясняется на уроке
  theory        text,
  -- то, что делают на уроке; домашнее задание живёт в самом уроке
  task          text,
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists curriculum_lessons_idx on public.curriculum_lessons(curriculum_id, position);
create index if not exists curriculum_lessons_topic_idx on public.curriculum_lessons(topic_id);

-- 4. Связь с курсом и с фактическим уроком -----------------------------------
alter table public.teaching_assignments
  add column if not exists curriculum_id uuid references public.curricula(id) on delete set null;
create index if not exists teaching_assignments_curriculum_idx
  on public.teaching_assignments(curriculum_id);

alter table public.lessons
  add column if not exists curriculum_lesson_id uuid references public.curriculum_lessons(id) on delete set null,
  add column if not exists theory text,
  add column if not exists task text,
  -- срок сдачи домашнего задания
  add column if not exists homework_due date;
create index if not exists lessons_curriculum_lesson_idx on public.lessons(curriculum_lesson_id);

-- ---------------------------------------------------------------------------
-- 5. Доступ
--
-- Читает вся школа: учитель должен видеть чужое КТП, чтобы взять за основу.
-- Правит владелец и администратор школы.
-- ---------------------------------------------------------------------------
alter table public.lesson_kinds        enable row level security;
alter table public.curricula           enable row level security;
alter table public.curriculum_topics   enable row level security;
alter table public.curriculum_lessons  enable row level security;

drop policy if exists lesson_kinds_read on public.lesson_kinds;
create policy lesson_kinds_read on public.lesson_kinds for select
  using (public.is_school_member(school_id));
drop policy if exists lesson_kinds_write on public.lesson_kinds;
create policy lesson_kinds_write on public.lesson_kinds for all
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

drop policy if exists curricula_read on public.curricula;
create policy curricula_read on public.curricula for select
  using (public.is_school_member(school_id));

-- владелец определяется через school_people: это тот же человек, что вошёл
drop policy if exists curricula_write on public.curricula;
create policy curricula_write on public.curricula for all using (
  public.is_school_admin(school_id)
  or exists (
    select 1 from public.school_people p
    where p.id = owner_id and p.user_id = auth.uid()
  )
) with check (
  public.is_school_admin(school_id)
  or exists (
    select 1 from public.school_people p
    where p.id = owner_id and p.user_id = auth.uid()
  )
);

-- темы и плановые уроки наследуют право от своего КТП
do $$
declare t text;
begin
  foreach t in array array['curriculum_topics','curriculum_lessons']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using ('
      '  exists (select 1 from public.curricula c where c.id = curriculum_id '
      '          and public.is_school_member(c.school_id)))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using ('
      '  exists (select 1 from public.curricula c where c.id = curriculum_id and ('
      '    public.is_school_admin(c.school_id) or exists ('
      '      select 1 from public.school_people p where p.id = c.owner_id and p.user_id = auth.uid())))) '
      'with check ('
      '  exists (select 1 from public.curricula c where c.id = curriculum_id and ('
      '    public.is_school_admin(c.school_id) or exists ('
      '      select 1 from public.school_people p where p.id = c.owner_id and p.user_id = auth.uid()))))',
      t, t);
  end loop;
end $$;

-- главный админ платформы
do $$
declare t text;
begin
  foreach t in array array['lesson_kinds','curricula','curriculum_topics','curriculum_lessons']
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
-- 6. Удобства
-- ---------------------------------------------------------------------------

-- Копия чужого КТП вместе с темами и уроками: новый владелец правит её
-- свободно, оригинал не трогается.
create or replace function public.curriculum_copy(p_source uuid, p_owner uuid, p_name text default null)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  src public.curricula%rowtype;
  topic public.curriculum_topics%rowtype;
  new_topic uuid;
  new_id uuid;
begin
  select * into src from public.curricula where id = p_source;
  if not found then raise exception 'КТП не найдено'; end if;
  if not public.is_school_member(src.school_id) then
    raise exception 'Нет доступа к этой школе';
  end if;

  insert into public.curricula (school_id, subject_id, owner_id, name, description, source_id)
  values (src.school_id, src.subject_id, p_owner,
          coalesce(p_name, src.name || ' (копия)'), src.description, src.id)
  returning id into new_id;

  -- Темы копируем по одной и сразу тащим за собой их уроки: так соответствие
  -- «старая тема → новая» известно точно, без догадок по позициям.
  for topic in
    select * from public.curriculum_topics
    where curriculum_id = p_source order by position
  loop
    insert into public.curriculum_topics (curriculum_id, name, hours, position)
    values (new_id, topic.name, topic.hours, topic.position)
    returning id into new_topic;

    insert into public.curriculum_lessons (curriculum_id, topic_id, kind_id, title, theory, task, position)
    select new_id, new_topic, l.kind_id, l.title, l.theory, l.task, l.position
    from public.curriculum_lessons l
    where l.curriculum_id = p_source and l.topic_id = topic.id;
  end loop;

  -- уроки вне тем
  insert into public.curriculum_lessons (curriculum_id, topic_id, kind_id, title, theory, task, position)
  select new_id, null, l.kind_id, l.title, l.theory, l.task, l.position
  from public.curriculum_lessons l
  where l.curriculum_id = p_source and l.topic_id is null;

  return new_id;
end $fn$;

grant execute on function public.curriculum_copy(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lesson_kinds','curricula','curriculum_topics','curriculum_lessons']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
