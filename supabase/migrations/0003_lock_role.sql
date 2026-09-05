-- ===========================================================================
-- CornFlow — роль аккаунта фиксируется на момент регистрации.
-- Иначе ученик мог открыть настройки и выдать себе роль учителя.
-- ===========================================================================

create or replace function public.lock_user_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    raise exception 'Роль задаётся при регистрации и не меняется';
  end if;
  return new;
end $$;

drop trigger if exists users_role_locked on public.users;
create trigger users_role_locked
  before update on public.users
  for each row execute function public.lock_user_role();
