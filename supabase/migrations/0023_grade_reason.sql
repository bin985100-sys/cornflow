-- ---------------------------------------------------------------------------
-- 0023. За что стоит оценка.
--
-- Название работы отвечает на вопрос «за какую работу», но не «за что
-- именно»: за одну и ту же контрольную ставят и за решение, и за устный ответ
-- у доски. Короткая формулировка решает спор «а почему четыре» до того, как он
-- начался.
--
-- Это не тип оценивания (grade_categories) — тот описывает вес работы в
-- журнале, а здесь одна строка для ученика и родителя.
-- ---------------------------------------------------------------------------

alter table public.grades
  add column if not exists reason text;

-- Подсказки школы: администратор заводит частые формулировки, учитель выбирает
-- в один клик. Список необязателен — поле остаётся свободным.
create table if not exists public.grade_reasons (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  text        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists grade_reasons_school_idx on public.grade_reasons(school_id, position);

alter table public.grade_reasons enable row level security;

drop policy if exists grade_reasons_read on public.grade_reasons;
create policy grade_reasons_read on public.grade_reasons for select
  using (public.is_school_member(school_id));

drop policy if exists grade_reasons_write on public.grade_reasons;
create policy grade_reasons_write on public.grade_reasons for all
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

drop policy if exists grade_reasons_platform_read on public.grade_reasons;
create policy grade_reasons_platform_read on public.grade_reasons for select
  using (public.is_platform_admin());

do $$
begin
  begin
    alter publication supabase_realtime add table public.grade_reasons;
  exception when duplicate_object then null;
  end;
end $$;
