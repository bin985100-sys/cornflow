-- ===========================================================================
-- CornFlow — базовый словарь тегов.
-- Выполняется после 0001_init.sql. Идемпотентно.
-- ===========================================================================

insert into public.tags (name, color, icon) values
  ('Лекция',   'blue',   'BookOpen'),
  ('Практика', 'green',  'FlaskConical'),
  ('Экзамен',  'red',    'GraduationCap'),
  ('Домашка',  'orange', 'PenLine'),
  ('Теория',   'navy',   'Brain'),
  ('Видео',    'teal',   'Video'),
  ('Важное',   'purple', 'Flame')
on conflict (name) do nothing;
