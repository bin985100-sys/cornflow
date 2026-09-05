-- ===========================================================================
-- CornFlow — обсуждения под материалами и тесты с автопроверкой.
-- ===========================================================================

create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  material_id   uuid references public.materials(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  author_id     uuid not null references public.users(id) on delete cascade,
  body          text not null check (length(btrim(body)) between 1 and 4000),
  created_at    timestamptz not null default now(),
  check (num_nonnulls(material_id, assignment_id) = 1)
);

create index if not exists idx_comments_material on public.comments(material_id, created_at);
create index if not exists idx_comments_assignment on public.comments(assignment_id, created_at);

alter table public.comments enable row level security;

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select using (public.is_space_member(space_id));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert
  with check (public.is_space_member(space_id) and author_id = auth.uid());
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete
  using (author_id = auth.uid() or public.can_manage_space(space_id));

-- --------------------------------- тесты ----------------------------------
create table if not exists public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  title       text not null,
  description text,
  due_date    timestamptz,
  attempts_allowed int not null default 1 check (attempts_allowed between 1 and 20),
  shuffle     boolean not null default true,
  published   boolean not null default false,
  author_id   uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id       uuid primary key default gen_random_uuid(),
  quiz_id  uuid not null references public.quizzes(id) on delete cascade,
  position int not null default 0,
  text     text not null,
  multiple boolean not null default false,
  points   int not null default 1 check (points between 1 and 100)
);

create table if not exists public.quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  position    int not null default 0,
  text        text not null,
  is_correct  boolean not null default false
);

create table if not exists public.quiz_attempts (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  answers    jsonb not null default '{}'::jsonb,
  score      int not null default 0,
  max_score  int not null default 0,
  is_late    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_quizzes_space on public.quizzes(space_id);
create index if not exists idx_questions_quiz on public.quiz_questions(quiz_id, position);
create index if not exists idx_options_question on public.quiz_options(question_id, position);
create index if not exists idx_attempts_quiz on public.quiz_attempts(quiz_id, student_id);

alter table public.quizzes        enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_options   enable row level security;
alter table public.quiz_attempts  enable row level security;

drop policy if exists quizzes_select on public.quizzes;
create policy quizzes_select on public.quizzes for select
  using (public.is_space_member(space_id) and (published or public.can_manage_space(space_id)));
drop policy if exists quizzes_write on public.quizzes;
create policy quizzes_write on public.quizzes for all
  using (public.can_manage_space(space_id)) with check (public.can_manage_space(space_id));

drop policy if exists questions_select on public.quiz_questions;
create policy questions_select on public.quiz_questions for select using (
  exists (select 1 from public.quizzes q where q.id = quiz_id
          and public.is_space_member(q.space_id)
          and (q.published or public.can_manage_space(q.space_id)))
);
drop policy if exists questions_write on public.quiz_questions;
create policy questions_write on public.quiz_questions for all
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and public.can_manage_space(q.space_id)))
  with check (exists (select 1 from public.quizzes q where q.id = quiz_id and public.can_manage_space(q.space_id)));

-- варианты ответов видит только преподаватель: иначе правильный ответ утечёт в запрос
drop policy if exists options_select on public.quiz_options;
create policy options_select on public.quiz_options for select using (
  exists (select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id
          where qq.id = question_id and public.can_manage_space(q.space_id))
);
drop policy if exists options_write on public.quiz_options;
create policy options_write on public.quiz_options for all
  using (exists (select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id
                 where qq.id = question_id and public.can_manage_space(q.space_id)))
  with check (exists (select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id
                 where qq.id = question_id and public.can_manage_space(q.space_id)));

drop policy if exists attempts_select on public.quiz_attempts;
create policy attempts_select on public.quiz_attempts for select using (
  student_id = auth.uid()
  or exists (select 1 from public.quizzes q where q.id = quiz_id and public.can_manage_space(q.space_id))
);

-- вопросы для прохождения — без пометки правильных вариантов
create or replace function public.get_quiz_for_student(p_quiz uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q public.quizzes; res jsonb;
begin
  select * into q from public.quizzes where id = p_quiz;
  if not found then raise exception 'Тест не найден'; end if;
  if not public.is_space_member(q.space_id) then raise exception 'Нет доступа к этому тесту'; end if;
  if not q.published and not public.can_manage_space(q.space_id) then
    raise exception 'Тест ещё не опубликован';
  end if;
  select jsonb_build_object(
    'id', q.id, 'title', q.title, 'description', q.description,
    'due_date', q.due_date, 'attempts_allowed', q.attempts_allowed,
    'attempts_used', (select count(*) from public.quiz_attempts a where a.quiz_id = q.id and a.student_id = auth.uid()),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qq.id, 'text', qq.text, 'multiple', qq.multiple, 'points', qq.points,
        'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text) order by o.position)
                    from public.quiz_options o where o.question_id = qq.id)
      ) order by qq.position)
      from public.quiz_questions qq where qq.quiz_id = q.id), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- проверка ответов и подсчёт баллов на стороне базы
create or replace function public.submit_quiz(p_quiz uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q public.quizzes; used int; total int := 0; earned int := 0;
  rec record; chosen uuid[]; correct uuid[]; late boolean := false;
begin
  select * into q from public.quizzes where id = p_quiz;
  if not found then raise exception 'Тест не найден'; end if;
  if not public.is_space_member(q.space_id) then raise exception 'Нет доступа к этому тесту'; end if;
  if not q.published then raise exception 'Тест ещё не опубликован'; end if;

  select count(*) into used from public.quiz_attempts a where a.quiz_id = q.id and a.student_id = auth.uid();
  if used >= q.attempts_allowed then
    raise exception 'Попытки закончились: разрешено %', q.attempts_allowed;
  end if;

  if q.due_date is not null and now() > q.due_date then late := true; end if;

  for rec in select * from public.quiz_questions where quiz_id = q.id loop
    total := total + rec.points;
    select coalesce(array_agg(value::uuid), '{}') into chosen
      from jsonb_array_elements_text(coalesce(p_answers -> rec.id::text, '[]'::jsonb));
    select coalesce(array_agg(o.id), '{}') into correct
      from public.quiz_options o where o.question_id = rec.id and o.is_correct;
    if chosen @> correct and correct @> chosen and array_length(correct,1) is not null then
      earned := earned + rec.points;
    end if;
  end loop;

  insert into public.quiz_attempts (quiz_id, student_id, answers, score, max_score, is_late)
  values (q.id, auth.uid(), coalesce(p_answers,'{}'::jsonb), earned, total, late);

  return jsonb_build_object('score', earned, 'max_score', total, 'is_late', late,
                            'attempts_left', q.attempts_allowed - used - 1);
end $$;

do $$ declare t text; begin
  foreach t in array array['comments','quizzes','quiz_questions','quiz_attempts'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
