-- ---------------------------------------------------------------------------
-- 0024. Целостность пространств.
--
-- Что ломалось: стартовое пространство создавал браузер двумя запросами
-- (пространство, потом участник) и проверял «есть ли уже» перед каждым
-- запросом к данным. Параллельные проверки плодили одинаковые «Мой курс»,
-- а при обрыве сети пространство оставалось без участника — его никто не
-- видел. Повтор запроса из-за сети давал 409 на коде приглашения.
--
-- Теперь: код приглашения выдаёт база и сама обходит занятые, владелец
-- становится участником тем же запросом, стартовое пространство создаёт
-- функция под блокировкой на пользователя.
-- ---------------------------------------------------------------------------

create or replace function public.gen_invite_code()
returns text language plpgsql volatile set search_path = public as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.spaces where invite_code = code);
  end loop;
  return code;
end $fn$;

alter table public.spaces alter column invite_code set default public.gen_invite_code();

create or replace function public.spaces_fix_invite_code()
returns trigger language plpgsql set search_path = public as $fn$
begin
  if new.invite_code is null or new.invite_code = ''
     or exists (select 1 from public.spaces s where s.invite_code = new.invite_code and s.id <> new.id) then
    new.invite_code := public.gen_invite_code();
  end if;
  return new;
end $fn$;

drop trigger if exists spaces_fix_invite_code on public.spaces;
create trigger spaces_fix_invite_code
  before insert or update of invite_code on public.spaces
  for each row execute function public.spaces_fix_invite_code();

create or replace function public.spaces_owner_member()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.school_id is null then
    insert into public.space_members (space_id, user_id, permission)
    values (new.id, new.owner_id, 'edit')
    on conflict do nothing;
  end if;
  return new;
end $fn$;

drop trigger if exists spaces_owner_member on public.spaces;
create trigger spaces_owner_member
  after insert on public.spaces
  for each row execute function public.spaces_owner_member();

create or replace function public.ensure_starter_space()
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  me uuid := auth.uid();
  r public.users%rowtype;
  sid uuid;
begin
  if me is null then return null; end if;
  perform pg_advisory_xact_lock(hashtext('cornflow-starter:' || me::text));

  select m.space_id into sid from public.space_members m where m.user_id = me limit 1;
  if sid is not null then return sid; end if;

  select s.id into sid from public.spaces s
  where s.owner_id = me and s.school_id is null
  order by s.created_at limit 1;

  if sid is null then
    select * into r from public.users where id = me;
    if not found then return null; end if;
    insert into public.spaces (name, description, owner_id, color)
    values (
      case when r.role = 'teacher' then 'Мой курс' else 'Моё пространство' end,
      case when r.role = 'teacher' then 'Первое пространство — переименуйте его под свой предмет'
           else 'Личные материалы и конспекты' end,
      me,
      (case when r.role = 'teacher' then 'blue' else 'purple' end)::card_color
    )
    returning id into sid;
  end if;

  insert into public.space_members (space_id, user_id, permission)
  values (sid, me, 'edit') on conflict do nothing;
  return sid;
end $fn$;

revoke all on function public.ensure_starter_space() from public;
grant execute on function public.ensure_starter_space() to authenticated;
