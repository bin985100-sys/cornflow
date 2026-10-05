-- ---------------------------------------------------------------------------
-- 0022. Запросы на изменение состава группы.
--
-- Состав группы правит администратор, но замечает расхождение учитель: к нему
-- ходит ученик, которого в списке нет. Поэтому учитель просит, а админ решает
-- — и решение сразу применяется, без второго захода в справочник.
-- ---------------------------------------------------------------------------

do $$ begin create type roster_request_kind as enum ('add','remove');
exception when duplicate_object then null; end $$;

do $$ begin create type roster_request_status as enum ('pending','approved','declined');
exception when duplicate_object then null; end $$;

create table if not exists public.roster_requests (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  group_id      uuid not null references public.school_groups(id) on delete cascade,
  person_id     uuid not null references public.school_people(id) on delete cascade,
  kind          roster_request_kind not null,
  status        roster_request_status not null default 'pending',
  -- кто попросил: учитель, ведущий группу
  requested_by  uuid references public.school_people(id) on delete set null,
  note          text,
  decided_by    uuid references public.school_people(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now()
);
create index if not exists roster_requests_school_idx
  on public.roster_requests(school_id, status, created_at desc);
create index if not exists roster_requests_group_idx on public.roster_requests(group_id);

-- Один и тот же запрос дважды подряд не нужен: пока он висит, повтор не
-- добавляет информации, а очередь засоряет.
create unique index if not exists roster_requests_pending_unique
  on public.roster_requests(group_id, person_id, kind)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Доступ
-- ---------------------------------------------------------------------------
alter table public.roster_requests enable row level security;

-- читает вся школа: учителю нужно видеть судьбу своей просьбы
drop policy if exists roster_requests_read on public.roster_requests;
create policy roster_requests_read on public.roster_requests for select
  using (public.is_school_member(school_id));

-- просит учитель этой группы, решает администратор
drop policy if exists roster_requests_insert on public.roster_requests;
create policy roster_requests_insert on public.roster_requests for insert with check (
  public.is_school_admin(school_id)
  or exists (
    select 1
    from public.group_teachers gt
    join public.school_people p on p.id = gt.person_id
    where gt.group_id = roster_requests.group_id and p.user_id = auth.uid()
  )
);

drop policy if exists roster_requests_decide on public.roster_requests;
create policy roster_requests_decide on public.roster_requests for update
  using (public.is_school_admin(school_id)) with check (public.is_school_admin(school_id));

drop policy if exists roster_requests_delete on public.roster_requests;
create policy roster_requests_delete on public.roster_requests for delete
  using (public.is_school_admin(school_id));

drop policy if exists roster_requests_platform_read on public.roster_requests;
create policy roster_requests_platform_read on public.roster_requests for select
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Решение применяется тем же действием, что и принимается
-- ---------------------------------------------------------------------------
create or replace function public.roster_decide(p_request uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  req public.roster_requests%rowtype;
  me uuid;
begin
  select * into req from public.roster_requests where id = p_request;
  if not found then raise exception 'Запрос не найден'; end if;
  if not public.is_school_admin(req.school_id) then
    raise exception 'Решать может только администратор школы';
  end if;
  if req.status <> 'pending' then raise exception 'Запрос уже решён'; end if;

  select id into me from public.school_people
  where school_id = req.school_id and user_id = auth.uid() limit 1;

  if p_approve then
    if req.kind = 'add' then
      insert into public.group_members (group_id, person_id)
      values (req.group_id, req.person_id)
      on conflict do nothing;
    else
      delete from public.group_members
      where group_id = req.group_id and person_id = req.person_id;
    end if;
  end if;

  update public.roster_requests
  set status = case when p_approve then 'approved' else 'declined' end::roster_request_status,
      decided_by = me,
      decided_at = now(),
      decision_note = p_note
  where id = p_request;
end $fn$;

grant execute on function public.roster_decide(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.roster_requests;
  exception when duplicate_object then null;
  end;
end $$;
