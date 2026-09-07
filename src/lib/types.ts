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
  /** Урок, к которому прикреплено задание */
  lesson_id: string | null
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
   Таблицы — supabase/migrations/0007_gradebook.sql
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
/**
 * Тип работы и занятия: SA, FA, домашняя, устный ответ… Всё настраивается —
 * имя, короткий код, цвет, вес в среднем балле и важность по умолчанию.
 */
export interface GradeCategory {
  id: string
  space_id: string
  name: string
  /** Короткий код на чипе: SA, FA, HW. Пусто — показываем имя */
  code: string | null
  weight: number
  color: CardColor
  /** Важность по умолчанию для занятий и работ этого типа */
  default_priority_id: string | null
  /** Учитывать работы этого типа в среднем балле */
  counts_toward_grade: boolean
  position: number
  created_at: string
}

/* --------------------- настраиваемые справочники ------------------------- */

/**
 * Статус занятия. Список задаёт учитель: «Запланировано», «Проведено»,
 * «Отменено» — любые свои названия, цвета и порядок.
 */
export interface LessonStatus {
  id: string
  space_id: string
  name: string
  color: CardColor
  /** Считать занятие состоявшимся — влияет на счётчики и посещаемость */
  is_held: boolean
  /** Ставить этот статус новым занятиям */
  is_default: boolean
  position: number
  created_at: string
}

/**
 * Уровень важности. Тоже полностью настраиваемый: «Обычная», «Высокая»,
 * «Критическая» — сколько угодно уровней со своим весом внимания.
 */
export interface LessonPriority {
  id: string
  space_id: string
  name: string
  color: CardColor
  /** Чем больше, тем выше в списке важности */
  rank: number
  is_default: boolean
  position: number
  created_at: string
}

/* ------------------------------- занятия --------------------------------- */

/**
 * Урок. К уроку привязываются задания и работы журнала; тип, статус и
 * важность берутся из справочников пространства, поэтому ничего не зашито.
 */
export interface Lesson {
  id: string
  space_id: string
  period_id: string | null
  category_id: string | null
  status_id: string | null
  priority_id: string | null
  title: string
  topic: string | null
  date: string
  /** Время начала, HH:MM; null — время не задано */
  starts_at: string | null
  duration_min: number | null
  /** Домашнее задание текстом */
  homework: string | null
  /** Заметка учителя по занятию */
  notes: string | null
  position: number
  created_at: string
}

/* -------------------- наборы пространств (один код) ---------------------- */

/**
 * Набор пространств: администратор собирает несколько пространств и раздаёт
 * один код. Ученик входит по нему сразу во все пространства набора.
 * Чужое пространство добавляет только тот, кто вправе его редактировать.
 */
export interface SpaceBundle {
  id: string
  name: string
  description: string | null
  code: string
  owner_id: string
  /** С какими правами вступают вошедшие по коду */
  permission: Permission
  created_at: string
}

export interface BundleSpace {
  bundle_id: string
  space_id: string
  added_by: string | null
  added_at: string
}

export interface SpaceBundleView extends SpaceBundle {
  spaces: Array<Pick<Space, 'id' | 'name' | 'color'> & { owner_id: string; is_mine: boolean }>
  is_owner: boolean
}

/** Колонка журнала — конкретная работа */
export interface GradeItem {
  id: string
  space_id: string
  period_id: string | null
  category_id: string | null
  /** Урок, к которому относится работа */
  lesson_id: string | null
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
  lessons: Lesson[]
  lessonStatuses: LessonStatus[]
  lessonPriorities: LessonPriority[]
  attendance: Attendance[]
  students: Array<Pick<User, 'id' | 'name' | 'avatar' | 'role'>>
}
