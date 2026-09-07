import type {
  Assignment,
  AssignmentView,
  Attendance,
  AttendanceStatus,
  CardColor,
  CriterionScore,
  Folder,
  Grade,
  GradeCategory,
  GradeCriterion,
  GradeFlag,
  GradeItem,
  GradePeriod,
  GradeScale,
  GradebookSnapshot,
  Lesson,
  LessonPriority,
  LessonStatus,
  Material,
  MaterialType,
  MaterialView,
  Permission,
  Progress,
  ProgressStatus,
  Role,
  Space,
  SpaceBundle,
  SpaceBundleView,
  SpaceView,
  Submission,
  Tag,
  TagColor,
  Task,
  User,
  Comment,
  CommentView,
  Quiz,
  QuizForStudent,
  QuizOption,
  QuizQuestion,
  QuizResult,
  QuizView,
} from '../types'

/* ------------------------------- входные DTO ------------------------------ */

export interface SignUpInput {
  name: string
  email: string
  password: string
  role: Role
}

export interface SignInInput {
  email: string
  password: string
}

export interface CreateSpaceInput {
  name: string
  description?: string | null
  color?: CardColor
}

export interface CreateFolderInput {
  space_id: string
  parent_id?: string | null
  name: string
  color?: CardColor
}

export interface CreateMaterialInput {
  space_id: string
  folder_id?: string | null
  title: string
  description?: string | null
  type: MaterialType
  file_url?: string | null
  file_name?: string | null
  file_size?: number | null
  mime_type?: string | null
  content?: string | null
  color?: CardColor
  tagIds?: string[]
}

export interface CreateAssignmentInput {
  space_id: string
  title: string
  lesson_id?: string | null
  description?: string | null
  due_date?: string | null
  allow_late?: boolean
  attachments?: string[]
}

export interface UploadResult {
  file_url: string
  file_name: string
  file_size: number
  mime_type: string
}

/** Событие «что-то изменилось» — для realtime-обновления списков */
export type ChangeEvent = {
  table:
    | 'materials'
    | 'folders'
    | 'assignments'
    | 'submissions'
    | 'tasks'
    | 'spaces'
    | 'tags'
    | 'progress'
    | 'starred'
    | 'comments'
    | 'quizzes'
    | 'quiz_attempts'
    | 'gradebook'
  spaceId?: string | null
}

export interface CreateGradeItemInput {
  space_id: string
  title: string
  date: string
  period_id?: string | null
  category_id?: string | null
  lesson_id?: string | null
  assignment_id?: string | null
  max_score?: number
  weight?: number
  scale_id?: string | null
}

export interface CreateLessonInput {
  space_id: string
  title: string
  date: string
  topic?: string | null
  period_id?: string | null
  category_id?: string | null
  status_id?: string | null
  priority_id?: string | null
  starts_at?: string | null
  duration_min?: number | null
  homework?: string | null
  notes?: string | null
}

export interface GradeInput {
  score?: number | null
  flag?: GradeFlag
  comment?: string | null
}

/* ------------------------------ провайдер --------------------------------- */

export interface DataProvider {
  readonly kind: 'mock' | 'supabase'

  /* --- auth --- */
  getCurrentUser(): Promise<User | null>
  signUp(input: SignUpInput): Promise<User>
  signIn(input: SignInInput): Promise<User>
  /** redirectTo — абсолютный адрес, куда вернуть пользователя после согласия Google */
  signInWithGoogle?(redirectTo?: string): Promise<void>
  /** Запомнить роль, выбранную перед уходом на страницу Google */
  rememberPendingRole?(role: Role): void
  /** Запомнить, с какой вкладки уходили в Google: вход или регистрация */
  rememberAuthMode?(mode: 'signin' | 'signup'): void
  signOut(): Promise<void>
  updateProfile(patch: Partial<Pick<User, 'name' | 'avatar'>>): Promise<User>
  /** Задать или сменить пароль (недоступно в локальном режиме) */
  setPassword?(password: string): Promise<void>
  /** Загрузить фото профиля и получить ссылку на него */
  uploadAvatar(file: File): Promise<string>
  /** Сменить роль аккаунта (разрешено, пока нет членства в чужих курсах) */
  setRole(role: Role): Promise<User>
  onAuthChange(cb: (user: User | null) => void): () => void

  /* --- пространства --- */
  listSpaces(): Promise<SpaceView[]>
  createSpace(input: CreateSpaceInput): Promise<Space>
  updateSpace(
    id: string,
    patch: Partial<
      Pick<
        Space,
        | 'name'
        | 'description'
        | 'color'
        | 'join_open'
        | 'is_locked'
        | 'student_upload'
        | 'show_assignments'
        | 'show_calendar'
        | 'show_members'
      >
    >,
  ): Promise<Space>
  deleteSpace(id: string): Promise<void>
  joinSpaceByCode(code: string): Promise<Space>
  setMemberPermission(spaceId: string, userId: string, permission: Permission): Promise<void>
  removeMember(spaceId: string, userId: string): Promise<void>
  regenerateInviteCode(spaceId: string): Promise<string>

  /* --- обсуждения --- */
  listComments(target: { materialId?: string; assignmentId?: string }): Promise<CommentView[]>
  addComment(input: {
    space_id: string
    material_id?: string
    assignment_id?: string
    body: string
  }): Promise<Comment>
  deleteComment(id: string): Promise<void>

  /* --- тесты --- */
  listQuizzes(spaceId: string): Promise<QuizView[]>
  createQuiz(input: { space_id: string; title: string; description?: string | null; due_date?: string | null; attempts_allowed?: number }): Promise<Quiz>
  updateQuiz(id: string, patch: Partial<Pick<Quiz, 'title' | 'description' | 'due_date' | 'attempts_allowed' | 'published'>>): Promise<Quiz>
  deleteQuiz(id: string): Promise<void>
  /** Вопросы с правильными ответами — только для преподавателя */
  listQuizEditor(quizId: string): Promise<Array<QuizQuestion & { options: QuizOption[] }>>
  saveQuizQuestions(
    quizId: string,
    questions: Array<{ text: string; multiple: boolean; points: number; options: Array<{ text: string; is_correct: boolean }> }>,
  ): Promise<void>
  /** Тест для прохождения: без правильных ответов */
  getQuizForStudent(quizId: string): Promise<QuizForStudent>
  submitQuiz(quizId: string, answers: Record<string, string[]>): Promise<QuizResult>

  /* --- папки --- */
  listFolders(spaceId: string): Promise<Folder[]>
  createFolder(input: CreateFolderInput): Promise<Folder>
  updateFolder(id: string, patch: Partial<Pick<Folder, 'name' | 'color' | 'parent_id'>>): Promise<Folder>
  deleteFolder(id: string): Promise<void>

  /* --- материалы --- */
  listMaterials(spaceId: string): Promise<MaterialView[]>
  /** Материалы всех доступных пространств — для дашборда и глобального поиска */
  listAllMaterials(): Promise<MaterialView[]>
  createMaterial(input: CreateMaterialInput): Promise<Material>
  updateMaterial(id: string, patch: Partial<Material> & { tagIds?: string[] }): Promise<Material>
  deleteMaterial(id: string): Promise<void>
  uploadFile(spaceId: string, file: File, onProgress?: (pct: number) => void): Promise<UploadResult>
  /** Ссылка для просмотра/скачивания (в mock — object URL из IndexedDB) */
  resolveFileUrl(material: Pick<Material, 'file_url' | 'type'>): Promise<string | null>

  /* --- теги --- */
  listTags(): Promise<Tag[]>
  createTag(input: { name: string; color: TagColor; icon: string }): Promise<Tag>
  deleteTag(id: string): Promise<void>
  setMaterialTags(materialId: string, tagIds: string[]): Promise<void>

  /* --- избранное и прогресс --- */
  toggleStar(materialId: string): Promise<boolean>
  setProgress(materialId: string, status: ProgressStatus): Promise<void>
  listSpaceProgress(spaceId: string): Promise<Array<Progress & { user: Pick<User, 'id' | 'name' | 'avatar'> | null }>>

  /* --- задания --- */
  listAssignments(spaceId: string): Promise<AssignmentView[]>
  listAllAssignments(): Promise<AssignmentView[]>
  createAssignment(input: CreateAssignmentInput): Promise<Assignment>
  updateAssignment(id: string, patch: Partial<Assignment>): Promise<Assignment>
  deleteAssignment(id: string): Promise<void>
  submitAssignment(
    assignmentId: string,
    payload: { comment?: string | null; attachments?: string[] },
  ): Promise<Submission>
  gradeSubmission(submissionId: string, grade: number | null): Promise<Submission>

  /* --- личные задачи --- */
  listTasks(): Promise<Task[]>
  createTask(input: { title: string; due_date?: string | null; space_id?: string | null }): Promise<Task>
  updateTask(id: string, patch: Partial<Pick<Task, 'title' | 'done' | 'due_date'>>): Promise<Task>
  deleteTask(id: string): Promise<void>

  /* --- realtime --- */
  /* --- журнал оценок --- */
  /** Всё содержимое журнала пространства одним запросом */
  loadGradebook(spaceId: string): Promise<GradebookSnapshot>
  /** Создаёт шкалы/категории/периоды по умолчанию, если журнал пуст */
  ensureGradebook(spaceId: string): Promise<GradebookSnapshot>

  createScale(input: Omit<GradeScale, 'id' | 'created_at'>): Promise<GradeScale>
  updateScale(id: string, patch: Partial<Omit<GradeScale, 'id' | 'space_id'>>): Promise<GradeScale>
  deleteScale(id: string): Promise<void>

  createPeriod(input: Omit<GradePeriod, 'id' | 'created_at'>): Promise<GradePeriod>
  updatePeriod(id: string, patch: Partial<Omit<GradePeriod, 'id' | 'space_id'>>): Promise<GradePeriod>
  deletePeriod(id: string): Promise<void>

  createCategory(input: Omit<GradeCategory, 'id' | 'created_at'>): Promise<GradeCategory>
  updateCategory(id: string, patch: Partial<Omit<GradeCategory, 'id' | 'space_id'>>): Promise<GradeCategory>
  deleteCategory(id: string): Promise<void>

  createGradeItem(input: CreateGradeItemInput): Promise<GradeItem>
  updateGradeItem(id: string, patch: Partial<Omit<GradeItem, 'id' | 'space_id'>>): Promise<GradeItem>
  deleteGradeItem(id: string): Promise<void>

  /* критерии оценивания */
  createCriterion(input: Omit<GradeCriterion, 'id' | 'created_at'>): Promise<GradeCriterion>
  updateCriterion(
    id: string,
    patch: Partial<Omit<GradeCriterion, 'id' | 'space_id'>>,
  ): Promise<GradeCriterion>
  deleteCriterion(id: string): Promise<void>
  /** Проставляет баллы по критериям и записывает сумму в оценку за работу */
  setCriterionScores(
    itemId: string,
    studentId: string,
    values: Array<Pick<CriterionScore, 'criterion_id' | 'score'>>,
  ): Promise<Grade>

  /** Upsert одной клетки журнала */
  setGrade(itemId: string, studentId: string, input: GradeInput): Promise<Grade>
  clearGrade(itemId: string, studentId: string): Promise<void>

  /* уроки */
  createLesson(input: CreateLessonInput): Promise<Lesson>
  updateLesson(id: string, patch: Partial<Omit<Lesson, 'id' | 'space_id'>>): Promise<Lesson>
  deleteLesson(id: string): Promise<void>

  /* настраиваемые справочники занятий */
  createLessonStatus(input: Omit<LessonStatus, 'id' | 'created_at'>): Promise<LessonStatus>
  updateLessonStatus(
    id: string,
    patch: Partial<Omit<LessonStatus, 'id' | 'space_id'>>,
  ): Promise<LessonStatus>
  deleteLessonStatus(id: string): Promise<void>

  createLessonPriority(input: Omit<LessonPriority, 'id' | 'created_at'>): Promise<LessonPriority>
  updateLessonPriority(
    id: string,
    patch: Partial<Omit<LessonPriority, 'id' | 'space_id'>>,
  ): Promise<LessonPriority>
  deleteLessonPriority(id: string): Promise<void>

  /* --- наборы пространств: один код на несколько пространств --- */
  listBundles(): Promise<SpaceBundleView[]>
  createBundle(input: {
    name: string
    description?: string | null
    permission?: Permission
  }): Promise<SpaceBundle>
  updateBundle(
    id: string,
    patch: Partial<Pick<SpaceBundle, 'name' | 'description' | 'permission'>>,
  ): Promise<SpaceBundle>
  deleteBundle(id: string): Promise<void>
  regenerateBundleCode(id: string): Promise<string>
  /** Добавить в набор своё пространство (или любое, где есть право правки) */
  addSpaceToBundle(bundleId: string, spaceId: string): Promise<void>
  removeSpaceFromBundle(bundleId: string, spaceId: string): Promise<void>
  /** Подключить своё пространство к чужому набору по его коду */
  attachSpaceToBundleByCode(code: string, spaceId: string): Promise<SpaceBundle>

  setAttendance(
    spaceId: string,
    studentId: string,
    date: string,
    status: AttendanceStatus,
    note?: string | null,
  ): Promise<Attendance>
  clearAttendance(spaceId: string, studentId: string, date: string): Promise<void>

  /* --- realtime --- */
  subscribe(cb: (e: ChangeEvent) => void): () => void

  /** Кто сейчас открыл это пространство. Возвращает функцию отписки. */
  joinPresence?(
    spaceId: string,
    me: Pick<User, 'id' | 'name' | 'avatar'>,
    onChange: (people: Array<Pick<User, 'id' | 'name' | 'avatar'>>) => void,
  ): () => void

  /** Живая передача текста конспекта соавторам, пока он ещё не сохранён. */
  joinNoteChannel?(
    materialId: string,
    me: Pick<User, 'id' | 'name'>,
    onRemote: (payload: { html: string; by: string; byName: string }) => void,
  ): { send: (html: string) => void; leave: () => void }

  /* --- резервная копия (только локальный режим) --- */
  snapshot?(): string
  restore?(json: string): void
}
