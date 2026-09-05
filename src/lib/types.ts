/* =========================================================================
   CornFlow — модель данных.
   Типы 1:1 соответствуют таблицам из supabase/migrations/0001_init.sql
   ========================================================================= */

export type Role = 'teacher' | 'student'
export type Permission = 'view' | 'edit'

export type MaterialType =
  | 'document'
  | 'pdf'
  | 'presentation'
  | 'video'
  | 'link'
  | 'image'
  | 'audio'
  | 'note'
  | 'assignment'

/** Палитра карточек материалов (см. дизайн-токены) */
export type CardColor = 'red' | 'yellow' | 'green' | 'blue' | 'purple'

/** Палитра тегов-пилюль */
export type TagColor = 'blue' | 'green' | 'purple' | 'orange' | 'navy' | 'teal' | 'red'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  avatar: string | null
  created_at: string
}

export interface Space {
  id: string
  name: string
  description: string | null
  owner_id: string
  color: CardColor
  invite_code: string
  created_at: string
  /** приём новых участников по коду */
  join_open: boolean
  /** пространство закрыто: содержимое видит только владелец */
  is_locked: boolean
  /** ученикам разрешено добавлять материалы */
  student_upload: boolean
  /** разделы, доступные ученикам */
  show_assignments: boolean
  show_calendar: boolean
  show_members: boolean
}

export interface SpaceMember {
  space_id: string
  user_id: string
  permission: Permission
  joined_at: string
}

export interface Folder {
  id: string
  space_id: string
  parent_id: string | null
  name: string
  color: CardColor
  created_at: string
}

export interface Material {
  id: string
  space_id: string
  folder_id: string | null
  title: string
  description: string | null
  type: MaterialType
  /** Публичный/подписанный URL файла в Storage, либо внешняя ссылка для type=link */
  file_url: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  /** HTML конспекта для type=note */
  content: string | null
  color: CardColor
  author_id: string
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  name: string
  color: TagColor
  /** Имя иконки из lucide-react */
  icon: string
}

export interface MaterialTag {
  material_id: string
  tag_id: string
}

export interface Assignment {
  id: string
  space_id: string
  title: string
  description: string | null
  due_date: string | null
  /** принимать ли работы после дедлайна */
  allow_late: boolean
  /** id материалов, прикреплённых к заданию */
  attachments: string[]
  author_id: string
  created_at: string
}

export type SubmissionStatus = 'assigned' | 'submitted' | 'graded'

export interface Submission {
  id: string
  assignment_id: string
  student_id: string
  status: SubmissionStatus
  comment: string | null
  /** id материалов, приложенных учеником */
  attachments: string[]
  grade: number | null
  submitted_at: string | null
  /** работа сдана после дедлайна */
  is_late: boolean
}

/** Комментарий под материалом или заданием */
export interface Comment {
  id: string
  space_id: string
  material_id: string | null
  assignment_id: string | null
  author_id: string
  body: string
  created_at: string
}

export interface CommentView extends Comment {
  author: Pick<User, 'id' | 'name' | 'avatar'> | null
}

/* ------------------------------- Тесты ----------------------------------- */

export interface Quiz {
  id: string
  space_id: string
  title: string
  description: string | null
  due_date: string | null
  attempts_allowed: number
  shuffle: boolean
  published: boolean
  author_id: string
  created_at: string
}

export interface QuizQuestion {
  id: string
  quiz_id: string
  position: number
  text: string
  multiple: boolean
  points: number
}

export interface QuizOption {
  id: string
  question_id: string
  position: number
  text: string
  /** приходит только преподавателю — ученику база это поле не отдаёт */
  is_correct?: boolean
}

export interface QuizAttempt {
  id: string
  quiz_id: string
  student_id: string
  answers: Record<string, string[]>
  score: number
  max_score: number
  is_late: boolean
  created_at: string
}

/** Тест в том виде, в каком его получает ученик: без правильных ответов */
export interface QuizForStudent {
  id: string
  title: string
  description: string | null
  due_date: string | null
  attempts_allowed: number
  attempts_used: number
  questions: Array<{
    id: string
    text: string
    multiple: boolean
    points: number
    options: Array<{ id: string; text: string }>
  }>
}

export interface QuizResult {
  score: number
  max_score: number
  is_late: boolean
  attempts_left: number
}

export interface QuizView extends Quiz {
  questions: number
  points: number
  /** для ученика — его лучшая попытка; для преподавателя — все попытки */
  myAttempt: QuizAttempt | null
  attempts: Array<QuizAttempt & { student: Pick<User, 'id' | 'name' | 'avatar'> | null }>
}

export interface Starred {
  user_id: string
  material_id: string
  created_at: string
}

export interface Task {
  id: string
  user_id: string
  space_id: string | null
  title: string
  done: boolean
  due_date: string | null
  created_at: string
}

export type ProgressStatus = 'viewed' | 'studied'

export interface Progress {
  user_id: string
  material_id: string
  status: ProgressStatus
  updated_at: string
}

/* ------------------------------------------------------------------------ */
/* Составные представления, которые использует UI                            */
/* ------------------------------------------------------------------------ */

export interface MaterialView extends Material {
  tags: Tag[]
  author: Pick<User, 'id' | 'name' | 'avatar'> | null
  starred: boolean
  progress: ProgressStatus | null
}

export interface SpaceView extends Space {
  members: Array<Pick<User, 'id' | 'name' | 'avatar' | 'role'> & { permission: Permission }>
  permission: Permission
  is_owner: boolean
}

export interface AssignmentView extends Assignment {
  attachedMaterials: Material[]
  /** Для ученика — его собственная сдача; для учителя — все сдачи */
  mySubmission: Submission | null
  submissions: Array<Submission & { student: Pick<User, 'id' | 'name' | 'avatar'> | null }>
}

/** Событие для календаря */
export interface CalendarEvent {
  id: string
  title: string
  date: string
  kind: 'assignment' | 'task'
  spaceId: string | null
  color: CardColor
  done?: boolean
  ref: AssignmentView | Task
}

export interface UploadProgressItem {
  id: string
  name: string
  size: number
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
  previewUrl?: string
}
