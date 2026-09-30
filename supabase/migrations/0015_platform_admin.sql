-- ---------------------------------------------------------------------------
-- 0015. Главный администратор платформы.
--
-- Уровень над школами: видит все школы, все пространства и всех людей,
-- может разбирать инциденты и сбрасывать пароли. Это владелец сервиса, а не
-- роль, которую кто-то получает сам, — список ведётся прямо в базе.
--
-- Как это устроено: политики PostgreSQL складываются по ИЛИ, поэтому здесь не
-- переписывается ни одна существующая политика. К каждой таблице добавляется
-- отдельная политика чтения «или ты главный админ» — обычные правила школ и
-- пространств остаются ровно такими, какими были.
--
-- Чего здесь НЕТ и не будет: паролей открытым текстом. Supabase Auth хранит
-- bcrypt-хеш, исходного пароля не существует. Задача «человек потерял доступ»
-- решается сбросом через school-accounts, и сброс пишется в журнал ниже.
-- ---------------------------------------------------------------------------

create table if not exists public.platform_admins (
  user_id     uuid primary key references public.users(id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins a where a.user_id = auth.uid()
  );
$$;

-- Список админов видят только сами админы; менять его через приложение нельзя
-- вовсе — только здесь, в SQL. Так роль нельзя выдать себе из интерфейса,
-- даже если однажды в нём найдётся дыра.
drop policy if exists platform_admins_read on public.platform_admins;
create policy platform_admins_read on public.platform_admins for select
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Журнал действий. Пишется из приложения при каждом заметном шаге: открыл
-- чужое пространство, сбросил пароль, заблокировал школу. Строки неизменяемы:
-- политик на update и delete нет, поэтому переписать историю нельзя даже
-- главному админу — журнал, который можно почистить, не журнал.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_audit (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.users(id) on delete set null,
  action       text not null,
  target_type  text,
  target_id    uuid,
  target_label text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists platform_audit_created_idx on public.platform_audit(created_at desc);
create index if not exists platform_audit_actor_idx on public.platform_audit(actor_id);

alter table public.platform_audit enable row level security;

drop policy if exists platform_audit_read on public.platform_audit;
create policy platform_audit_read on public.platform_audit for select
  using (public.is_platform_admin());

drop policy if exists platform_audit_write on public.platform_audit;
create policy platform_audit_write on public.platform_audit for insert
  with check (public.is_platform_admin() and actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Доступ на чтение ко всему. Политики складываются по ИЛИ — существующие
-- правила не трогаем, просто добавляем ещё одно основание.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'users','spaces','space_members','folders','materials','material_tags','tags',
    'assignments','submissions','starred','tasks','progress','comments',
    'quizzes','quiz_questions','quiz_options','quiz_attempts',
    'grade_scales','grade_periods','grade_categories','grade_items','grades',
    'grade_criteria','criterion_scores','attendance',
    'lessons','lesson_statuses','lesson_priorities',
    'space_bundles','bundle_spaces',
    'schools','school_people','school_parallels','school_classes',
    'school_departments','school_subjects','subject_classes','subject_assessment_types',
    'school_groups','group_members','group_teachers',
    'teaching_assignments','teaching_teachers'
  ]
  loop
    execute format('drop policy if exists %I_platform_read on public.%I', t, t);
    execute format(
      'create policy %I_platform_read on public.%I for select using (public.is_platform_admin())',
      t, t);
  end loop;
end $$;

-- Блокировка школы: вход школьным аккаунтам закрыт, данные на месте.
alter table public.schools add column if not exists is_blocked boolean not null default false;
alter table public.schools add column if not exists blocked_reason text;

-- Главный админ может менять школы и людей в них — иначе блокировка и разбор
-- инцидентов упираются в право на запись, которого у него нет.
drop policy if exists schools_platform_write on public.schools;
create policy schools_platform_write on public.schools for update
  using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists school_people_platform_write on public.school_people;
create policy school_people_platform_write on public.school_people for update
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Заблокированная школа не пускает по школьному логину
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
    and not s.is_blocked
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Сводка для обзора: одним запросом, без вытягивания всех строк в браузер.
-- ---------------------------------------------------------------------------
create or replace function public.platform_overview()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when public.is_platform_admin() then jsonb_build_object(
    'users',       (select count(*) from public.users),
    'schools',     (select count(*) from public.schools),
    'blocked',     (select count(*) from public.schools where is_blocked),
    'spaces',      (select count(*) from public.spaces),
    'people',      (select count(*) from public.school_people),
    'students',    (select count(*) from public.school_people where role = 'student'),
    'teachers',    (select count(*) from public.school_people where role = 'teacher'),
    'no_account',  (select count(*) from public.school_people where user_id is null),
    'materials',   (select count(*) from public.materials),
    'assignments', (select count(*) from public.assignments),
    'grades',      (select count(*) from public.grades),
    'courses',     (select count(*) from public.teaching_assignments),
    'new_users_7d',(select count(*) from public.users where created_at > now() - interval '7 days')
  ) else null end;
$$;

grant execute on function public.platform_overview() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- НАЗНАЧИТЬ СЕБЯ. Подставь свою почту и выполни — без этой строки раздел
-- /platform не откроется никому, включая тебя.
-- ---------------------------------------------------------------------------
-- Подставь почту СВОЕГО аккаунта в приложении, если она отличается.
insert into public.platform_admins (user_id, note)
select id, 'владелец платформы' from public.users where email = 'bin985100@gmail.com'
on conflict (user_id) do nothing;

-- Проверка: должна вернуться одна строка с твоей почтой.
-- Если пусто — значит аккаунта с такой почтой в public.users нет:
-- зайди в приложение этим аккаунтом хотя бы раз и выполни insert снова.
select u.email, a.note, a.created_at
from public.platform_admins a
join public.users u on u.id = a.user_id;
