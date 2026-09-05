-- ===========================================================================
-- CornFlow — роль можно исправить, пока человек не вступил в чужой курс,
-- плюс стартовое пространство для аккаунтов, которые остались без него.
-- ===========================================================================

create or replace function public.lock_user_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if exists (
      select 1 from public.space_members m
      join public.spaces s on s.id = m.space_id
      where m.user_id = new.id and s.owner_id <> new.id
    ) then
      raise exception 'Роль нельзя сменить: вы состоите в чужом курсе. Выйдите из него или заведите отдельный аккаунт';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists users_role_locked on public.users;
create trigger users_role_locked
  before update on public.users
  for each row execute function public.lock_user_role();

-- Разовая починка: у кого нет ни одного пространства — создаём стартовое
with missing as (
  select u.id, u.role from public.users u
  where not exists (select 1 from public.space_members m where m.user_id = u.id)
), created as (
  insert into public.spaces (name, description, owner_id, color, invite_code)
  select case when m.role = 'teacher' then 'Мой курс' else 'Моё пространство' end,
         case when m.role = 'teacher' then 'Первое пространство — переименуйте его под свой предмет'
              else 'Личные материалы и конспекты' end,
         m.id,
         case when m.role = 'teacher' then 'blue'::card_color else 'purple'::card_color end,
         upper(substr(md5(random()::text), 1, 6))
  from missing m
  returning id, owner_id
)
insert into public.space_members (space_id, user_id, permission)
select id, owner_id, 'edit' from created;
