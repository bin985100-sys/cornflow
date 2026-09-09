import type {
  Assignment,
  AssignmentView,
  Attendance,
  AttendanceStatus,
  CriterionScore,
  Folder,
  Grade,
  GradeCategory,
  GradeCriterion,
  GradeItem,
  GradePeriod,
  GradeScale,
  GradebookSnapshot,
  Lesson,
  LessonPriority,
  LessonStatus,
  SpaceBundle,
  SpaceBundleView,
  Material,
  MaterialTag,
  MaterialView,
  Permission,
  Progress,
  ProgressStatus,
  Space,
  SpaceMember,
  SpaceView,
  Starred,
  Submission,
  Tag,
  Task,
  User,
  Comment,
  CommentView,
  Quiz,
  QuizAttempt,
  QuizForStudent,
  QuizOption,
  QuizQuestion,
  QuizResult,
  QuizView,
  AccountResult,
  GroupView,
  School,
  SchoolClass,
  SchoolGroup,
  SchoolParallel,
  SchoolPerson,
  SchoolRole,
  SchoolSnapshot,
  SchoolSubject,
  SubjectAssessmentType,
  SubjectView,
  TeachingAssignment,
} from '../types'
import { colorFromString, inviteCode, nowIso, uid } from '../utils'
import {
  DEFAULT_CATEGORIES,
  DEFAULT_LESSON_PRIORITIES,
  DEFAULT_LESSON_STATUSES,
  defaultPeriods,
  presetByKey,
} from '../grading'
import { blobUrl, deleteBlob, putBlob } from './idb'
import type {
  ChangeEvent,
  CreateAssignmentInput,
  CreateFolderInput,
  CreateGradeItemInput,
  CreateLessonInput,
  CreateMaterialInput,
  CreateGroupInput,
  CreatePersonInput,
  CreateSpaceInput,
  CreateSubjectInput,
  DataProvider,
  GradeInput,
  SchoolSignInInput,
  SignInInput,
  SignUpInput,
  UploadResult,
} from './provider'
import { DEFAULT_TAGS, personalSpace } from './seed'

const DB_KEY = 'cornflow.db.v2'
const DB_BACKUP_KEY = 'cornflow.db.v2.backup'
const SESSION_KEY = 'cornflow.session.v2'
const SCHEMA_VERSION = 2

interface MockDB {
  __version: number
  users: Array<User & { password: string }>
  spaces: Space[]
  space_members: SpaceMember[]
  folders: Folder[]
  materials: Material[]
  tags: Tag[]
  material_tags: MaterialTag[]
  assignments: Assignment[]
  submissions: Submission[]
  starred: Starred[]
  tasks: Task[]
  progress: Progress[]
  comments: Comment[]
  quizzes: Quiz[]
  quiz_questions: Array<QuizQuestion & { options: QuizOption[] }>
  quiz_attempts: QuizAttempt[]
  grade_scales: GradeScale[]
  grade_periods: GradePeriod[]
  grade_categories: GradeCategory[]
  grade_items: GradeItem[]
  grades: Grade[]
  grade_criteria: GradeCriterion[]
  criterion_scores: CriterionScore[]
  lessons: Lesson[]
  lesson_statuses: LessonStatus[]
  lesson_priorities: LessonPriority[]
  space_bundles: SpaceBundle[]
  bundle_spaces: Array<{ bundle_id: string; space_id: string; added_by: string | null; added_at: string }>
  attendance: Attendance[]
  schools: School[]
  school_people: SchoolPerson[]
  school_parallels: SchoolParallel[]
  school_classes: SchoolClass[]
  school_subjects: SchoolSubject[]
  subject_classes: Array<{ subject_id: string; class_id: string }>
  subject_assessment_types: SubjectAssessmentType[]
  school_groups: SchoolGroup[]
  group_members: Array<{ group_id: string; person_id: string; added_at: string }>
  teaching_assignments: TeachingAssignment[]
}

function emptyDb(): MockDB {
  return {
    __version: SCHEMA_VERSION,
    users: [],
    spaces: [],
    space_members: [],
    folders: [],
    materials: [],
    tags: DEFAULT_TAGS,
    material_tags: [],
    assignments: [],
    submissions: [],
    starred: [],
    tasks: [],
    progress: [],
    comments: [],
    quizzes: [],
    quiz_questions: [],
    quiz_attempts: [],
    grade_scales: [],
    grade_periods: [],
    grade_categories: [],
    grade_items: [],
    grades: [],
    grade_criteria: [],
    criterion_scores: [],
    lessons: [],
    lesson_statuses: [],
    lesson_priorities: [],
    space_bundles: [],
    bundle_spaces: [],
    attendance: [],
    schools: [],
    school_people: [],
    school_parallels: [],
    school_classes: [],
    school_subjects: [],
    subject_classes: [],
    subject_assessment_types: [],
    school_groups: [],
    group_members: [],
    teaching_assignments: [],
  }
}

function parseDb(raw: string | null): MockDB | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<MockDB>
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.users)) return null
    // Словарь тегов дополняем базовым, если пользователь его не трогал
    const tags = Array.isArray(parsed.tags) && parsed.tags.length ? parsed.tags : DEFAULT_TAGS
    return { ...emptyDb(), ...parsed, tags, __version: SCHEMA_VERSION }
  } catch {
    return null
  }
}

/**
 * Читаем состояние: сначала основную запись, при повреждении — резервную копию
 * с прошлой удачной записи. Так данные не теряются, даже если запись оборвалась.
 */
function loadDb(): MockDB {
  const primary = parseDb(localStorage.getItem(DB_KEY))
  if (primary) return primary

  const backup = parseDb(localStorage.getItem(DB_BACKUP_KEY))
  if (backup) {
    localStorage.setItem(DB_KEY, JSON.stringify(backup))
    return backup
  }

  const fresh = emptyDb()
  localStorage.setItem(DB_KEY, JSON.stringify(fresh))
  return fresh
}

/** Небольшая искусственная задержка — чтобы скелетоны были видны и UI честно
 *  вёл себя как с сетевым бэкендом. */
function delay<T>(value: T, ms = 90): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export class MockProvider implements DataProvider {
  readonly kind = 'mock' as const

  private db: MockDB = loadDb()
  private listeners = new Set<(e: ChangeEvent) => void>()
  private authListeners = new Set<(u: User | null) => void>()
  private channel: BroadcastChannel | null = null
  private dataUrlCache = new Map<string, string>()

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('cornflow')
      this.channel.onmessage = (ev: MessageEvent<ChangeEvent & { __external?: true }>) => {
        // Изменение из другой вкладки — перечитываем и обновляем подписчиков.
        this.db = loadDb()
        this.listeners.forEach((cb) => cb(ev.data))
      }
    }
    window.addEventListener('storage', (e) => {
      if (e.key === SESSION_KEY) {
        this.getCurrentUser().then((u) => this.authListeners.forEach((cb) => cb(u)))
      }
    })
  }

  /* ------------------------------ инфраструктура ------------------------- */

  private persist(e: ChangeEvent) {
    const next = JSON.stringify(this.db)
    try {
      const previous = localStorage.getItem(DB_KEY)
      if (previous) localStorage.setItem(DB_BACKUP_KEY, previous)
      localStorage.setItem(DB_KEY, next)
    } catch (err) {
      // Переполнение хранилища: сообщаем наверх, но не роняем приложение —
      // состояние в памяти остаётся консистентным.
      console.error('CornFlow: не удалось сохранить данные', err)
      throw new Error(
        'Не удалось сохранить данные: закончилось место в локальном хранилище браузера. ' +
          'Выгрузите резервную копию в настройках или подключите Supabase.',
      )
    }
    this.listeners.forEach((cb) => cb(e))
    this.channel?.postMessage(e)
  }

  /** Полный снимок данных — для экспорта резервной копии. */
  snapshot(): string {
    return JSON.stringify(this.db, null, 2)
  }

  /** Восстановление из резервной копии. */
  restore(json: string) {
    const parsed = parseDb(json)
    if (!parsed) throw new Error('Файл резервной копии повреждён или имеет неверный формат')
    this.db = parsed
    this.persist({ table: 'spaces' })
  }

  private sessionUserId(): string | null {
    return localStorage.getItem(SESSION_KEY)
  }

  private me(): User & { password: string } {
    const id = this.sessionUserId()
    const user = this.db.users.find((u) => u.id === id)
    if (!user) throw new Error('Нужно войти в аккаунт')
    return user
  }

  private mySpaceIds(): string[] {
    const id = this.sessionUserId()
    if (!id) return []
    return this.db.space_members.filter((m) => m.user_id === id).map((m) => m.space_id)
  }

  private assertSpaceAccess(spaceId: string, needEdit = false) {
    const me = this.me()
    const member = this.db.space_members.find((m) => m.space_id === spaceId && m.user_id === me.id)
    if (!member) throw new Error('Нет доступа к этому пространству')
    if (needEdit && member.permission !== 'edit') throw new Error('Недостаточно прав: только просмотр')
  }


  /* =======================================================================
     Школа (локальный режим): те же правила, что и на сервере, но всё
     хранится в этом браузере. Аккаунты заводятся сразу, без серверной функции.
     ===================================================================== */

  private schoolRole(schoolId: string): SchoolRole {
    const me = this.me()
    const school = this.db.schools.find((s) => s.id === schoolId)
    if (school?.owner_id === me.id) return 'admin'
    const person = this.db.school_people.find((p) => p.school_id === schoolId && p.user_id === me.id)
    return person?.role ?? 'student'
  }

  private assertSchoolAdmin(schoolId: string) {
    if (this.schoolRole(schoolId) !== 'admin') {
      throw new Error('Менять справочник школы может только администратор')
    }
  }

  async listSchools(): Promise<School[]> {
    const me = this.me()
    return this.db.schools.filter(
      (s) =>
        s.owner_id === me.id ||
        this.db.school_people.some((p) => p.school_id === s.id && p.user_id === me.id),
    )
  }

  async createSchool(name: string): Promise<School> {
    const me = this.me()
    const school: School = {
      id: uid('school'),
      name: name.trim(),
      code: inviteCode(),
      owner_id: me.id,
      created_at: nowIso(),
    }
    this.db.schools.push(school)
    this.db.school_people.push({
      id: uid('person'),
      school_id: school.id,
      role: 'admin',
      last_name: me.name,
      first_name: '',
      middle_name: null,
      login: null,
      user_id: me.id,
      class_id: null,
      is_active: true,
      note: null,
      created_at: nowIso(),
    })
    this.persist({ table: 'school' })
    return school
  }

  async updateSchool(id: string, patch: Partial<Pick<School, 'name' | 'code'>>): Promise<School> {
    this.assertSchoolAdmin(id)
    const school = this.db.schools.find((s) => s.id === id)
    if (!school) throw new Error('Школа не найдена')
    Object.assign(school, patch)
    this.persist({ table: 'school' })
    return school
  }

  async deleteSchool(id: string): Promise<void> {
    const school = this.db.schools.find((s) => s.id === id)
    if (!school) return
    const me = this.me()
    if (school.owner_id !== me.id) throw new Error('Удалить школу может только её создатель')
    const classIds = this.db.school_classes.filter((c) => c.school_id === id).map((c) => c.id)
    const subjectIds = this.db.school_subjects.filter((x) => x.school_id === id).map((x) => x.id)
    const groupIds = this.db.school_groups.filter((g) => g.school_id === id).map((g) => g.id)
    this.db.schools = this.db.schools.filter((s) => s.id !== id)
    this.db.school_people = this.db.school_people.filter((p) => p.school_id !== id)
    this.db.school_parallels = this.db.school_parallels.filter((p) => p.school_id !== id)
    this.db.school_classes = this.db.school_classes.filter((c) => !classIds.includes(c.id))
    this.db.school_subjects = this.db.school_subjects.filter((x) => !subjectIds.includes(x.id))
    this.db.subject_classes = this.db.subject_classes.filter((l) => !subjectIds.includes(l.subject_id))
    this.db.subject_assessment_types = this.db.subject_assessment_types.filter(
      (t) => !subjectIds.includes(t.subject_id),
    )
    this.db.school_groups = this.db.school_groups.filter((g) => !groupIds.includes(g.id))
    this.db.group_members = this.db.group_members.filter((m) => !groupIds.includes(m.group_id))
    this.db.teaching_assignments = this.db.teaching_assignments.filter((a) => a.school_id !== id)
    this.persist({ table: 'school' })
  }

  async loadSchool(schoolId: string): Promise<SchoolSnapshot> {
    const school = this.db.schools.find((s) => s.id === schoolId)
    if (!school) throw new Error('Школа не найдена')
    return {
      school,
      role: this.schoolRole(schoolId),
      parallels: this.db.school_parallels
        .filter((p) => p.school_id === schoolId)
        .sort((a, b) => a.position - b.position),
      classes: this.db.school_classes
        .filter((c) => c.school_id === schoolId)
        .sort((a, b) => a.position - b.position),
      people: this.db.school_people
        .filter((p) => p.school_id === schoolId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name, 'ru')),
      subjects: this.db.school_subjects
        .filter((x) => x.school_id === schoolId)
        .map((sub) => ({
          ...sub,
          class_ids: this.db.subject_classes.filter((l) => l.subject_id === sub.id).map((l) => l.class_id),
          assessment_types: this.db.subject_assessment_types
            .filter((t) => t.subject_id === sub.id)
            .sort((a, b) => a.position - b.position),
        })),
      groups: this.db.school_groups
        .filter((g) => g.school_id === schoolId)
        .map((g) => ({
          ...g,
          member_ids: this.db.group_members.filter((m) => m.group_id === g.id).map((m) => m.person_id),
        })),
      assignments: this.db.teaching_assignments.filter((a) => a.school_id === schoolId),
    }
  }

  async createParallel(schoolId: string, name: string): Promise<SchoolParallel> {
    this.assertSchoolAdmin(schoolId)
    const row: SchoolParallel = {
      id: uid('parallel'),
      school_id: schoolId,
      name: name.trim(),
      position: this.db.school_parallels.filter((p) => p.school_id === schoolId).length,
      created_at: nowIso(),
    }
    this.db.school_parallels.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async updateParallel(
    id: string,
    patch: Partial<Pick<SchoolParallel, 'name' | 'position'>>,
  ): Promise<SchoolParallel> {
    const row = this.db.school_parallels.find((p) => p.id === id)
    if (!row) throw new Error('Параллель не найдена')
    this.assertSchoolAdmin(row.school_id)
    Object.assign(row, patch)
    this.persist({ table: 'school' })
    return row
  }

  async deleteParallel(id: string): Promise<void> {
    const row = this.db.school_parallels.find((p) => p.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    const classIds = this.db.school_classes.filter((c) => c.parallel_id === id).map((c) => c.id)
    this.db.school_parallels = this.db.school_parallels.filter((p) => p.id !== id)
    this.db.school_classes = this.db.school_classes.filter((c) => c.parallel_id !== id)
    this.db.school_people.forEach((p) => {
      if (p.class_id && classIds.includes(p.class_id)) p.class_id = null
    })
    this.persist({ table: 'school' })
  }

  async createClass(schoolId: string, parallelId: string, name: string): Promise<SchoolClass> {
    this.assertSchoolAdmin(schoolId)
    const row: SchoolClass = {
      id: uid('class'),
      school_id: schoolId,
      parallel_id: parallelId,
      name: name.trim(),
      position: this.db.school_classes.filter((c) => c.parallel_id === parallelId).length,
      created_at: nowIso(),
    }
    this.db.school_classes.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async updateClass(
    id: string,
    patch: Partial<Pick<SchoolClass, 'name' | 'parallel_id' | 'position'>>,
  ): Promise<SchoolClass> {
    const row = this.db.school_classes.find((c) => c.id === id)
    if (!row) throw new Error('Класс не найден')
    this.assertSchoolAdmin(row.school_id)
    Object.assign(row, patch)
    this.persist({ table: 'school' })
    return row
  }

  async deleteClass(id: string): Promise<void> {
    const row = this.db.school_classes.find((c) => c.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    this.db.school_classes = this.db.school_classes.filter((c) => c.id !== id)
    this.db.school_people.forEach((p) => {
      if (p.class_id === id) p.class_id = null
    })
    this.persist({ table: 'school' })
  }

  async createPerson(input: CreatePersonInput): Promise<SchoolPerson> {
    const [row] = await this.createPeople([input])
    return row
  }

  async createPeople(inputs: CreatePersonInput[]): Promise<SchoolPerson[]> {
    if (!inputs.length) return []
    this.assertSchoolAdmin(inputs[0].school_id)
    const rows: SchoolPerson[] = inputs.map((i) => ({
      id: uid('person'),
      school_id: i.school_id,
      role: i.role,
      last_name: i.last_name.trim(),
      first_name: i.first_name.trim(),
      middle_name: i.middle_name ?? null,
      login: i.login ?? null,
      user_id: null,
      class_id: i.class_id ?? null,
      is_active: true,
      note: i.note ?? null,
      created_at: nowIso(),
    }))
    this.db.school_people.push(...rows)
    this.persist({ table: 'school' })
    return rows
  }

  async updatePerson(
    id: string,
    patch: Partial<
      Pick<
        SchoolPerson,
        'last_name' | 'first_name' | 'middle_name' | 'class_id' | 'login' | 'is_active' | 'note' | 'role'
      >
    >,
  ): Promise<SchoolPerson> {
    const row = this.db.school_people.find((p) => p.id === id)
    if (!row) throw new Error('Человек не найден')
    this.assertSchoolAdmin(row.school_id)
    Object.assign(row, patch)
    this.persist({ table: 'school' })
    return row
  }

  async deletePerson(id: string): Promise<void> {
    const row = this.db.school_people.find((p) => p.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    this.db.school_people = this.db.school_people.filter((p) => p.id !== id)
    this.db.group_members = this.db.group_members.filter((m) => m.person_id !== id)
    this.persist({ table: 'school' })
  }

  async createAccounts(
    schoolId: string,
    people: Array<{ person_id: string; login: string; password: string }>,
  ): Promise<AccountResult[]> {
    this.assertSchoolAdmin(schoolId)
    const school = this.db.schools.find((s) => s.id === schoolId)
    if (!school) throw new Error('Школа не найдена')
    const results: AccountResult[] = []
    for (const item of people) {
      const person = this.db.school_people.find((p) => p.id === item.person_id)
      if (!person || person.school_id !== schoolId) {
        results.push({ person_id: item.person_id, ok: false, error: 'Человек не найден' })
        continue
      }
      if (item.password.trim().length < 6) {
        results.push({ person_id: item.person_id, ok: false, error: 'Пароль короче 6 символов' })
        continue
      }
      const login = item.login.trim()
      const email = `${login.toLowerCase()}@${school.code.toLowerCase()}.cornflow.school`
      const name = [person.last_name, person.first_name].filter(Boolean).join(' ') || login
      const existing = person.user_id ? this.db.users.find((u) => u.id === person.user_id) : undefined
      if (existing) {
        existing.password = item.password
        existing.name = name
      } else {
        this.db.users.push({
          id: uid('user'),
          name,
          email,
          role: person.role === 'student' ? 'student' : 'teacher',
          avatar: null,
          created_at: nowIso(),
          password: item.password,
        })
        person.user_id = this.db.users[this.db.users.length - 1].id
      }
      person.login = login
      results.push({ person_id: person.id, ok: true, login })
    }
    this.persist({ table: 'school' })
    return results
  }

  async setAccountPassword(
    schoolId: string,
    people: Array<{ person_id: string; password: string }>,
  ): Promise<AccountResult[]> {
    this.assertSchoolAdmin(schoolId)
    const results: AccountResult[] = []
    for (const item of people) {
      const person = this.db.school_people.find((p) => p.id === item.person_id)
      const user = person?.user_id ? this.db.users.find((u) => u.id === person.user_id) : undefined
      if (!user) {
        results.push({ person_id: item.person_id, ok: false, error: 'У человека ещё нет аккаунта' })
        continue
      }
      if (item.password.trim().length < 6) {
        results.push({ person_id: item.person_id, ok: false, error: 'Пароль короче 6 символов' })
        continue
      }
      user.password = item.password
      results.push({ person_id: item.person_id, ok: true })
    }
    this.persist({ table: 'school' })
    return results
  }

  private mockSubjectView(id: string): SubjectView {
    const subject = this.db.school_subjects.find((x) => x.id === id)
    if (!subject) throw new Error('Предмет не найден')
    return {
      ...subject,
      class_ids: this.db.subject_classes.filter((l) => l.subject_id === id).map((l) => l.class_id),
      assessment_types: this.db.subject_assessment_types
        .filter((t) => t.subject_id === id)
        .sort((a, b) => a.position - b.position),
    }
  }

  async createSubject(input: CreateSubjectInput): Promise<SubjectView> {
    this.assertSchoolAdmin(input.school_id)
    const subject: SchoolSubject = {
      id: uid('subject'),
      school_id: input.school_id,
      name: input.name.trim(),
      code: input.code ?? null,
      color: input.color ?? colorFromString(input.name),
      position: this.db.school_subjects.filter((x) => x.school_id === input.school_id).length,
      created_at: nowIso(),
    }
    this.db.school_subjects.push(subject)
    for (const classId of input.class_ids ?? []) {
      this.db.subject_classes.push({ subject_id: subject.id, class_id: classId })
    }
    this.persist({ table: 'school' })
    return this.mockSubjectView(subject.id)
  }

  async updateSubject(
    id: string,
    patch: Partial<Pick<SchoolSubject, 'name' | 'code' | 'color' | 'position'>> & { class_ids?: string[] },
  ): Promise<SubjectView> {
    const subject = this.db.school_subjects.find((x) => x.id === id)
    if (!subject) throw new Error('Предмет не найден')
    this.assertSchoolAdmin(subject.school_id)
    const { class_ids, ...rest } = patch
    Object.assign(subject, rest)
    if (class_ids) {
      this.db.subject_classes = this.db.subject_classes.filter((l) => l.subject_id !== id)
      for (const classId of class_ids) this.db.subject_classes.push({ subject_id: id, class_id: classId })
    }
    this.persist({ table: 'school' })
    return this.mockSubjectView(id)
  }

  async deleteSubject(id: string): Promise<void> {
    const subject = this.db.school_subjects.find((x) => x.id === id)
    if (!subject) return
    this.assertSchoolAdmin(subject.school_id)
    this.db.school_subjects = this.db.school_subjects.filter((x) => x.id !== id)
    this.db.subject_classes = this.db.subject_classes.filter((l) => l.subject_id !== id)
    this.db.subject_assessment_types = this.db.subject_assessment_types.filter((t) => t.subject_id !== id)
    this.db.teaching_assignments = this.db.teaching_assignments.filter((a) => a.subject_id !== id)
    this.persist({ table: 'school' })
  }

  async addAssessmentType(
    subjectId: string,
    input: Omit<SubjectAssessmentType, 'id' | 'subject_id' | 'created_at'>,
  ): Promise<SubjectAssessmentType> {
    const subject = this.db.school_subjects.find((x) => x.id === subjectId)
    if (!subject) throw new Error('Предмет не найден')
    this.assertSchoolAdmin(subject.school_id)
    const row: SubjectAssessmentType = { ...input, id: uid('atype'), subject_id: subjectId, created_at: nowIso() }
    this.db.subject_assessment_types.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async updateAssessmentType(
    id: string,
    patch: Partial<Omit<SubjectAssessmentType, 'id' | 'subject_id' | 'created_at'>>,
  ): Promise<SubjectAssessmentType> {
    const row = this.db.subject_assessment_types.find((t) => t.id === id)
    if (!row) throw new Error('Тип оценивания не найден')
    Object.assign(row, patch)
    this.persist({ table: 'school' })
    return row
  }

  async deleteAssessmentType(id: string): Promise<void> {
    this.db.subject_assessment_types = this.db.subject_assessment_types.filter((t) => t.id !== id)
    this.persist({ table: 'school' })
  }

  private mockGroupView(id: string): GroupView {
    const group = this.db.school_groups.find((g) => g.id === id)
    if (!group) throw new Error('Группа не найдена')
    return {
      ...group,
      member_ids: this.db.group_members.filter((m) => m.group_id === id).map((m) => m.person_id),
    }
  }

  async createGroup(input: CreateGroupInput): Promise<GroupView> {
    this.assertSchoolAdmin(input.school_id)
    const group: SchoolGroup = {
      id: uid('group'),
      school_id: input.school_id,
      name: input.name.trim(),
      kind: input.kind,
      parallel_id: input.parallel_id ?? null,
      class_id: input.class_id ?? null,
      created_at: nowIso(),
    }
    this.db.school_groups.push(group)
    for (const personId of input.member_ids ?? []) {
      this.db.group_members.push({ group_id: group.id, person_id: personId, added_at: nowIso() })
    }
    this.persist({ table: 'school' })
    return this.mockGroupView(group.id)
  }

  async updateGroup(
    id: string,
    patch: Partial<Pick<SchoolGroup, 'name' | 'parallel_id' | 'class_id'>> & { member_ids?: string[] },
  ): Promise<GroupView> {
    const group = this.db.school_groups.find((g) => g.id === id)
    if (!group) throw new Error('Группа не найдена')
    this.assertSchoolAdmin(group.school_id)
    const { member_ids, ...rest } = patch
    Object.assign(group, rest)
    if (member_ids) {
      this.db.group_members = this.db.group_members.filter((m) => m.group_id !== id)
      for (const personId of member_ids) {
        this.db.group_members.push({ group_id: id, person_id: personId, added_at: nowIso() })
      }
    }
    this.persist({ table: 'school' })
    return this.mockGroupView(id)
  }

  async deleteGroup(id: string): Promise<void> {
    const group = this.db.school_groups.find((g) => g.id === id)
    if (!group) return
    this.assertSchoolAdmin(group.school_id)
    this.db.school_groups = this.db.school_groups.filter((g) => g.id !== id)
    this.db.group_members = this.db.group_members.filter((m) => m.group_id !== id)
    this.db.teaching_assignments = this.db.teaching_assignments.filter((a) => a.group_id !== id)
    this.persist({ table: 'school' })
  }

  async createTeaching(input: {
    school_id: string
    subject_id: string
    group_id: string
    teacher_id: string | null
  }): Promise<TeachingAssignment> {
    this.assertSchoolAdmin(input.school_id)
    const me = this.me()
    const subject = this.mockSubjectView(input.subject_id)
    const group = this.mockGroupView(input.group_id)

    const space: Space = {
      id: uid('space'),
      name: `${subject.name} · ${group.name}`,
      description: 'Курс собран из школы: предмет, группа и учитель',
      owner_id: me.id,
      color: subject.color,
      invite_code: inviteCode(),
      created_at: nowIso(),
      join_open: true,
      is_locked: false,
      student_upload: false,
      show_assignments: true,
      show_calendar: true,
      show_members: true,
    }
    this.db.spaces.push(space)
    this.db.space_members.push({
      space_id: space.id,
      user_id: me.id,
      permission: 'edit',
      joined_at: nowIso(),
    })
    const teacher = this.db.school_people.find((p) => p.id === input.teacher_id)
    if (teacher?.user_id && teacher.user_id !== me.id) {
      this.db.space_members.push({
        space_id: space.id,
        user_id: teacher.user_id,
        permission: 'edit',
        joined_at: nowIso(),
      })
    }
    for (const personId of group.member_ids) {
      const person = this.db.school_people.find((p) => p.id === personId)
      if (person?.user_id && !this.db.space_members.some((m) => m.space_id === space.id && m.user_id === person.user_id)) {
        this.db.space_members.push({
          space_id: space.id,
          user_id: person.user_id,
          permission: 'view',
          joined_at: nowIso(),
        })
      }
    }

    const row: TeachingAssignment = {
      id: uid('teaching'),
      school_id: input.school_id,
      subject_id: input.subject_id,
      group_id: input.group_id,
      teacher_id: input.teacher_id,
      space_id: space.id,
      created_at: nowIso(),
    }
    this.db.teaching_assignments.push(row)
    this.persist({ table: 'school' })
    this.persist({ table: 'spaces' })
    return row
  }

  async deleteTeaching(id: string): Promise<void> {
    const row = this.db.teaching_assignments.find((a) => a.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    this.db.teaching_assignments = this.db.teaching_assignments.filter((a) => a.id !== id)
    this.persist({ table: 'school' })
  }

  async signInToSchool(input: SchoolSignInInput): Promise<User> {
    const code = input.code.trim().toUpperCase()
    const login = input.login.trim().toLowerCase()
    const school = this.db.schools.find((s) => s.code.toUpperCase() === code)
    const person = school
      ? this.db.school_people.find(
          (p) => p.school_id === school.id && (p.login ?? '').toLowerCase() === login && p.is_active,
        )
      : undefined
    const user = person?.user_id ? this.db.users.find((u) => u.id === person.user_id) : undefined
    if (!user || user.password !== input.password) {
      throw new Error('Неверный код школы, логин или пароль')
    }
    localStorage.setItem(SESSION_KEY, user.id)
    const { password: _pw, ...rest } = user
    void _pw
    this.authListeners.forEach((cb) => cb(rest))
    return rest
  }

  subscribe(cb: (e: ChangeEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /* ---------------------------------- auth ------------------------------- */

  async getCurrentUser(): Promise<User | null> {
    const id = this.sessionUserId()
    if (!id) return null
    const u = this.db.users.find((x) => x.id === id)
    if (!u) return null
    const { password: _pw, ...rest } = u
    void _pw
    return delay(rest, 40)
  }

  async signUp(input: SignUpInput): Promise<User> {
    const email = input.email.trim().toLowerCase()
    if (this.db.users.some((u) => u.email === email)) {
      throw new Error('Пользователь с такой почтой уже существует')
    }
    if (input.password.length < 6) throw new Error('Пароль должен быть не короче 6 символов')

    const user: User & { password: string } = {
      id: uid('usr'),
      name: input.name.trim() || 'Без имени',
      email,
      role: input.role,
      avatar: null,
      created_at: nowIso(),
      password: input.password,
    }
    this.db.users.push(user)

    const { space, member } = personalSpace(user)
    this.db.spaces.push(space)
    this.db.space_members.push(member)

    localStorage.setItem(SESSION_KEY, user.id)
    this.persist({ table: 'spaces' })

    const { password: _pw, ...rest } = user
    void _pw
    this.authListeners.forEach((cb) => cb(rest))
    return rest
  }

  async signIn(input: SignInInput): Promise<User> {
    const email = input.email.trim().toLowerCase()
    const user = this.db.users.find((u) => u.email === email)
    if (!user || user.password !== input.password) throw new Error('Неверная почта или пароль')
    localStorage.setItem(SESSION_KEY, user.id)
    const { password: _pw, ...rest } = user
    void _pw
    this.authListeners.forEach((cb) => cb(rest))
    return delay(rest, 120)
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(SESSION_KEY)
    this.authListeners.forEach((cb) => cb(null))
  }

  async setRole(role: User['role']): Promise<User> {
    const me = this.me()
    const inOther = this.db.space_members.some(
      (m) =>
        m.user_id === me.id &&
        this.db.spaces.find((s) => s.id === m.space_id)?.owner_id !== me.id,
    )
    if (inOther) {
      throw new Error('Роль нельзя сменить: вы состоите в чужом курсе')
    }
    me.role = role
    this.persist({ table: 'spaces' })
    const { password: _pw, ...rest } = me
    void _pw
    this.authListeners.forEach((cb) => cb(rest))
    return rest
  }

  /** В локальном режиме фото хранится прямо в профиле как data-URL. */
  async uploadAvatar(file: File): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
      reader.readAsDataURL(file)
    })
  }

  async updateProfile(patch: Partial<Pick<User, 'name' | 'avatar'>>): Promise<User> {
    const me = this.me()
    Object.assign(me, patch)
    this.persist({ table: 'spaces' })
    const { password: _pw, ...rest } = me
    void _pw
    this.authListeners.forEach((cb) => cb(rest))
    return rest
  }

  onAuthChange(cb: (user: User | null) => void): () => void {
    this.authListeners.add(cb)
    return () => this.authListeners.delete(cb)
  }

  /* ------------------------------ пространства --------------------------- */

  private toSpaceView(space: Space, meId: string): SpaceView {
    const memberships = this.db.space_members.filter((m) => m.space_id === space.id)
    const mine = memberships.find((m) => m.user_id === meId)
    return {
      ...space,
      permission: mine?.permission ?? 'view',
      is_owner: space.owner_id === meId,
      members: memberships.map((m) => {
        const u = this.db.users.find((x) => x.id === m.user_id)
        return {
          id: m.user_id,
          name: u?.name ?? 'Участник',
          avatar: u?.avatar ?? null,
          role: u?.role ?? 'student',
          permission: m.permission,
        }
      }),
    }
  }

  async listSpaces(): Promise<SpaceView[]> {
    const me = this.sessionUserId()
    if (!me) return []
    const ids = this.mySpaceIds()
    const list = this.db.spaces
      .filter((s) => ids.includes(s.id))
      .map((s) => this.toSpaceView(s, me))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    return delay(list)
  }

  async createSpace(input: CreateSpaceInput): Promise<Space> {
    const me = this.me()
    const space: Space = {
      id: uid('spc'),
      name: input.name.trim(),
      description: input.description ?? null,
      owner_id: me.id,
      color: input.color ?? colorFromString(input.name),
      invite_code: inviteCode(),
      join_open: true,
      is_locked: false,
      student_upload: false,
      show_assignments: true,
      show_calendar: true,
      show_members: true,
      created_at: nowIso(),
    }
    this.db.spaces.push(space)
    this.db.space_members.push({
      space_id: space.id,
      user_id: me.id,
      permission: 'edit',
      joined_at: space.created_at,
    })
    this.persist({ table: 'spaces' })
    return space
  }

  async updateSpace(id: string, patch: Partial<Space>): Promise<Space> {
    const space = this.db.spaces.find((s) => s.id === id)
    if (!space) throw new Error('Пространство не найдено')
    if (space.owner_id !== this.me().id) throw new Error('Менять пространство может только владелец')
    Object.assign(space, patch)
    this.persist({ table: 'spaces', spaceId: id })
    return space
  }

  async deleteSpace(id: string): Promise<void> {
    const space = this.db.spaces.find((s) => s.id === id)
    if (!space) return
    if (space.owner_id !== this.me().id) throw new Error('Удалить пространство может только владелец')
    const materialIds = this.db.materials.filter((m) => m.space_id === id).map((m) => m.id)
    this.db.spaces = this.db.spaces.filter((s) => s.id !== id)
    this.db.space_members = this.db.space_members.filter((m) => m.space_id !== id)
    this.db.folders = this.db.folders.filter((f) => f.space_id !== id)
    this.db.materials = this.db.materials.filter((m) => m.space_id !== id)
    this.db.material_tags = this.db.material_tags.filter((mt) => !materialIds.includes(mt.material_id))
    const assignmentIds = this.db.assignments.filter((a) => a.space_id === id).map((a) => a.id)
    this.db.assignments = this.db.assignments.filter((a) => a.space_id !== id)
    this.db.submissions = this.db.submissions.filter((s) => !assignmentIds.includes(s.assignment_id))
    this.db.starred = this.db.starred.filter((s) => !materialIds.includes(s.material_id))
    this.db.progress = this.db.progress.filter((p) => !materialIds.includes(p.material_id))
    const gItemIds = this.db.grade_items.filter((i) => i.space_id === id).map((i) => i.id)
    const gCritIds = this.db.grade_criteria.filter((c) => c.space_id === id).map((c) => c.id)
    this.db.grade_items = this.db.grade_items.filter((i) => i.space_id !== id)
    this.db.grades = this.db.grades.filter((g) => !gItemIds.includes(g.item_id))
    this.db.grade_criteria = this.db.grade_criteria.filter((c) => c.space_id !== id)
    this.db.criterion_scores = this.db.criterion_scores.filter((cs) => !gCritIds.includes(cs.criterion_id))
    this.db.grade_scales = this.db.grade_scales.filter((x) => x.space_id !== id)
    this.db.grade_periods = this.db.grade_periods.filter((x) => x.space_id !== id)
    this.db.grade_categories = this.db.grade_categories.filter((x) => x.space_id !== id)
    this.db.attendance = this.db.attendance.filter((x) => x.space_id !== id)
    this.persist({ table: 'spaces' })
  }

  /**
   * Один код — и пространство, и набор пространств. Сначала ищем обычный
   * код приглашения, затем код набора: по нему вступаем сразу во все
   * пространства набора, в том числе чужие.
   */
  async joinSpaceByCode(code: string): Promise<Space> {
    const me = this.me()
    const normalized = code.trim().toUpperCase()

    const join = (space: Space, permission: Permission) => {
      const exists = this.db.space_members.find(
        (m) => m.space_id === space.id && m.user_id === me.id,
      )
      if (exists) return
      this.db.space_members.push({
        space_id: space.id,
        user_id: me.id,
        permission,
        joined_at: nowIso(),
      })
    }

    const space = this.db.spaces.find((s) => s.invite_code.toUpperCase() === normalized)
    if (space) {
      join(space, me.role === 'teacher' ? 'edit' : 'view')
      this.persist({ table: 'spaces', spaceId: space.id })
      return space
    }

    const bundle = this.db.space_bundles.find((b) => b.code.toUpperCase() === normalized)
    if (bundle) {
      const spaces = this.db.bundle_spaces
        .filter((bs) => bs.bundle_id === bundle.id)
        .map((bs) => this.db.spaces.find((sp) => sp.id === bs.space_id))
        .filter((sp): sp is Space => !!sp)
      if (!spaces.length) throw new Error('В этом наборе пока нет пространств')
      spaces.forEach((sp) => join(sp, bundle.permission))
      this.persist({ table: 'spaces' })
      return spaces[0]
    }

    throw new Error('Пространство или набор с таким кодом не найдены')
  }

  async setMemberPermission(spaceId: string, userId: string, permission: Permission): Promise<void> {
    const space = this.db.spaces.find((s) => s.id === spaceId)
    if (!space || space.owner_id !== this.me().id) throw new Error('Недостаточно прав')
    const member = this.db.space_members.find((m) => m.space_id === spaceId && m.user_id === userId)
    if (member) member.permission = permission
    this.persist({ table: 'spaces', spaceId })
  }

  async removeMember(spaceId: string, userId: string): Promise<void> {
    const space = this.db.spaces.find((s) => s.id === spaceId)
    if (!space || space.owner_id !== this.me().id) throw new Error('Недостаточно прав')
    if (userId === space.owner_id) throw new Error('Нельзя исключить владельца')
    this.db.space_members = this.db.space_members.filter(
      (m) => !(m.space_id === spaceId && m.user_id === userId),
    )
    this.persist({ table: 'spaces', spaceId })
  }

  async regenerateInviteCode(spaceId: string): Promise<string> {
    const space = this.db.spaces.find((s) => s.id === spaceId)
    if (!space || space.owner_id !== this.me().id) throw new Error('Недостаточно прав')
    space.invite_code = inviteCode()
    this.persist({ table: 'spaces', spaceId })
    return space.invite_code
  }

  /* ---------------------------------- папки ------------------------------ */


  /* ------------------------------ обсуждения ----------------------------- */

  async listComments(target: { materialId?: string; assignmentId?: string }): Promise<CommentView[]> {
    const rows = this.db.comments
      .filter((c) =>
        target.materialId ? c.material_id === target.materialId : c.assignment_id === target.assignmentId,
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    return delay(
      rows.map((c) => {
        const u = this.db.users.find((x) => x.id === c.author_id)
        return {
          ...c,
          author: u ? { id: u.id, name: u.name, avatar: u.avatar } : null,
        }
      }),
      40,
    )
  }

  async addComment(input: {
    space_id: string
    material_id?: string
    assignment_id?: string
    body: string
  }): Promise<Comment> {
    const me = this.me()
    this.assertSpaceAccess(input.space_id)
    const comment: Comment = {
      id: uid('cmt'),
      space_id: input.space_id,
      material_id: input.material_id ?? null,
      assignment_id: input.assignment_id ?? null,
      author_id: me.id,
      body: input.body.trim(),
      created_at: nowIso(),
    }
    this.db.comments.push(comment)
    this.persist({ table: 'materials', spaceId: input.space_id })
    return comment
  }

  async deleteComment(id: string): Promise<void> {
    const me = this.me()
    const c = this.db.comments.find((x) => x.id === id)
    if (!c) return
    const space = this.db.spaces.find((s) => s.id === c.space_id)
    if (c.author_id !== me.id && space?.owner_id !== me.id) {
      throw new Error('Можно удалять только свои комментарии')
    }
    this.db.comments = this.db.comments.filter((x) => x.id !== id)
    this.persist({ table: 'materials', spaceId: c.space_id })
  }

  /* -------------------------------- тесты -------------------------------- */

  async listQuizzes(spaceId: string): Promise<QuizView[]> {
    const me = this.me()
    const canManage = this.db.spaces.find((s) => s.id === spaceId)?.owner_id === me.id
    return delay(
      this.db.quizzes
        .filter((q) => q.space_id === spaceId && (q.published || canManage))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((q) => {
          const qq = this.db.quiz_questions.filter((x) => x.quiz_id === q.id)
          const attempts = this.db.quiz_attempts.filter((a) => a.quiz_id === q.id)
          const mine = attempts
            .filter((a) => a.student_id === me.id)
            .sort((a, b) => b.score - a.score)[0]
          return {
            ...q,
            questions: qq.length,
            points: qq.reduce((sum, x) => sum + x.points, 0),
            myAttempt: mine ?? null,
            attempts: attempts.map((a) => {
              const u = this.db.users.find((x) => x.id === a.student_id)
              return { ...a, student: u ? { id: u.id, name: u.name, avatar: u.avatar } : null }
            }),
          }
        }),
      60,
    )
  }

  async createQuiz(input: {
    space_id: string
    title: string
    description?: string | null
    due_date?: string | null
    attempts_allowed?: number
  }): Promise<Quiz> {
    const me = this.me()
    this.assertSpaceAccess(input.space_id, true)
    const quiz: Quiz = {
      id: uid('quiz'),
      space_id: input.space_id,
      title: input.title.trim(),
      description: input.description ?? null,
      due_date: input.due_date ?? null,
      attempts_allowed: input.attempts_allowed ?? 1,
      shuffle: true,
      published: false,
      author_id: me.id,
      created_at: nowIso(),
    }
    this.db.quizzes.push(quiz)
    this.persist({ table: 'assignments', spaceId: input.space_id })
    return quiz
  }

  async updateQuiz(id: string, patch: Partial<Quiz>): Promise<Quiz> {
    const q = this.db.quizzes.find((x) => x.id === id)
    if (!q) throw new Error('Тест не найден')
    this.assertSpaceAccess(q.space_id, true)
    Object.assign(q, patch)
    this.persist({ table: 'assignments', spaceId: q.space_id })
    return q
  }

  async deleteQuiz(id: string): Promise<void> {
    const q = this.db.quizzes.find((x) => x.id === id)
    if (!q) return
    this.assertSpaceAccess(q.space_id, true)
    this.db.quizzes = this.db.quizzes.filter((x) => x.id !== id)
    this.db.quiz_questions = this.db.quiz_questions.filter((x) => x.quiz_id !== id)
    this.db.quiz_attempts = this.db.quiz_attempts.filter((x) => x.quiz_id !== id)
    this.persist({ table: 'assignments', spaceId: q.space_id })
  }

  async listQuizEditor(quizId: string): Promise<Array<QuizQuestion & { options: QuizOption[] }>> {
    return delay(
      this.db.quiz_questions
        .filter((q) => q.quiz_id === quizId)
        .sort((a, b) => a.position - b.position),
      40,
    )
  }

  async saveQuizQuestions(
    quizId: string,
    questions: Array<{
      text: string
      multiple: boolean
      points: number
      options: Array<{ text: string; is_correct: boolean }>
    }>,
  ): Promise<void> {
    const q = this.db.quizzes.find((x) => x.id === quizId)
    if (!q) throw new Error('Тест не найден')
    this.assertSpaceAccess(q.space_id, true)
    this.db.quiz_questions = this.db.quiz_questions.filter((x) => x.quiz_id !== quizId)
    questions.forEach((question, i) => {
      const qid = uid('qq')
      this.db.quiz_questions.push({
        id: qid,
        quiz_id: quizId,
        position: i,
        text: question.text.trim(),
        multiple: question.multiple,
        points: question.points,
        options: question.options.map((o, k) => ({
          id: uid('qo'),
          question_id: qid,
          position: k,
          text: o.text.trim(),
          is_correct: o.is_correct,
        })),
      })
    })
    this.persist({ table: 'assignments', spaceId: q.space_id })
  }

  async getQuizForStudent(quizId: string): Promise<QuizForStudent> {
    const me = this.me()
    const q = this.db.quizzes.find((x) => x.id === quizId)
    if (!q) throw new Error('Тест не найден')
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      due_date: q.due_date,
      attempts_allowed: q.attempts_allowed,
      attempts_used: this.db.quiz_attempts.filter((a) => a.quiz_id === q.id && a.student_id === me.id).length,
      questions: this.db.quiz_questions
        .filter((x) => x.quiz_id === quizId)
        .sort((a, b) => a.position - b.position)
        .map((x) => ({
          id: x.id,
          text: x.text,
          multiple: x.multiple,
          points: x.points,
          options: x.options.map((o) => ({ id: o.id, text: o.text })),
        })),
    }
  }

  async submitQuiz(quizId: string, answers: Record<string, string[]>): Promise<QuizResult> {
    const me = this.me()
    const q = this.db.quizzes.find((x) => x.id === quizId)
    if (!q) throw new Error('Тест не найден')
    const used = this.db.quiz_attempts.filter((a) => a.quiz_id === q.id && a.student_id === me.id).length
    if (used >= q.attempts_allowed) throw new Error(`Попытки закончились: разрешено ${q.attempts_allowed}`)

    let score = 0
    let max = 0
    for (const question of this.db.quiz_questions.filter((x) => x.quiz_id === quizId)) {
      max += question.points
      const chosen = [...(answers[question.id] ?? [])].sort()
      const correct = question.options.filter((o) => o.is_correct).map((o) => o.id).sort()
      if (correct.length && chosen.length === correct.length && chosen.every((id, i) => id === correct[i])) {
        score += question.points
      }
    }
    const late = Boolean(q.due_date && new Date() > new Date(q.due_date))
    this.db.quiz_attempts.push({
      id: uid('qa'),
      quiz_id: quizId,
      student_id: me.id,
      answers,
      score,
      max_score: max,
      is_late: late,
      created_at: nowIso(),
    })
    this.persist({ table: 'assignments', spaceId: q.space_id })
    return { score, max_score: max, is_late: late, attempts_left: q.attempts_allowed - used - 1 }
  }

  async listFolders(spaceId: string): Promise<Folder[]> {
    return delay(
      this.db.folders
        .filter((f) => f.space_id === spaceId)
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    )
  }

  async createFolder(input: CreateFolderInput): Promise<Folder> {
    this.assertSpaceAccess(input.space_id, true)
    const folder: Folder = {
      id: uid('fld'),
      space_id: input.space_id,
      parent_id: input.parent_id ?? null,
      name: input.name.trim() || 'Новая папка',
      color: input.color ?? colorFromString(input.name),
      created_at: nowIso(),
    }
    this.db.folders.push(folder)
    this.persist({ table: 'folders', spaceId: input.space_id })
    return folder
  }

  async updateFolder(id: string, patch: Partial<Folder>): Promise<Folder> {
    const folder = this.db.folders.find((f) => f.id === id)
    if (!folder) throw new Error('Папка не найдена')
    this.assertSpaceAccess(folder.space_id, true)
    Object.assign(folder, patch)
    this.persist({ table: 'folders', spaceId: folder.space_id })
    return folder
  }

  async deleteFolder(id: string): Promise<void> {
    const folder = this.db.folders.find((f) => f.id === id)
    if (!folder) return
    this.assertSpaceAccess(folder.space_id, true)
    // Рекурсивно собираем поддерево
    const doomed = new Set<string>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const f of this.db.folders) {
        if (f.parent_id && doomed.has(f.parent_id) && !doomed.has(f.id)) {
          doomed.add(f.id)
          grew = true
        }
      }
    }
    this.db.folders = this.db.folders.filter((f) => !doomed.has(f.id))
    // Материалы не удаляем — поднимаем в корень пространства
    this.db.materials.forEach((m) => {
      if (m.folder_id && doomed.has(m.folder_id)) m.folder_id = null
    })
    this.persist({ table: 'folders', spaceId: folder.space_id })
  }

  /* -------------------------------- материалы ---------------------------- */

  private toMaterialView(material: Material, meId: string): MaterialView {
    const tagIds = this.db.material_tags
      .filter((mt) => mt.material_id === material.id)
      .map((mt) => mt.tag_id)
    const author = this.db.users.find((u) => u.id === material.author_id) ?? null
    return {
      ...material,
      tags: this.db.tags.filter((t) => tagIds.includes(t.id)),
      author: author ? { id: author.id, name: author.name, avatar: author.avatar } : null,
      starred: this.db.starred.some((s) => s.user_id === meId && s.material_id === material.id),
      progress:
        this.db.progress.find((p) => p.user_id === meId && p.material_id === material.id)?.status ?? null,
    }
  }

  async listMaterials(spaceId: string): Promise<MaterialView[]> {
    const me = this.sessionUserId()
    if (!me) return []
    const list = this.db.materials
      .filter((m) => m.space_id === spaceId)
      .map((m) => this.toMaterialView(m, me))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return delay(list)
  }

  async listAllMaterials(): Promise<MaterialView[]> {
    const me = this.sessionUserId()
    if (!me) return []
    const ids = this.mySpaceIds()
    const list = this.db.materials
      .filter((m) => ids.includes(m.space_id))
      .map((m) => this.toMaterialView(m, me))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return delay(list)
  }

  async createMaterial(input: CreateMaterialInput): Promise<Material> {
    const me = this.me()
    this.assertSpaceAccess(input.space_id, true)
    const material: Material = {
      id: uid('mat'),
      space_id: input.space_id,
      folder_id: input.folder_id ?? null,
      title: input.title.trim() || 'Без названия',
      description: input.description ?? null,
      type: input.type,
      file_url: input.file_url ?? null,
      file_name: input.file_name ?? null,
      file_size: input.file_size ?? null,
      mime_type: input.mime_type ?? null,
      content: input.content ?? null,
      color: input.color ?? colorFromString(input.title + input.type),
      author_id: me.id,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    this.db.materials.push(material)
    if (input.tagIds?.length) {
      input.tagIds.forEach((tag_id) => this.db.material_tags.push({ material_id: material.id, tag_id }))
    }
    this.persist({ table: 'materials', spaceId: material.space_id })
    return material
  }

  async updateMaterial(id: string, patch: Partial<Material> & { tagIds?: string[] }): Promise<Material> {
    const material = this.db.materials.find((m) => m.id === id)
    if (!material) throw new Error('Материал не найден')
    this.assertSpaceAccess(material.space_id, true)
    const { tagIds, ...rest } = patch
    Object.assign(material, rest, { updated_at: nowIso() })
    if (tagIds) {
      this.db.material_tags = this.db.material_tags.filter((mt) => mt.material_id !== id)
      tagIds.forEach((tag_id) => this.db.material_tags.push({ material_id: id, tag_id }))
    }
    this.persist({ table: 'materials', spaceId: material.space_id })
    return material
  }

  async deleteMaterial(id: string): Promise<void> {
    const material = this.db.materials.find((m) => m.id === id)
    if (!material) return
    this.assertSpaceAccess(material.space_id, true)
    if (material.file_url?.startsWith('idb:')) {
      await deleteBlob(material.file_url.slice(4)).catch(() => undefined)
    }
    this.db.materials = this.db.materials.filter((m) => m.id !== id)
    this.db.material_tags = this.db.material_tags.filter((mt) => mt.material_id !== id)
    this.db.starred = this.db.starred.filter((s) => s.material_id !== id)
    this.db.progress = this.db.progress.filter((p) => p.material_id !== id)
    this.db.assignments.forEach((a) => {
      a.attachments = a.attachments.filter((x) => x !== id)
    })
    this.persist({ table: 'materials', spaceId: material.space_id })
  }

  async uploadFile(
    spaceId: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<UploadResult> {
    this.assertSpaceAccess(spaceId, true)
    const key = `${spaceId}/${uid()}-${file.name}`
    // Имитируем прогресс загрузки, чтобы прогресс-бар был честным элементом UI
    const steps = 12
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, 25 + Math.random() * 35))
      onProgress?.(Math.round((i / steps) * 92))
    }
    await putBlob(key, file)
    onProgress?.(100)
    return {
      file_url: `idb:${key}`,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
    }
  }

  async resolveFileUrl(material: { file_url: string | null }): Promise<string | null> {
    const url = material.file_url
    if (!url) return null
    if (url.startsWith('idb:')) return blobUrl(url.slice(4))
    if (url.startsWith('data:')) {
      const cached = this.dataUrlCache.get(url)
      if (cached) return cached
      const res = await fetch(url)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      this.dataUrlCache.set(url, objectUrl)
      return objectUrl
    }
    return url
  }

  /* ----------------------------------- теги ------------------------------ */

  async listTags(): Promise<Tag[]> {
    return delay([...this.db.tags].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
  }

  async createTag(input: { name: string; color: Tag['color']; icon: string }): Promise<Tag> {
    const name = input.name.trim()
    const existing = this.db.tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (existing) return existing
    const tag: Tag = { id: uid('tag'), name, color: input.color, icon: input.icon }
    this.db.tags.push(tag)
    this.persist({ table: 'tags' })
    return tag
  }

  async deleteTag(id: string): Promise<void> {
    this.db.tags = this.db.tags.filter((t) => t.id !== id)
    this.db.material_tags = this.db.material_tags.filter((mt) => mt.tag_id !== id)
    this.persist({ table: 'tags' })
  }

  async setMaterialTags(materialId: string, tagIds: string[]): Promise<void> {
    const material = this.db.materials.find((m) => m.id === materialId)
    if (!material) return
    this.assertSpaceAccess(material.space_id, true)
    this.db.material_tags = this.db.material_tags.filter((mt) => mt.material_id !== materialId)
    tagIds.forEach((tag_id) => this.db.material_tags.push({ material_id: materialId, tag_id }))
    this.persist({ table: 'materials', spaceId: material.space_id })
  }

  /* --------------------------- избранное и прогресс ---------------------- */

  async toggleStar(materialId: string): Promise<boolean> {
    const me = this.me()
    const idx = this.db.starred.findIndex((s) => s.user_id === me.id && s.material_id === materialId)
    let starred: boolean
    if (idx >= 0) {
      this.db.starred.splice(idx, 1)
      starred = false
    } else {
      this.db.starred.push({ user_id: me.id, material_id: materialId, created_at: nowIso() })
      starred = true
    }
    this.persist({ table: 'starred' })
    return starred
  }

  async setProgress(materialId: string, status: ProgressStatus): Promise<void> {
    const me = this.me()
    const existing = this.db.progress.find((p) => p.user_id === me.id && p.material_id === materialId)
    // «Изучено» не понижаем до «просмотрено» автоматическим открытием
    if (existing) {
      if (existing.status === 'studied' && status === 'viewed') return
      existing.status = status
      existing.updated_at = nowIso()
    } else {
      this.db.progress.push({ user_id: me.id, material_id: materialId, status, updated_at: nowIso() })
    }
    this.persist({ table: 'progress' })
  }

  async listSpaceProgress(spaceId: string) {
    const materialIds = this.db.materials.filter((m) => m.space_id === spaceId).map((m) => m.id)
    return delay(
      this.db.progress
        .filter((p) => materialIds.includes(p.material_id))
        .map((p) => {
          const u = this.db.users.find((x) => x.id === p.user_id)
          return { ...p, user: u ? { id: u.id, name: u.name, avatar: u.avatar } : null }
        }),
    )
  }

  /* --------------------------------- задания ----------------------------- */

  private toAssignmentView(a: Assignment, meId: string): AssignmentView {
    const subs = this.db.submissions.filter((s) => s.assignment_id === a.id)
    return {
      ...a,
      attachedMaterials: this.db.materials.filter((m) => a.attachments.includes(m.id)),
      mySubmission: subs.find((s) => s.student_id === meId) ?? null,
      submissions: subs.map((s) => {
        const u = this.db.users.find((x) => x.id === s.student_id)
        return { ...s, student: u ? { id: u.id, name: u.name, avatar: u.avatar } : null }
      }),
    }
  }

  async listAssignments(spaceId: string): Promise<AssignmentView[]> {
    const me = this.sessionUserId()
    if (!me) return []
    return delay(
      this.db.assignments
        .filter((a) => a.space_id === spaceId)
        .map((a) => this.toAssignmentView(a, me))
        .sort((x, y) => (x.due_date ?? '9999').localeCompare(y.due_date ?? '9999')),
    )
  }

  async listAllAssignments(): Promise<AssignmentView[]> {
    const me = this.sessionUserId()
    if (!me) return []
    const ids = this.mySpaceIds()
    return delay(
      this.db.assignments
        .filter((a) => ids.includes(a.space_id))
        .map((a) => this.toAssignmentView(a, me))
        .sort((x, y) => (x.due_date ?? '9999').localeCompare(y.due_date ?? '9999')),
    )
  }

  async createAssignment(input: CreateAssignmentInput): Promise<Assignment> {
    const me = this.me()
    this.assertSpaceAccess(input.space_id, true)
    const assignment: Assignment = {
      id: uid('asg'),
      space_id: input.space_id,
      title: input.title.trim(),
      description: input.description ?? null,
      due_date: input.due_date ?? null,
      lesson_id: (input as { lesson_id?: string | null }).lesson_id ?? null,
      allow_late: input.allow_late ?? true,
      attachments: input.attachments ?? [],
      author_id: me.id,
      created_at: nowIso(),
    }
    this.db.assignments.push(assignment)
    this.persist({ table: 'assignments', spaceId: input.space_id })
    return assignment
  }

  async updateAssignment(id: string, patch: Partial<Assignment>): Promise<Assignment> {
    const a = this.db.assignments.find((x) => x.id === id)
    if (!a) throw new Error('Задание не найдено')
    this.assertSpaceAccess(a.space_id, true)
    Object.assign(a, patch)
    this.persist({ table: 'assignments', spaceId: a.space_id })
    return a
  }

  async deleteAssignment(id: string): Promise<void> {
    const a = this.db.assignments.find((x) => x.id === id)
    if (!a) return
    this.assertSpaceAccess(a.space_id, true)
    this.db.assignments = this.db.assignments.filter((x) => x.id !== id)
    this.db.submissions = this.db.submissions.filter((s) => s.assignment_id !== id)
    this.persist({ table: 'assignments', spaceId: a.space_id })
  }

  async submitAssignment(
    assignmentId: string,
    payload: { comment?: string | null; attachments?: string[] },
  ): Promise<Submission> {
    const me = this.me()
    const assignment = this.db.assignments.find((a) => a.id === assignmentId)
    if (!assignment) throw new Error('Задание не найдено')
    this.assertSpaceAccess(assignment.space_id)
    const late = Boolean(assignment.due_date && new Date() > new Date(assignment.due_date))
    if (late && !assignment.allow_late) {
      throw new Error('Срок сдачи истёк — преподаватель закрыл приём работ')
    }
    const existing = this.db.submissions.find(
      (s) => s.assignment_id === assignmentId && s.student_id === me.id,
    )
    let sub: Submission
    if (!existing) {
      sub = {
        id: uid('sub'),
        assignment_id: assignmentId,
        student_id: me.id,
        status: 'submitted',
        comment: payload.comment ?? null,
        attachments: payload.attachments ?? [],
        grade: null,
        submitted_at: nowIso(),
        is_late: late,
      }
      this.db.submissions.push(sub)
    } else {
      existing.status = 'submitted'
      existing.comment = payload.comment ?? existing.comment
      existing.attachments = payload.attachments ?? existing.attachments
      existing.submitted_at = nowIso()
      existing.is_late = late
      sub = existing
    }
    this.persist({ table: 'submissions', spaceId: assignment.space_id })
    return sub
  }

  async gradeSubmission(submissionId: string, grade: number | null): Promise<Submission> {
    const sub = this.db.submissions.find((s) => s.id === submissionId)
    if (!sub) throw new Error('Работа не найдена')
    const assignment = this.db.assignments.find((a) => a.id === sub.assignment_id)
    if (assignment) this.assertSpaceAccess(assignment.space_id, true)
    sub.grade = grade
    sub.status = grade === null ? 'submitted' : 'graded'

    // Оценка за задание попадает в связанную колонку журнала —
    // так же, как это делает триггер в Supabase.
    if (grade !== null && assignment) {
      const item = this.db.grade_items.find((i) => i.assignment_id === assignment.id)
      if (item) {
        const existing = this.db.grades.find(
          (g) => g.item_id === item.id && g.student_id === sub.student_id,
        )
        if (existing) {
          existing.score = grade
          existing.flag = 'none'
          existing.updated_at = nowIso()
        } else {
          this.db.grades.push({
            id: uid('grd'),
            item_id: item.id,
            student_id: sub.student_id,
            score: grade,
            flag: 'none',
            comment: null,
            graded_by: this.sessionUserId(),
            updated_at: nowIso(),
          })
        }
      }
    }

    this.persist({ table: 'submissions', spaceId: assignment?.space_id ?? null })
    return sub
  }

  /* ------------------------------ журнал оценок -------------------------- */

  private spaceStudents(spaceId: string) {
    return this.db.space_members
      .filter((m) => m.space_id === spaceId)
      .map((m) => this.db.users.find((u) => u.id === m.user_id))
      .filter((u): u is User & { password: string } => !!u)
      .map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, role: u.role }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  private gradebookOf(spaceId: string): GradebookSnapshot {
    const items = this.db.grade_items.filter((i) => i.space_id === spaceId)
    const itemIds = new Set(items.map((i) => i.id))
    return {
      scales: this.db.grade_scales.filter((x) => x.space_id === spaceId),
      periods: this.db.grade_periods
        .filter((x) => x.space_id === spaceId)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
      categories: this.db.grade_categories.filter((x) => x.space_id === spaceId),
      items: items.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)),
      grades: this.db.grades.filter((g) => itemIds.has(g.item_id)),
      criteria: this.db.grade_criteria
        .filter((c) => c.space_id === spaceId)
        .sort((a, b) => a.position - b.position),
      criterionScores: this.db.criterion_scores.filter((cs) =>
        this.db.grade_criteria.some((c) => c.id === cs.criterion_id && c.space_id === spaceId),
      ),
      lessons: this.db.lessons
        .filter((l) => l.space_id === spaceId)
        .sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position),
      lessonStatuses: this.db.lesson_statuses
        .filter((x) => x.space_id === spaceId)
        .sort((a, b) => a.position - b.position),
      lessonPriorities: this.db.lesson_priorities
        .filter((x) => x.space_id === spaceId)
        .sort((a, b) => b.rank - a.rank),
      attendance: this.db.attendance.filter((x) => x.space_id === spaceId),
      students: this.spaceStudents(spaceId),
    }
  }

  async loadGradebook(spaceId: string): Promise<GradebookSnapshot> {
    return delay(this.gradebookOf(spaceId))
  }

  async ensureGradebook(spaceId: string): Promise<GradebookSnapshot> {
    this.assertSpaceAccess(spaceId)
    let touched = false

    if (!this.db.grade_scales.some((x) => x.space_id === spaceId)) {
      const preset = presetByKey('eight').build()
      this.db.grade_scales.push({
        ...preset,
        id: uid('scl'),
        space_id: spaceId,
        is_default: true,
        created_at: nowIso(),
      })
      touched = true
    }
    // Справочники занятий заводим раньше категорий — категории на них ссылаются
    if (!this.db.lesson_statuses.some((x) => x.space_id === spaceId)) {
      DEFAULT_LESSON_STATUSES.forEach((st, i) =>
        this.db.lesson_statuses.push({
          ...st,
          id: uid('lst'),
          space_id: spaceId,
          position: i,
          created_at: nowIso(),
        }),
      )
      touched = true
    }
    if (!this.db.lesson_priorities.some((x) => x.space_id === spaceId)) {
      DEFAULT_LESSON_PRIORITIES.forEach((pr, i) =>
        this.db.lesson_priorities.push({
          ...pr,
          id: uid('lpr'),
          space_id: spaceId,
          position: i,
          created_at: nowIso(),
        }),
      )
      touched = true
    }
    if (!this.db.grade_categories.some((x) => x.space_id === spaceId)) {
      const priorities = this.db.lesson_priorities.filter((x) => x.space_id === spaceId)
      DEFAULT_CATEGORIES.forEach((c, i) => {
        const { priority, ...rest } = c
        this.db.grade_categories.push({
          ...rest,
          id: uid('cat'),
          space_id: spaceId,
          default_priority_id: priorities.find((p) => p.name === priority)?.id ?? null,
          position: i,
          created_at: nowIso(),
        })
      })
      touched = true
    }
    if (!this.db.grade_periods.some((x) => x.space_id === spaceId)) {
      defaultPeriods().forEach((p) =>
        this.db.grade_periods.push({ ...p, id: uid('per'), space_id: spaceId, created_at: nowIso() }),
      )
      touched = true
    }
    if (touched) this.persist({ table: 'gradebook', spaceId })
    return this.gradebookOf(spaceId)
  }

  async createScale(input: Omit<GradeScale, 'id' | 'created_at'>): Promise<GradeScale> {
    this.assertSpaceAccess(input.space_id, true)
    const scale: GradeScale = { ...input, id: uid('scl'), created_at: nowIso() }
    if (scale.is_default) {
      this.db.grade_scales.forEach((x) => {
        if (x.space_id === scale.space_id) x.is_default = false
      })
    }
    this.db.grade_scales.push(scale)
    this.persist({ table: 'gradebook', spaceId: scale.space_id })
    return scale
  }

  async updateScale(id: string, patch: Partial<GradeScale>): Promise<GradeScale> {
    const scale = this.db.grade_scales.find((x) => x.id === id)
    if (!scale) throw new Error('Шкала не найдена')
    this.assertSpaceAccess(scale.space_id, true)
    if (patch.is_default) {
      this.db.grade_scales.forEach((x) => {
        if (x.space_id === scale.space_id) x.is_default = false
      })
    }
    Object.assign(scale, patch)
    this.persist({ table: 'gradebook', spaceId: scale.space_id })
    return scale
  }

  async deleteScale(id: string): Promise<void> {
    const scale = this.db.grade_scales.find((x) => x.id === id)
    if (!scale) return
    this.assertSpaceAccess(scale.space_id, true)
    const rest = this.db.grade_scales.filter((x) => x.space_id === scale.space_id && x.id !== id)
    if (!rest.length) throw new Error('Нужна хотя бы одна шкала оценивания')
    this.db.grade_scales = this.db.grade_scales.filter((x) => x.id !== id)
    if (scale.is_default) rest[0].is_default = true
    this.db.grade_items.forEach((i) => {
      if (i.scale_id === id) i.scale_id = null
    })
    this.persist({ table: 'gradebook', spaceId: scale.space_id })
  }

  async createPeriod(input: Omit<GradePeriod, 'id' | 'created_at'>): Promise<GradePeriod> {
    this.assertSpaceAccess(input.space_id, true)
    const period: GradePeriod = { ...input, id: uid('per'), created_at: nowIso() }
    if (period.is_current) {
      this.db.grade_periods.forEach((x) => {
        if (x.space_id === period.space_id) x.is_current = false
      })
    }
    this.db.grade_periods.push(period)
    this.persist({ table: 'gradebook', spaceId: period.space_id })
    return period
  }

  async updatePeriod(id: string, patch: Partial<GradePeriod>): Promise<GradePeriod> {
    const period = this.db.grade_periods.find((x) => x.id === id)
    if (!period) throw new Error('Период не найден')
    this.assertSpaceAccess(period.space_id, true)
    if (patch.is_current) {
      this.db.grade_periods.forEach((x) => {
        if (x.space_id === period.space_id) x.is_current = false
      })
    }
    Object.assign(period, patch)
    this.persist({ table: 'gradebook', spaceId: period.space_id })
    return period
  }

  async deletePeriod(id: string): Promise<void> {
    const period = this.db.grade_periods.find((x) => x.id === id)
    if (!period) return
    this.assertSpaceAccess(period.space_id, true)
    this.db.grade_periods = this.db.grade_periods.filter((x) => x.id !== id)
    this.db.grade_items.forEach((i) => {
      if (i.period_id === id) i.period_id = null
    })
    this.persist({ table: 'gradebook', spaceId: period.space_id })
  }

  async createCategory(input: Omit<GradeCategory, 'id' | 'created_at'>): Promise<GradeCategory> {
    this.assertSpaceAccess(input.space_id, true)
    const category: GradeCategory = { ...input, id: uid('cat'), created_at: nowIso() }
    this.db.grade_categories.push(category)
    this.persist({ table: 'gradebook', spaceId: category.space_id })
    return category
  }

  async updateCategory(id: string, patch: Partial<GradeCategory>): Promise<GradeCategory> {
    const category = this.db.grade_categories.find((x) => x.id === id)
    if (!category) throw new Error('Категория не найдена')
    this.assertSpaceAccess(category.space_id, true)
    Object.assign(category, patch)
    this.persist({ table: 'gradebook', spaceId: category.space_id })
    return category
  }

  async deleteCategory(id: string): Promise<void> {
    const category = this.db.grade_categories.find((x) => x.id === id)
    if (!category) return
    this.assertSpaceAccess(category.space_id, true)
    this.db.grade_categories = this.db.grade_categories.filter((x) => x.id !== id)
    this.db.grade_items.forEach((i) => {
      if (i.category_id === id) i.category_id = null
    })
    this.persist({ table: 'gradebook', spaceId: category.space_id })
  }

  async createGradeItem(input: CreateGradeItemInput): Promise<GradeItem> {
    this.assertSpaceAccess(input.space_id, true)
    const defaultScale = this.db.grade_scales.find((x) => x.space_id === input.space_id && x.is_default)
    const item: GradeItem = {
      id: uid('gi'),
      space_id: input.space_id,
      period_id: input.period_id ?? null,
      category_id: input.category_id ?? null,
      lesson_id: input.lesson_id ?? null,
      assignment_id: input.assignment_id ?? null,
      title: input.title.trim() || 'Работа',
      date: input.date,
      max_score: input.max_score ?? defaultScale?.max_value ?? 5,
      weight: input.weight ?? 1,
      scale_id: input.scale_id ?? null,
      created_at: nowIso(),
    }
    this.db.grade_items.push(item)
    this.persist({ table: 'gradebook', spaceId: item.space_id })
    return item
  }

  async updateGradeItem(id: string, patch: Partial<GradeItem>): Promise<GradeItem> {
    const item = this.db.grade_items.find((x) => x.id === id)
    if (!item) throw new Error('Работа не найдена')
    this.assertSpaceAccess(item.space_id, true)
    Object.assign(item, patch)
    this.persist({ table: 'gradebook', spaceId: item.space_id })
    return item
  }

  async deleteGradeItem(id: string): Promise<void> {
    const item = this.db.grade_items.find((x) => x.id === id)
    if (!item) return
    this.assertSpaceAccess(item.space_id, true)
    this.db.grade_items = this.db.grade_items.filter((x) => x.id !== id)
    this.db.grades = this.db.grades.filter((g) => g.item_id !== id)
    const dead = this.db.grade_criteria.filter((c) => c.item_id === id).map((c) => c.id)
    this.db.grade_criteria = this.db.grade_criteria.filter((c) => c.item_id !== id)
    this.db.criterion_scores = this.db.criterion_scores.filter((cs) => !dead.includes(cs.criterion_id))
    this.persist({ table: 'gradebook', spaceId: item.space_id })
  }

  /* ---------------------------- критерии работы -------------------------- */

  async createCriterion(input: Omit<GradeCriterion, 'id' | 'created_at'>): Promise<GradeCriterion> {
    this.assertSpaceAccess(input.space_id, true)
    const criterion: GradeCriterion = { ...input, id: uid('crt'), created_at: nowIso() }
    this.db.grade_criteria.push(criterion)
    this.persist({ table: 'gradebook', spaceId: criterion.space_id })
    return criterion
  }

  async updateCriterion(id: string, patch: Partial<GradeCriterion>): Promise<GradeCriterion> {
    const criterion = this.db.grade_criteria.find((c) => c.id === id)
    if (!criterion) throw new Error('Критерий не найден')
    this.assertSpaceAccess(criterion.space_id, true)
    Object.assign(criterion, patch)
    this.persist({ table: 'gradebook', spaceId: criterion.space_id })
    return criterion
  }

  async deleteCriterion(id: string): Promise<void> {
    const criterion = this.db.grade_criteria.find((c) => c.id === id)
    if (!criterion) return
    this.assertSpaceAccess(criterion.space_id, true)
    this.db.grade_criteria = this.db.grade_criteria.filter((c) => c.id !== id)
    this.db.criterion_scores = this.db.criterion_scores.filter((cs) => cs.criterion_id !== id)
    this.persist({ table: 'gradebook', spaceId: criterion.space_id })
  }

  async setCriterionScores(
    itemId: string,
    studentId: string,
    values: Array<Pick<CriterionScore, 'criterion_id' | 'score'>>,
  ): Promise<Grade> {
    const me = this.me()
    const item = this.db.grade_items.find((x) => x.id === itemId)
    if (!item) throw new Error('Работа не найдена')
    this.assertSpaceAccess(item.space_id, true)

    for (const v of values) {
      const existing = this.db.criterion_scores.find(
        (cs) => cs.criterion_id === v.criterion_id && cs.student_id === studentId,
      )
      if (existing) {
        existing.score = v.score
        existing.updated_at = nowIso()
      } else {
        this.db.criterion_scores.push({
          id: uid('crs'),
          criterion_id: v.criterion_id,
          student_id: studentId,
          score: v.score,
          updated_at: nowIso(),
        })
      }
    }

    // Итог за работу — сумма баллов по критериям
    const filled = values.filter((v) => v.score !== null)
    const total = filled.length ? filled.reduce((sum, v) => sum + (v.score as number), 0) : null

    let grade = this.db.grades.find((g) => g.item_id === itemId && g.student_id === studentId)
    if (!grade) {
      grade = {
        id: uid('grd'),
        item_id: itemId,
        student_id: studentId,
        score: total,
        flag: 'none',
        comment: null,
        graded_by: me.id,
        updated_at: nowIso(),
      }
      this.db.grades.push(grade)
    } else {
      grade.score = total
      grade.flag = 'none'
      grade.graded_by = me.id
      grade.updated_at = nowIso()
    }
    this.persist({ table: 'gradebook', spaceId: item.space_id })
    return grade
  }

  async setGrade(itemId: string, studentId: string, input: GradeInput): Promise<Grade> {
    const me = this.me()
    const item = this.db.grade_items.find((x) => x.id === itemId)
    if (!item) throw new Error('Работа не найдена')
    this.assertSpaceAccess(item.space_id, true)
    let grade = this.db.grades.find((g) => g.item_id === itemId && g.student_id === studentId)
    if (!grade) {
      grade = {
        id: uid('grd'),
        item_id: itemId,
        student_id: studentId,
        score: null,
        flag: 'none',
        comment: null,
        graded_by: me.id,
        updated_at: nowIso(),
      }
      this.db.grades.push(grade)
    }
    if (input.score !== undefined) grade.score = input.score
    if (input.flag !== undefined) grade.flag = input.flag
    if (input.comment !== undefined) grade.comment = input.comment
    grade.graded_by = me.id
    grade.updated_at = nowIso()
    this.persist({ table: 'gradebook', spaceId: item.space_id })
    return grade
  }

  async clearGrade(itemId: string, studentId: string): Promise<void> {
    const item = this.db.grade_items.find((x) => x.id === itemId)
    if (item) this.assertSpaceAccess(item.space_id, true)
    this.db.grades = this.db.grades.filter((g) => !(g.item_id === itemId && g.student_id === studentId))
    this.persist({ table: 'gradebook', spaceId: item?.space_id ?? null })
  }

  /* ------------------------------ уроки ---------------------------------- */

  async createLesson(input: CreateLessonInput): Promise<Lesson> {
    this.assertSpaceAccess(input.space_id, true)
    const category = input.category_id
      ? this.db.grade_categories.find((c) => c.id === input.category_id)
      : null
    const lesson: Lesson = {
      id: uid('lsn'),
      space_id: input.space_id,
      period_id: input.period_id ?? null,
      category_id: input.category_id ?? null,
      status_id:
        input.status_id ??
        this.db.lesson_statuses.find((x) => x.space_id === input.space_id && x.is_default)?.id ??
        null,
      // Важность берём у типа занятия, а если её там нет — из справочника
      priority_id:
        input.priority_id ??
        category?.default_priority_id ??
        this.db.lesson_priorities.find((x) => x.space_id === input.space_id && x.is_default)?.id ??
        null,
      title: input.title.trim() || 'Занятие',
      topic: input.topic ?? null,
      date: input.date,
      starts_at: input.starts_at ?? null,
      duration_min: input.duration_min ?? null,
      homework: input.homework ?? null,
      notes: input.notes ?? null,
      position: this.db.lessons.filter((l) => l.space_id === input.space_id && l.date === input.date)
        .length,
      created_at: nowIso(),
    }
    this.db.lessons.push(lesson)
    this.persist({ table: 'gradebook', spaceId: lesson.space_id })
    return lesson
  }

  async updateLesson(id: string, patch: Partial<Lesson>): Promise<Lesson> {
    const lesson = this.db.lessons.find((l) => l.id === id)
    if (!lesson) throw new Error('Занятие не найдено')
    this.assertSpaceAccess(lesson.space_id, true)
    Object.assign(lesson, patch)
    this.persist({ table: 'gradebook', spaceId: lesson.space_id })
    return lesson
  }

  async deleteLesson(id: string): Promise<void> {
    const lesson = this.db.lessons.find((l) => l.id === id)
    if (!lesson) return
    this.assertSpaceAccess(lesson.space_id, true)
    this.db.lessons = this.db.lessons.filter((l) => l.id !== id)
    // Работы и задания не удаляем — просто отвязываем от занятия
    this.db.grade_items.forEach((i) => {
      if (i.lesson_id === id) i.lesson_id = null
    })
    this.db.assignments.forEach((a) => {
      if (a.lesson_id === id) a.lesson_id = null
    })
    this.persist({ table: 'gradebook', spaceId: lesson.space_id })
  }

  /* --------------------- справочники занятий ----------------------------- */

  async createLessonStatus(input: Omit<LessonStatus, 'id' | 'created_at'>): Promise<LessonStatus> {
    this.assertSpaceAccess(input.space_id, true)
    if (input.is_default) {
      this.db.lesson_statuses.forEach((x) => {
        if (x.space_id === input.space_id) x.is_default = false
      })
    }
    const row: LessonStatus = { ...input, id: uid('lst'), created_at: nowIso() }
    this.db.lesson_statuses.push(row)
    this.persist({ table: 'gradebook', spaceId: row.space_id })
    return row
  }

  async updateLessonStatus(id: string, patch: Partial<LessonStatus>): Promise<LessonStatus> {
    const row = this.db.lesson_statuses.find((x) => x.id === id)
    if (!row) throw new Error('Статус не найден')
    this.assertSpaceAccess(row.space_id, true)
    if (patch.is_default) {
      this.db.lesson_statuses.forEach((x) => {
        if (x.space_id === row.space_id) x.is_default = false
      })
    }
    Object.assign(row, patch)
    this.persist({ table: 'gradebook', spaceId: row.space_id })
    return row
  }

  async deleteLessonStatus(id: string): Promise<void> {
    const row = this.db.lesson_statuses.find((x) => x.id === id)
    if (!row) return
    this.assertSpaceAccess(row.space_id, true)
    this.db.lesson_statuses = this.db.lesson_statuses.filter((x) => x.id !== id)
    this.db.lessons.forEach((l) => {
      if (l.status_id === id) l.status_id = null
    })
    this.persist({ table: 'gradebook', spaceId: row.space_id })
  }

  async createLessonPriority(
    input: Omit<LessonPriority, 'id' | 'created_at'>,
  ): Promise<LessonPriority> {
    this.assertSpaceAccess(input.space_id, true)
    if (input.is_default) {
      this.db.lesson_priorities.forEach((x) => {
        if (x.space_id === input.space_id) x.is_default = false
      })
    }
    const row: LessonPriority = { ...input, id: uid('lpr'), created_at: nowIso() }
    this.db.lesson_priorities.push(row)
    this.persist({ table: 'gradebook', spaceId: row.space_id })
    return row
  }

  async updateLessonPriority(id: string, patch: Partial<LessonPriority>): Promise<LessonPriority> {
    const row = this.db.lesson_priorities.find((x) => x.id === id)
    if (!row) throw new Error('Уровень важности не найден')
    this.assertSpaceAccess(row.space_id, true)
    if (patch.is_default) {
      this.db.lesson_priorities.forEach((x) => {
        if (x.space_id === row.space_id) x.is_default = false
      })
    }
    Object.assign(row, patch)
    this.persist({ table: 'gradebook', spaceId: row.space_id })
    return row
  }

  async deleteLessonPriority(id: string): Promise<void> {
    const row = this.db.lesson_priorities.find((x) => x.id === id)
    if (!row) return
    this.assertSpaceAccess(row.space_id, true)
    this.db.lesson_priorities = this.db.lesson_priorities.filter((x) => x.id !== id)
    this.db.lessons.forEach((l) => {
      if (l.priority_id === id) l.priority_id = null
    })
    this.db.grade_categories.forEach((c) => {
      if (c.default_priority_id === id) c.default_priority_id = null
    })
    this.persist({ table: 'gradebook', spaceId: row.space_id })
  }

  /* ------------------- наборы пространств (один код) --------------------- */

  private bundleView(bundle: SpaceBundle, meId: string): SpaceBundleView {
    const ids = this.db.bundle_spaces
      .filter((bs) => bs.bundle_id === bundle.id)
      .map((bs) => bs.space_id)
    return {
      ...bundle,
      is_owner: bundle.owner_id === meId,
      spaces: this.db.spaces
        .filter((sp) => ids.includes(sp.id))
        .map((sp) => ({
          id: sp.id,
          name: sp.name,
          color: sp.color,
          owner_id: sp.owner_id,
          is_mine: sp.owner_id === meId,
        })),
    }
  }

  async listBundles(): Promise<SpaceBundleView[]> {
    const me = this.sessionUserId()
    if (!me) return []
    const mySpaceIds = this.mySpaceIds()
    // Показываем свои наборы и те, куда добавлено моё пространство
    const list = this.db.space_bundles.filter(
      (b) =>
        b.owner_id === me ||
        this.db.bundle_spaces.some(
          (bs) => bs.bundle_id === b.id && mySpaceIds.includes(bs.space_id),
        ),
    )
    return delay(list.map((b) => this.bundleView(b, me)))
  }

  async createBundle(input: {
    name: string
    description?: string | null
    permission?: Permission
  }): Promise<SpaceBundle> {
    const me = this.me()
    const bundle: SpaceBundle = {
      id: uid('bnd'),
      name: input.name.trim() || 'Набор пространств',
      description: input.description ?? null,
      code: inviteCode(),
      owner_id: me.id,
      permission: input.permission ?? 'view',
      created_at: nowIso(),
    }
    this.db.space_bundles.push(bundle)
    this.persist({ table: 'spaces' })
    return bundle
  }

  async updateBundle(id: string, patch: Partial<SpaceBundle>): Promise<SpaceBundle> {
    const bundle = this.db.space_bundles.find((b) => b.id === id)
    if (!bundle) throw new Error('Набор не найден')
    if (bundle.owner_id !== this.me().id) throw new Error('Менять набор может только владелец')
    Object.assign(bundle, patch)
    this.persist({ table: 'spaces' })
    return bundle
  }

  async deleteBundle(id: string): Promise<void> {
    const bundle = this.db.space_bundles.find((b) => b.id === id)
    if (!bundle) return
    if (bundle.owner_id !== this.me().id) throw new Error('Удалить набор может только владелец')
    this.db.space_bundles = this.db.space_bundles.filter((b) => b.id !== id)
    this.db.bundle_spaces = this.db.bundle_spaces.filter((bs) => bs.bundle_id !== id)
    this.persist({ table: 'spaces' })
  }

  async regenerateBundleCode(id: string): Promise<string> {
    const bundle = this.db.space_bundles.find((b) => b.id === id)
    if (!bundle) throw new Error('Набор не найден')
    if (bundle.owner_id !== this.me().id) throw new Error('Недостаточно прав')
    bundle.code = inviteCode()
    this.persist({ table: 'spaces' })
    return bundle.code
  }

  async addSpaceToBundle(bundleId: string, spaceId: string): Promise<void> {
    // Пространство в набор добавляет только тот, кто вправе его редактировать
    this.assertSpaceAccess(spaceId, true)
    const bundle = this.db.space_bundles.find((b) => b.id === bundleId)
    if (!bundle) throw new Error('Набор не найден')
    if (this.db.bundle_spaces.some((bs) => bs.bundle_id === bundleId && bs.space_id === spaceId)) return
    this.db.bundle_spaces.push({
      bundle_id: bundleId,
      space_id: spaceId,
      added_by: this.me().id,
      added_at: nowIso(),
    })
    this.persist({ table: 'spaces' })
  }

  async removeSpaceFromBundle(bundleId: string, spaceId: string): Promise<void> {
    const bundle = this.db.space_bundles.find((b) => b.id === bundleId)
    if (!bundle) return
    const me = this.me().id
    const member = this.db.space_members.find((m) => m.space_id === spaceId && m.user_id === me)
    // Убрать может владелец набора или редактор самого пространства
    if (bundle.owner_id !== me && member?.permission !== 'edit') {
      throw new Error('Недостаточно прав')
    }
    this.db.bundle_spaces = this.db.bundle_spaces.filter(
      (bs) => !(bs.bundle_id === bundleId && bs.space_id === spaceId),
    )
    this.persist({ table: 'spaces' })
  }

  async attachSpaceToBundleByCode(code: string, spaceId: string): Promise<SpaceBundle> {
    const normalized = code.trim().toUpperCase()
    const bundle = this.db.space_bundles.find((b) => b.code.toUpperCase() === normalized)
    if (!bundle) throw new Error('Набор с таким кодом не найден')
    await this.addSpaceToBundle(bundle.id, spaceId)
    return bundle
  }

  async setAttendance(
    spaceId: string,
    studentId: string,
    date: string,
    status: AttendanceStatus,
    note?: string | null,
  ): Promise<Attendance> {
    this.assertSpaceAccess(spaceId, true)
    let row = this.db.attendance.find(
      (a) => a.space_id === spaceId && a.student_id === studentId && a.date === date,
    )
    if (!row) {
      row = {
        id: uid('att'),
        space_id: spaceId,
        student_id: studentId,
        date,
        status,
        note: note ?? null,
        created_at: nowIso(),
      }
      this.db.attendance.push(row)
    } else {
      row.status = status
      if (note !== undefined) row.note = note
    }
    this.persist({ table: 'gradebook', spaceId })
    return row
  }

  async clearAttendance(spaceId: string, studentId: string, date: string): Promise<void> {
    this.assertSpaceAccess(spaceId, true)
    this.db.attendance = this.db.attendance.filter(
      (a) => !(a.space_id === spaceId && a.student_id === studentId && a.date === date),
    )
    this.persist({ table: 'gradebook', spaceId })
  }

  /* ------------------------------ личные задачи -------------------------- */

  async listTasks(): Promise<Task[]> {
    const me = this.sessionUserId()
    if (!me) return []
    return delay(
      this.db.tasks
        .filter((t) => t.user_id === me)
        .sort((a, b) => {
          if (a.done !== b.done) return a.done ? 1 : -1
          return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
        }),
    )
  }

  async createTask(input: { title: string; due_date?: string | null; space_id?: string | null }): Promise<Task> {
    const me = this.me()
    const task: Task = {
      id: uid('tsk'),
      user_id: me.id,
      space_id: input.space_id ?? null,
      title: input.title.trim(),
      done: false,
      due_date: input.due_date ?? null,
      created_at: nowIso(),
    }
    this.db.tasks.push(task)
    this.persist({ table: 'tasks' })
    return task
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    const task = this.db.tasks.find((t) => t.id === id)
    if (!task) throw new Error('Задача не найдена')
    Object.assign(task, patch)
    this.persist({ table: 'tasks' })
    return task
  }

  async deleteTask(id: string): Promise<void> {
    this.db.tasks = this.db.tasks.filter((t) => t.id !== id)
    this.persist({ table: 'tasks' })
  }
}
