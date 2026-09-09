-- ===========================================================================
-- CornFlow · 0012 — школу не удавалось создать: RLS отклоняла INSERT
--
-- Приложение вставляет школу с `returning *`, чтобы сразу получить её id.
-- При INSERT ... RETURNING PostgreSQL проверяет не только политику вставки,
-- но и политику чтения — как дополнительный WITH CHECK.
--
-- Политика чтения была `public.is_school_member(id)`, а эта функция ищет
-- школу обычным SELECT. Внутри того же оператора вставки новой строки ещё не
-- видно (у функции снимок данных на начало оператора), поэтому проверка
-- падала, и наружу приходило «new row violates row-level security policy».
--
-- Лечится прямым сравнением: владелец виден без обращения к таблице.
-- ===========================================================================

drop policy if exists schools_read on public.schools;
create policy schools_read on public.schools for select using (
  owner_id = auth.uid() or public.is_school_member(id)
);

drop policy if exists schools_write on public.schools;
create policy schools_write on public.schools for update
  using (owner_id = auth.uid() or public.is_school_admin(id))
  with check (owner_id = auth.uid() or public.is_school_admin(id));
