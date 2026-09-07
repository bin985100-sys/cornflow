import type { Space, SpaceMember, Tag, User } from '../types'
import { inviteCode, uid } from '../utils'

/* ---------------------------------------------------------------------------
   Стартовое состояние приложения.

   Никакого демо-контента: новый пользователь получает пустое личное
   пространство и общий словарь тегов, который дальше расширяет сам.
--------------------------------------------------------------------------- */

/** Базовый словарь тегов — единственное, что есть в системе «из коробки». */
export const DEFAULT_TAGS: Tag[] = [
  { id: 'tag_lecture', name: 'Лекция', color: 'blue', icon: 'BookOpen' },
  { id: 'tag_practice', name: 'Практика', color: 'green', icon: 'FlaskConical' },
  { id: 'tag_exam', name: 'Экзамен', color: 'red', icon: 'GraduationCap' },
  { id: 'tag_homework', name: 'Домашка', color: 'orange', icon: 'PenLine' },
  { id: 'tag_theory', name: 'Теория', color: 'navy', icon: 'Brain' },
  { id: 'tag_video', name: 'Видео', color: 'teal', icon: 'Video' },
  { id: 'tag_important', name: 'Важное', color: 'purple', icon: 'Flame' },
]

/** Личное пространство, которое создаётся при регистрации. Оно пустое. */
export function personalSpace(user: User): { space: Space; member: SpaceMember } {
  const created_at = new Date().toISOString()
  const space: Space = {
    id: uid('spc'),
    name: user.role === 'teacher' ? 'Мой курс' : 'Моё пространство',
    description:
      user.role === 'teacher'
        ? 'Первое пространство — переименуйте его под свой предмет'
        : 'Личные материалы и конспекты',
    owner_id: user.id,
    color: user.role === 'teacher' ? 'blue' : 'purple',
    invite_code: inviteCode(),
    created_at,
  }
  return {
    space,
    member: { space_id: space.id, user_id: user.id, permission: 'edit', joined_at: created_at },
  }
}
