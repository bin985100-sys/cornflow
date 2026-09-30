-- ---------------------------------------------------------------------------
-- 0014. Таблица-«сердцебиение».
--
-- Проект Supabase на бесплатном тарифе засыпает, если за неделю к базе почти
-- не обращались, и поднимать его приходится руками — приложение при этом
-- просто не грузится. Достаточно нескольких запросов к базе в день, чтобы
-- этого не случилось.
--
-- Эта таблица — то, что можно дёргать снаружи каждый день, ничего не зная о
-- данных школы. В ней одна строка и одна отметка времени: читать её может кто
-- угодно, писать — никто, кроме функции ниже. Так у нас нет ни одной точки,
-- где аноним пишет в базу напрямую.
-- ---------------------------------------------------------------------------
create table if not exists public.heartbeat (
  id         smallint primary key default 1,
  pinged_at  timestamptz not null default now(),
  constraint heartbeat_single_row check (id = 1)
);

insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

alter table public.heartbeat enable row level security;

drop policy if exists heartbeat_read on public.heartbeat;
create policy heartbeat_read on public.heartbeat for select using (true);

-- Отметиться: возвращает время последнего касания. Security definer, потому
-- что политик на запись у таблицы нет — только через эту функцию.
create or replace function public.touch_heartbeat()
returns timestamptz
language sql volatile security definer set search_path = public
as $$
  update public.heartbeat set pinged_at = now() where id = 1
  returning pinged_at;
$$;

grant execute on function public.touch_heartbeat() to anon, authenticated;
