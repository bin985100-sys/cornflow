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
  kind: 'assignment' | 'task' | 'grade'
  spaceId: string | null
  color: CardColor
  done?: boolean
  ref: AssignmentView | Task | GradeItem
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

/* =========================================================================
   Журнал оценок (школьный дневник внутри пространства)
   Таблицы — supabase/migrations/0002_gradebook.sql
   ========================================================================= */

/** Цвет уровня оценки в журнале */
export type GradeColor = 'green' | 'lime' | 'yellow' | 'orange' | 'red' | 'blue' | 'grey'

/**
 * Как учитель вводит оценку:
 * `points` — числом (5-балльная, 100-балльная, любые баллы за работу);
 * `levels` — выбором уровня из списка (буквенная A–F, зачёт/незачёт).
 */
export type ScaleKind = 'points' | 'levels'

/** Уровень шкалы: диапазон процентов → подпись, цвет и числовой эквивалент */
export interface GradeLevel {
  id: string
  label: string
  /** Нижняя граница уровня в процентах от максимума работы, 0..100 */
  min_percent: number
  /** Числовой эквивалент для расчёта среднего (для буквенных шкал — GPA) */
  value: number
  color: GradeColor
}

export interface GradeScale {
  id: string
  space_id: string
  name: string
  kind: ScaleKind
  /** Максимум по умолчанию для новых работ (5, 10, 12, 100 …) */
  max_value: number
  /** Минимальный балл шкалы — обычно 0 или 1 */
  min_value: number
  /** Уровни, отсортированы по убыванию min_percent */
  levels: GradeLevel[]
  /** Порог «сдано» в процентах */
  passing_percent: number
  is_default: boolean
  created_at: string
}

/** Учебный период: четверть, триместр, семестр, модуль */
export interface GradePeriod {
  id: string
  space_id: string
  name: string
  start_date: string
  end_date: string
  is_current: boolean
  created_at: string
}

/** Категория работ с собственным весом: контрольная, домашняя, устный ответ… */
export interface GradeCategory {
  id: string
  space_id: string
  name: string
  weight: number
  color: CardColor
  created_at: string
}

/** Колонка журнала — конкретная работа */
export interface GradeItem {
  id: string
  space_id: string
  period_id: string | null
  category_id: string | null
  /** Если работа создана из задания — оценки переносятся автоматически */
  assignment_id: string | null
  title: string
  date: string
  max_score: number
  /** Вес работы внутри категории */
  weight: number
  /** Своя шкала для этой работы; null — шкала пространства по умолчанию */
  scale_id: string | null
  created_at: string
}

/**
 * Критерий оценивания работы (рубрика). Учитель добавляет свои критерии
 * к работе; итоговый балл за работу — сумма баллов по критериям.
 * item_id = null — критерий-шаблон в библиотеке пространства.
 */
export interface GradeCriterion {
  id: string
  space_id: string
  item_id: string | null
  title: string
  description: string | null
  max_score: number
  position: number
  created_at: string
}

/** Балл ученика по одному критерию */
export interface CriterionScore {
  id: string
  criterion_id: string
  student_id: string
  score: number | null
  updated_at: string
}

/** Отметка вместо балла */
export type GradeFlag = 'none' | 'absent' | 'excused' | 'pending'

export interface Grade {
  id: string
  item_id: string
  student_id: string
  score: number | null
  flag: GradeFlag
  comment: string | null
  graded_by: string | null
  updated_at: string
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'

export interface Attendance {
  id: string
  space_id: string
  student_id: string
  date: string
  status: AttendanceStatus
  note: string | null
  created_at: string
}

/** Всё, что нужно журналу за один запрос */
export interface GradebookSnapshot {
  scales: GradeScale[]
  periods: GradePeriod[]
  categories: GradeCategory[]
  items: GradeItem[]
  grades: Grade[]
  criteria: GradeCriterion[]
  criterionScores: CriterionScore[]
  attendance: Attendance[]
  students: Array<Pick<User, 'id' | 'name' | 'avatar' | 'role'>>
}
