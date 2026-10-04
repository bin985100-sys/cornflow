-- ---------------------------------------------------------------------------
-- 0019. Проверка работ: возврат на доработку, чат на работе, оповещения.
--
-- «Просрочен» сознательно не хранится: это дедлайн плюс отсутствие сдачи, и
-- если держать его колонкой, он протухнет в первую же ночь без планировщика.
-- Считается на лету, рядом с остальными статусами.
-- ---------------------------------------------------------------------------

-- 1. Возврат на доработку ----------------------------------------------------
alter type submission_status add value if not exists 'returned';

alter table public.submissions
  -- что сказал учитель, когда вернул или закрыл работу
  add column if not exists teacher_comment text,
  add column if not exists reviewed_at timestamptz,
  -- работа журнала, в которую ушла оценка
  add column if not exists grade_item_id uuid references public.grade_items(id) on delete set null,
  -- сколько раз работа возвращалась: видно и ученику, и учителю
  add column if not exists revision_count integer not null default 0;

-- 2. Чат на каждой работе ----------------------------------------------------
-- Отдельная переписка на сдачу, а не общий комментарий к заданию: там, где
-- тридцать учеников, общая лента превращается в кашу.
create table if not exists public.submission_messages (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  author_id     uuid not null references public.users(id) on delete cascade,
  body          text not null,
  -- материалы, приложенные к сообщению
  attachments   uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists submission_messages_idx
  on public.submission_messages(submission_id, created_at);

-- 3. Оповещения --------------------------------------------------------------
-- Одна таблица на все виды: колокольчик читает её целиком, а kind говорит,
-- какую иконку и какой текст показать.
do $$ begin create type notification_kind as enum
  ('submission_new','submission_returned','submission_graded','message','grade','request');
exception when duplicate_object then null; end $$;

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  kind        notification_kind not null,
  title       text not null,
  body        text,
  -- куда вести по клику
  link        text,
  space_id    uuid references public.spaces(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications(user_id, read_at, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Доступ
-- ---------------------------------------------------------------------------
alter table public.submission_messages enable row level security;
alter table public.notifications       enable row level security;

-- переписку видят участники пространства, в котором живёт задание:
-- ученик — свою, редактор пространства — любую
drop policy if exists submission_messages_read on public.submission_messages;
create policy submission_messages_read on public.submission_messages for select using (
  exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id = submission_id
      and (s.student_id = auth.uid() or public.can_edit_space(a.space_id))
  )
);

drop policy if exists submission_messages_write on public.submission_messages;
create policy submission_messages_write on public.submission_messages for insert with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id = submission_id
      and (s.student_id = auth.uid() or public.can_edit_space(a.space_id))
  )
);

-- своё сообщение можно удалить, чужое — нет
drop policy if exists submission_messages_delete on public.submission_messages;
create policy submission_messages_delete on public.submission_messages for delete
  using (author_id = auth.uid());

-- оповещения строго свои
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select using (user_id = auth.uid());

drop policy if exists notifications_mark on public.notifications;
create policy notifications_mark on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());

-- Писать оповещения может любой участник пространства: иначе учитель не
-- сможет уведомить ученика, а ученик — учителя. Подделать чужое событие это
-- не даёт: текст виден получателю, и он же решает, идти по ссылке или нет.
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert with check (
  space_id is null or public.is_space_member(space_id)
);

do $$
declare t text;
begin
  foreach t in array array['submission_messages','notifications']
  loop
    execute format('drop policy if exists %I_platform_read on public.%I', t, t);
    execute format(
      'create policy %I_platform_read on public.%I for select using (public.is_platform_admin())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['submission_messages','notifications']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
