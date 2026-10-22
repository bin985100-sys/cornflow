-- ---------------------------------------------------------------------------
-- 0025. Пустой «груз» для страницы проверки связи (/diag.html).
--
-- Нужен, чтобы понять, доходят ли от сервера данных ответы больше 16 КБ:
-- у части российских провайдеров соединения с зарубежными CDN обрываются
-- после первых килобайт. Никаких данных функция не отдаёт.
-- ---------------------------------------------------------------------------
create or replace function public.diag_payload(kb int default 100)
returns text language sql immutable set search_path = public as $$
  select repeat('0123456789abcdef', greatest(1, least(kb, 512)) * 64)
$$;
revoke all on function public.diag_payload(int) from public;
grant execute on function public.diag_payload(int) to anon, authenticated;
