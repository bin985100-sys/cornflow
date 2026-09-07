-- ===========================================================================
-- CornFlow · 0003 — критерии оценивания (рубрики)
-- Учитель добавляет к работе свои критерии со своим максимальным баллом;
-- итог за работу — сумма баллов по критериям.
-- Выполнять после 0007_gradebook.sql.
-- ===========================================================================

create table if not exists public.grade_criteria (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  -- null → критерий-шаблон в библиотеке пространства
  item_id      uuid references public.grade_items(id) on delete cascade,
  title        text not null,
  description  text,
  max_score    numeric not null default 1,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists grade_criteria_space_idx on public.grade_criteria(space_id, position);
create index if not exists grade_criteria_item_idx on public.grade_criteria(item_id);

create table if not exists public.criterion_scores (
  id            uuid primary key default gen_random_uuid(),
  criterion_id  uuid not null references public.grade_criteria(id) on delete cascade,
  student_id    uuid not null references public.users(id) on delete cascade,
  score         numeric,
  updated_at    timestamptz not null default now(),
  unique (criterion_id, student_id)
);
create index if not exists criterion_scores_criterion_idx on public.criterion_scores(criterion_id);
create index if not exists criterion_scores_student_idx on public.criterion_scores(student_id);

-- Пространство критерия — для политик по criterion_scores
create or replace function public.criterion_space(p_criterion uuid)
returns uuid
language sql stable security definer set search_path = public
as $$ select space_id from public.grade_criteria where id = p_criterion $$;

alter table public.grade_criteria  enable row level security;
alter table public.criterion_scores enable row level security;

drop policy if exists grade_criteria_read on public.grade_criteria;
create policy grade_criteria_read on public.grade_criteria for select
  using (public.is_space_member(space_id));

drop policy if exists grade_criteria_write on public.grade_criteria;
create policy grade_criteria_write on public.grade_criteria for all
  using (public.can_edit_space(space_id))
  with check (public.can_edit_space(space_id));

-- Ученик видит только свои баллы по критериям
drop policy if exists criterion_scores_read on public.criterion_scores;
create policy criterion_scores_read on public.criterion_scores for select using (
  student_id = auth.uid() or public.can_edit_space(public.criterion_space(criterion_id))
);

drop policy if exists criterion_scores_write on public.criterion_scores;
create policy criterion_scores_write on public.criterion_scores for all
  using (public.can_edit_space(public.criterion_space(criterion_id)))
  with check (public.can_edit_space(public.criterion_space(criterion_id)));

do $$
declare t text;
begin
  foreach t in array array['grade_criteria','criterion_scores']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
