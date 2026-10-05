import { submissionState } from '@/lib/submissions'
import { buildWeek } from '@/lib/schedule'
import type {
  GradeReason,
  RosterRequestStatus,
  RosterRequestKind,
  RosterRequestView,
  RosterRequest,
  SummaryCell,
  GradeSummary,
  WardRelation,
  WardSubject,
  WardDiary,
  Ward,
  ScheduleLesson,
  ScheduleDay,
  ScheduleEntry,
  BellSlot,
  TermKind,
  SchoolLevel,
  SchoolTerm,
  SchoolHoliday,
  PersonAccess,
  MyMembership,
  LessonKind,
  Curriculum,
  CurriculumTopic,
  CurriculumLesson,
  CurriculumView,
  SubmissionReview,
  SubmissionMessage,
  AppNotification,
  CardColor,
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
  PlatformAuditEntry,
  PlatformFinding,
  PlatformIncident,
  PlatformOverview,
  PlatformPerson,
  PlatformSchool,
  PlatformSpace,
  SchoolClass,
  SchoolDepartment,
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
const SCHEMA_VERSION = 5

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
  platform_admins: string[]
  platform_audit: PlatformAuditEntry[]
  platform_incidents: PlatformIncident[]
  school_people: SchoolPerson[]
  school_parallels: SchoolParallel[]
  school_classes: SchoolClass[]
  school_departments: SchoolDepartment[]
  school_subjects: SchoolSubject[]
  subject_classes: Array<{ subject_id: string; class_id: string }>
  subject_assessment_types: SubjectAssessmentType[]
  school_groups: SchoolGroup[]
  group_members: Array<{ group_id: string; person_id: string; added_at: string }>
  group_teachers: Array<{ group_id: string; person_id: string; added_at: string }>
  teaching_assignments: TeachingAssignment[]
  school_terms: SchoolTerm[]
  school_holidays: SchoolHoliday[]
  person_roles: Array<{ person_id: string; role: SchoolRole }>
  person_classes: Array<{ person_id: string; class_id: string }>
  parent_children: Array<{ parent_id: string; child_id: string }>
  lesson_kinds: LessonKind[]
  grade_reasons: GradeReason[]
  bell_slots: BellSlot[]
  schedule_entries: ScheduleEntry[]
  roster_requests: RosterRequest[]
  curricula: Curriculum[]
  curriculum_topics: CurriculumTopic[]
  curriculum_lessons: CurriculumLesson[]
  submission_messages: SubmissionMessage[]
  notifications: AppNotification[]
  teaching_teachers: Array<{ assignment_id: string; teacher_id: string; added_at: string }>
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
    // в локальном режиме главный админ — первый заведённый аккаунт: одному
    // человеку в своём браузере проверять больше некому
    platform_admins: [],
    platform_audit: [],
    platform_incidents: [],
    school_people: [],
    school_parallels: [],
    school_classes: [],
    school_departments: [],
    school_subjects: [],
    subject_classes: [],
    subject_assessment_types: [],
    school_groups: [],
    group_members: [],
    group_teachers: [],
    teaching_assignments: [],
    school_terms: [],
    school_holidays: [],
    person_roles: [],
    person_classes: [],
    parent_children: [],
    lesson_kinds: [],
    grade_reasons: [],
    bell_slots: [],
    schedule_entries: [],
    roster_requests: [],
    curricula: [],
    curriculum_topics: [],
    curriculum_lessons: [],
    submission_messages: [],
    notifications: [],
    teaching_teachers: [],
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

  /** Все роли текущего пользователя в школе: владелец — всегда администратор */
  private mockMyRoles(schoolId: string, access: PersonAccess[]): SchoolRole[] {
    const me = this.sessionUserId()
    const school = this.db.schools.find((s) => s.id === schoolId)
    if (school?.owner_id === me) return ['admin']
    const person = this.db.school_people.find((p) => p.school_id === schoolId && p.user_id === me)
    return access.find((a) => a.person_id === person?.id)?.roles ?? ['student']
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
      department_id: null,
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
    this.db.school_departments = this.db.school_departments.filter((d) => d.school_id !== id)
    this.db.school_groups = this.db.school_groups.filter((g) => !groupIds.includes(g.id))
    this.db.group_members = this.db.group_members.filter((m) => !groupIds.includes(m.group_id))
    this.db.group_teachers = this.db.group_teachers.filter((t) => !groupIds.includes(t.group_id))
    const assignmentIds = this.db.teaching_assignments.filter((a) => a.school_id === id).map((a) => a.id)
    this.db.teaching_assignments = this.db.teaching_assignments.filter((a) => a.school_id !== id)
    this.db.teaching_teachers = this.db.teaching_teachers.filter(
      (t) => !assignmentIds.includes(t.assignment_id),
    )
    this.persist({ table: 'school' })
  }

  async loadSchool(schoolId: string): Promise<SchoolSnapshot> {
    const school = this.db.schools.find((s) => s.id === schoolId)
    if (!school) throw new Error('Школа не найдена')
    const people = this.db.school_people.filter((p) => p.school_id === schoolId)
    const access: PersonAccess[] = people.map((p) => ({
      person_id: p.id,
      // основная роль всегда входит в набор, даже если строки в person_roles нет
      roles: [
        ...new Set([p.role, ...this.db.person_roles.filter((r) => r.person_id === p.id).map((r) => r.role)]),
      ],
      class_ids: this.db.person_classes.filter((c) => c.person_id === p.id).map((c) => c.class_id),
      child_ids: this.db.parent_children.filter((c) => c.parent_id === p.id).map((c) => c.child_id),
    }))

    return {
      school,
      role: this.schoolRole(schoolId),
      myRoles: this.mockMyRoles(schoolId, access),
      terms: this.db.school_terms
        .filter((t) => t.school_id === schoolId)
        .sort((a, b) => a.position - b.position),
      holidays: this.db.school_holidays
        .filter((h) => h.school_id === schoolId)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
      lessonKinds: this.db.lesson_kinds
        .filter((k) => k.school_id === schoolId)
        .sort((a, b) => a.position - b.position),
      gradeReasons: this.db.grade_reasons
        .filter((r) => r.school_id === schoolId)
        .sort((a, b) => a.position - b.position),
      bells: this.db.bell_slots
        .filter((x) => x.school_id === schoolId)
        .sort((a, b) => a.position - b.position),
      schedule: this.db.schedule_entries.filter((x) => x.school_id === schoolId),
      access,
      parallels: this.db.school_parallels
        .filter((p) => p.school_id === schoolId)
        .sort((a, b) => a.position - b.position),
      classes: this.db.school_classes
        .filter((c) => c.school_id === schoolId)
        .sort((a, b) => a.position - b.position),
      people: this.db.school_people
        .filter((p) => p.school_id === schoolId)
        .sort((a, b) => a.last_name.localeCompare(b.last_name, 'ru')),
      departments: this.db.school_departments
        .filter((d) => d.school_id === schoolId)
        .sort((a, b) => a.position - b.position),
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
          teacher_ids: this.db.group_teachers.filter((t) => t.group_id === g.id).map((t) => t.person_id),
        })),
      assignments: this.db.teaching_assignments
        .filter((a) => a.school_id === schoolId)
        .map((a) => {
          const ids = this.db.teaching_teachers
            .filter((t) => t.assignment_id === a.id)
            .map((t) => t.teacher_id)
          // курсы, созданные до появления списка учителей, знают только teacher_id
          return { ...a, teacher_ids: ids.length || !a.teacher_id ? ids : [a.teacher_id] }
        }),
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

  async createClass(
    schoolId: string,
    parallelId: string,
    name: string,
    level: SchoolLevel | null = null,
  ): Promise<SchoolClass> {
    this.assertSchoolAdmin(schoolId)
    const row: SchoolClass = {
      id: uid('class'),
      school_id: schoolId,
      parallel_id: parallelId,
      name: name.trim(),
      level,
      position: this.db.school_classes.filter((c) => c.parallel_id === parallelId).length,
      created_at: nowIso(),
    }
    this.db.school_classes.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async updateClass(
    id: string,
    patch: Partial<Pick<SchoolClass, 'name' | 'parallel_id' | 'position' | 'level'>>,
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
      department_id: null,
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
        | 'department_id'
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

  /* ------------------------------- МО ----------------------------------- */

  async createDepartment(schoolId: string, name: string, color?: CardColor): Promise<SchoolDepartment> {
    this.assertSchoolAdmin(schoolId)
    const row: SchoolDepartment = {
      id: uid('dept'),
      school_id: schoolId,
      name: name.trim(),
      color: color ?? colorFromString(name),
      position: this.db.school_departments.filter((d) => d.school_id === schoolId).length,
      created_at: nowIso(),
    }
    this.db.school_departments.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async updateDepartment(
    id: string,
    patch: Partial<Pick<SchoolDepartment, 'name' | 'color' | 'position'>>,
  ): Promise<SchoolDepartment> {
    const row = this.db.school_departments.find((d) => d.id === id)
    if (!row) throw new Error('МО не найдено')
    this.assertSchoolAdmin(row.school_id)
    Object.assign(row, patch)
    this.persist({ table: 'school' })
    return row
  }

  async deleteDepartment(id: string): Promise<void> {
    const row = this.db.school_departments.find((d) => d.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    this.db.school_departments = this.db.school_departments.filter((d) => d.id !== id)
    // предметы остаются, у них просто пропадает привязка
    this.db.school_subjects.forEach((sub) => {
      if (sub.department_id === id) sub.department_id = null
    })
    this.persist({ table: 'school' })
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
      department_id: input.department_id ?? null,
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
    patch: Partial<Pick<SchoolSubject, 'name' | 'code' | 'color' | 'position' | 'department_id'>> & {
      class_ids?: string[]
    },
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
      teacher_ids: this.db.group_teachers.filter((t) => t.group_id === id).map((t) => t.person_id),
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
      term_id: input.term_id ?? null,
      created_at: nowIso(),
    }
    this.db.school_groups.push(group)
    for (const personId of input.member_ids ?? []) {
      this.db.group_members.push({ group_id: group.id, person_id: personId, added_at: nowIso() })
    }
    for (const personId of input.teacher_ids ?? []) {
      this.db.group_teachers.push({ group_id: group.id, person_id: personId, added_at: nowIso() })
    }
    this.persist({ table: 'school' })
    return this.mockGroupView(group.id)
  }

  async updateGroup(
    id: string,
    patch: Partial<Pick<SchoolGroup, 'name' | 'parallel_id' | 'class_id' | 'term_id'>> & {
      member_ids?: string[]
      teacher_ids?: string[]
    },
  ): Promise<GroupView> {
    const group = this.db.school_groups.find((g) => g.id === id)
    if (!group) throw new Error('Группа не найдена')
    this.assertSchoolAdmin(group.school_id)
    const { member_ids, teacher_ids, ...rest } = patch
    Object.assign(group, rest)
    if (member_ids) {
      this.db.group_members = this.db.group_members.filter((m) => m.group_id !== id)
      for (const personId of member_ids) {
        this.db.group_members.push({ group_id: id, person_id: personId, added_at: nowIso() })
      }
    }
    if (teacher_ids) {
      this.db.group_teachers = this.db.group_teachers.filter((t) => t.group_id !== id)
      for (const personId of teacher_ids) {
        this.db.group_teachers.push({ group_id: id, person_id: personId, added_at: nowIso() })
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
    this.db.group_teachers = this.db.group_teachers.filter((t) => t.group_id !== id)
    const gone = this.db.teaching_assignments.filter((a) => a.group_id === id).map((a) => a.id)
    this.db.teaching_assignments = this.db.teaching_assignments.filter((a) => a.group_id !== id)
    this.db.teaching_teachers = this.db.teaching_teachers.filter((t) => !gone.includes(t.assignment_id))
    this.persist({ table: 'school' })
  }

  async createTeaching(input: {
    school_id: string
    subject_id: string
    group_id: string
    teacher_ids: string[]
  }): Promise<TeachingAssignment> {
    this.assertSchoolAdmin(input.school_id)
    const me = this.me()
    const subject = this.mockSubjectView(input.subject_id)
    const group = this.mockGroupView(input.group_id)
    const teacherIds = [...new Set(input.teacher_ids.filter(Boolean))]

    const space: Space = {
      id: uid('space'),
      name: `${subject.name} · ${group.name}`,
      description: 'Курс собран из школы: предмет, группа и учителя',
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

    const row: TeachingAssignment = {
      id: uid('teaching'),
      curriculum_id: null,
      school_id: input.school_id,
      subject_id: input.subject_id,
      group_id: input.group_id,
      // teacher_id оставлен для совместимости: первый из списка
      teacher_id: teacherIds[0] ?? null,
      space_id: space.id,
      created_at: nowIso(),
      teacher_ids: teacherIds,
    }
    this.db.teaching_assignments.push(row)
    for (const teacherId of teacherIds) {
      this.db.teaching_teachers.push({ assignment_id: row.id, teacher_id: teacherId, added_at: nowIso() })
      // учитель курса — он же учитель группы
      if (!this.db.group_teachers.some((t) => t.group_id === input.group_id && t.person_id === teacherId)) {
        this.db.group_teachers.push({ group_id: input.group_id, person_id: teacherId, added_at: nowIso() })
      }
    }

    this.syncTeachingMembers(space.id, input.school_id, teacherIds, group.member_ids, me.id)

    // журнал курса: шкала, периоды и типы работ — как в серверном режиме
    await this.ensureGradebook(space.id)
    if (subject.assessment_types.length) {
      this.db.grade_categories = this.db.grade_categories.filter((c) => c.space_id !== space.id)
      subject.assessment_types.forEach((t, i) =>
        this.db.grade_categories.push({
          id: uid('cat'),
          space_id: space.id,
          name: t.name,
          code: t.code,
          weight: t.weight,
          color: t.color,
          default_priority_id: null,
          counts_toward_grade: t.counts_toward_grade,
          position: i,
          created_at: nowIso(),
        }),
      )
    }

    this.persist({ table: 'school' })
    this.persist({ table: 'spaces' })
    return { ...row }
  }

  async updateTeaching(id: string, patch: { teacher_ids: string[] }): Promise<TeachingAssignment> {
    const row = this.db.teaching_assignments.find((a) => a.id === id)
    if (!row) throw new Error('Курс не найден')
    this.assertSchoolAdmin(row.school_id)
    const me = this.me()
    const teacherIds = [...new Set(patch.teacher_ids.filter(Boolean))]

    this.db.teaching_teachers = this.db.teaching_teachers.filter((t) => t.assignment_id !== id)
    for (const teacherId of teacherIds) {
      this.db.teaching_teachers.push({ assignment_id: id, teacher_id: teacherId, added_at: nowIso() })
      if (!this.db.group_teachers.some((t) => t.group_id === row.group_id && t.person_id === teacherId)) {
        this.db.group_teachers.push({ group_id: row.group_id, person_id: teacherId, added_at: nowIso() })
      }
    }
    row.teacher_id = teacherIds[0] ?? null
    row.teacher_ids = teacherIds

    if (row.space_id) {
      const group = this.mockGroupView(row.group_id)
      this.syncTeachingMembers(row.space_id, row.school_id, teacherIds, group.member_ids, me.id)
    }

    this.persist({ table: 'school' })
    this.persist({ table: 'spaces' })
    return { ...row }
  }

  /**
   * Участники журнала курса: администратор и учителя правят, ученики группы
   * читают. Снятые с курса учителя доступ теряют.
   */
  private syncTeachingMembers(
    spaceId: string,
    schoolId: string,
    teacherIds: string[],
    studentIds: string[],
    ownerUserId: string,
  ): void {
    const people = this.db.school_people.filter((p) => p.school_id === schoolId)
    const userOf = (personId: string) => people.find((p) => p.id === personId)?.user_id ?? null
    const put = (userId: string | null, permission: Permission) => {
      if (!userId) return
      const existing = this.db.space_members.find((m) => m.space_id === spaceId && m.user_id === userId)
      if (existing) existing.permission = permission
      else this.db.space_members.push({ space_id: spaceId, user_id: userId, permission, joined_at: nowIso() })
    }
    put(ownerUserId, 'edit')
    teacherIds.forEach((id) => put(userOf(id), 'edit'))
    studentIds.forEach((id) => {
      const userId = userOf(id)
      // ученику не понижаем права, если он уже редактор этого пространства
      if (userId && !this.db.space_members.some((m) => m.space_id === spaceId && m.user_id === userId)) {
        put(userId, 'view')
      }
    })

    const keep = new Set<string>([ownerUserId, ...teacherIds.map(userOf).filter(Boolean) as string[]])
    studentIds.forEach((id) => {
      const userId = userOf(id)
      if (userId) keep.add(userId)
    })
    const dropped = people
      .filter((p) => (p.role === 'teacher' || p.role === 'admin') && p.user_id && !keep.has(p.user_id))
      .map((p) => p.user_id as string)
    if (dropped.length) {
      this.db.space_members = this.db.space_members.filter(
        (m) => m.space_id !== spaceId || !dropped.includes(m.user_id),
      )
    }
  }

  async deleteTeaching(id: string): Promise<void> {
    const row = this.db.teaching_assignments.find((a) => a.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    this.db.teaching_assignments = this.db.teaching_assignments.filter((a) => a.id !== id)
    this.db.teaching_teachers = this.db.teaching_teachers.filter((t) => t.assignment_id !== id)
    this.persist({ table: 'school' })
  }


  /* ----------------------------- проверка работ -------------------------- */

  private notify(input: {
    user_id: string
    kind: AppNotification['kind']
    title: string
    body?: string | null
    link?: string | null
    space_id?: string | null
  }) {
    this.db.notifications.unshift({
      id: uid('ntf'),
      user_id: input.user_id,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      space_id: input.space_id ?? null,
      read_at: null,
      created_at: nowIso(),
    })
  }

  async listReviewQueue(spaceId?: string | null): Promise<SubmissionReview[]> {
    const id = this.sessionUserId()
    if (!id) return []
    const editable = this.db.space_members
      .filter((m) => m.user_id === id && m.permission === 'edit')
      .map((m) => m.space_id)
    const scope = spaceId ? editable.filter((x) => x === spaceId) : editable

    return this.db.submissions
      .map((sub) => {
        const assignment = this.db.assignments.find((a) => a.id === sub.assignment_id)
        if (!assignment || !scope.includes(assignment.space_id)) return null
        const space = this.db.spaces.find((x) => x.id === assignment.space_id)
        const student = this.db.users.find((u) => u.id === sub.student_id)
        return {
          ...sub,
          assignment_title: assignment.title,
          assignment_due: assignment.due_date,
          space_id: assignment.space_id,
          space_name: space?.name ?? 'Курс',
          student_name: student?.name ?? 'Ученик',
          student_avatar: student?.avatar ?? null,
          state: submissionState(sub, assignment.due_date),
        } satisfies SubmissionReview
      })
      .filter((x): x is SubmissionReview => Boolean(x))
      .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))
  }

  async reviewSubmission(
    submissionId: string,
    input: { grade?: number | null; comment?: string | null; grade_item_id?: string | null },
  ): Promise<Submission> {
    const me = this.me()
    const sub = this.db.submissions.find((s) => s.id === submissionId)
    if (!sub) throw new Error('Работа не найдена')
    const assignment = this.db.assignments.find((a) => a.id === sub.assignment_id)
    if (assignment) this.assertSpaceAccess(assignment.space_id, true)

    sub.grade = input.grade ?? null
    sub.teacher_comment = input.comment ?? null
    sub.grade_item_id = input.grade_item_id ?? null
    sub.status = 'graded'
    sub.reviewed_at = nowIso()

    // оценка уходит в журнал тем же действием
    if (input.grade_item_id) {
      const existing = this.db.grades.find(
        (g) => g.item_id === input.grade_item_id && g.student_id === sub.student_id,
      )
      if (existing) {
        existing.score = input.grade ?? null
        existing.comment = input.comment ?? existing.comment
        existing.updated_at = nowIso()
      } else {
        this.db.grades.push({
          id: uid('grade'),
          item_id: input.grade_item_id,
          student_id: sub.student_id,
          score: input.grade ?? null,
          flag: 'none',
          comment: input.comment ?? null,
          reason: null,
          graded_by: me.id,
          updated_at: nowIso(),
        })
      }
    }

    if (assignment) {
      this.notify({
        user_id: sub.student_id,
        kind: 'submission_graded',
        title: `Работа проверена: ${assignment.title}`,
        body: input.comment ?? (input.grade != null ? `Оценка: ${input.grade}` : null),
        link: '/app/assignments',
        space_id: assignment.space_id,
      })
    }
    this.persist({ table: 'assignments', spaceId: assignment?.space_id })
    return sub
  }

  async returnSubmission(submissionId: string, comment: string): Promise<Submission> {
    const sub = this.db.submissions.find((s) => s.id === submissionId)
    if (!sub) throw new Error('Работа не найдена')
    const assignment = this.db.assignments.find((a) => a.id === sub.assignment_id)
    if (assignment) this.assertSpaceAccess(assignment.space_id, true)

    sub.status = 'returned'
    sub.teacher_comment = comment
    sub.reviewed_at = nowIso()
    sub.revision_count += 1

    if (assignment) {
      this.notify({
        user_id: sub.student_id,
        kind: 'submission_returned',
        title: `Работа вернулась на доработку: ${assignment.title}`,
        body: comment,
        link: '/app/assignments',
        space_id: assignment.space_id,
      })
    }
    this.persist({ table: 'assignments', spaceId: assignment?.space_id })
    return sub
  }

  async listSubmissionMessages(submissionId: string): Promise<SubmissionMessage[]> {
    return this.db.submission_messages
      .filter((m) => m.submission_id === submissionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  }

  async sendSubmissionMessage(
    submissionId: string,
    body: string,
    attachments: string[] = [],
  ): Promise<SubmissionMessage> {
    const me = this.me()
    const sub = this.db.submissions.find((s) => s.id === submissionId)
    if (!sub) throw new Error('Работа не найдена')
    const assignment = this.db.assignments.find((a) => a.id === sub.assignment_id)

    const row: SubmissionMessage = {
      id: uid('smsg'),
      submission_id: submissionId,
      author_id: me.id,
      body: body.trim(),
      attachments,
      created_at: nowIso(),
    }
    this.db.submission_messages.push(row)

    // собеседник узнаёт о сообщении
    if (assignment) {
      const title = `Сообщение по работе: ${assignment.title}`
      if (sub.student_id !== me.id) {
        this.notify({
          user_id: sub.student_id,
          kind: 'message',
          title,
          body: row.body.slice(0, 140),
          link: '/app/assignments',
          space_id: assignment.space_id,
        })
      } else {
        this.db.space_members
          .filter((m) => m.space_id === assignment.space_id && m.permission === 'edit' && m.user_id !== me.id)
          .forEach((m) =>
            this.notify({
              user_id: m.user_id,
              kind: 'message',
              title,
              body: row.body.slice(0, 140),
              link: '/app/review',
              space_id: assignment.space_id,
            }),
          )
      }
    }
    this.persist({ table: 'assignments', spaceId: assignment?.space_id })
    return row
  }

  /* ------------------------------ оповещения ----------------------------- */

  async listNotifications(limit = 50): Promise<AppNotification[]> {
    const id = this.sessionUserId()
    if (!id) return []
    return this.db.notifications.filter((n) => n.user_id === id).slice(0, limit)
  }

  async markNotificationsRead(ids?: string[]): Promise<void> {
    const id = this.sessionUserId()
    if (!id) return
    this.db.notifications
      .filter((n) => n.user_id === id && !n.read_at && (!ids?.length || ids.includes(n.id)))
      .forEach((n) => (n.read_at = nowIso()))
    this.persist({ table: 'assignments' })
  }

  async createGradeReason(schoolId: string, text: string): Promise<GradeReason> {
    this.assertSchoolAdmin(schoolId)
    const row: GradeReason = {
      id: uid('reason'),
      school_id: schoolId,
      text: text.trim(),
      position: this.db.grade_reasons.filter((r) => r.school_id === schoolId).length,
      created_at: nowIso(),
    }
    this.db.grade_reasons.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async deleteGradeReason(id: string): Promise<void> {
    const row = this.db.grade_reasons.find((r) => r.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    this.db.grade_reasons = this.db.grade_reasons.filter((r) => r.id !== id)
    this.persist({ table: 'school' })
  }

  /* ------------------- запросы на изменение состава групп ---------------- */

  private rosterView(r: RosterRequest): RosterRequestView {
    const group = this.db.school_groups.find((g) => g.id === r.group_id)
    const person = this.db.school_people.find((p) => p.id === r.person_id)
    const author = this.db.school_people.find((p) => p.id === r.requested_by)
    const name = (p?: SchoolPerson) =>
      p ? [p.last_name, p.first_name].filter(Boolean).join(' ').trim() : ''
    return {
      ...r,
      group_name: group?.name ?? 'группа удалена',
      person_name: name(person) || 'ученик удалён',
      requested_by_name: name(author) || '—',
    }
  }

  async listRosterRequests(
    schoolId: string,
    status: RosterRequestStatus | 'all' = 'pending',
  ): Promise<RosterRequestView[]> {
    return this.db.roster_requests
      .filter((r) => r.school_id === schoolId && (status === 'all' || r.status === status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => this.rosterView(r))
  }

  async requestRosterChange(input: {
    school_id: string
    group_id: string
    person_id: string
    kind: RosterRequestKind
    note?: string | null
  }): Promise<RosterRequest> {
    const me = this.db.school_people.find(
      (p) => p.school_id === input.school_id && p.user_id === this.sessionUserId(),
    )
    // пока запрос висит, повтор не добавляет информации
    const pending = this.db.roster_requests.find(
      (r) =>
        r.group_id === input.group_id &&
        r.person_id === input.person_id &&
        r.kind === input.kind &&
        r.status === 'pending',
    )
    if (pending) throw new Error('Такой запрос уже ждёт решения')

    const row: RosterRequest = {
      id: uid('req'),
      school_id: input.school_id,
      group_id: input.group_id,
      person_id: input.person_id,
      kind: input.kind,
      status: 'pending',
      requested_by: me?.id ?? null,
      note: input.note ?? null,
      decided_by: null,
      decided_at: null,
      decision_note: null,
      created_at: nowIso(),
    }
    this.db.roster_requests.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async decideRosterRequest(id: string, approve: boolean, note?: string | null): Promise<void> {
    const row = this.db.roster_requests.find((r) => r.id === id)
    if (!row) throw new Error('Запрос не найден')
    this.assertSchoolAdmin(row.school_id)
    if (row.status !== 'pending') throw new Error('Запрос уже решён')

    if (approve) {
      if (row.kind === 'add') {
        const exists = this.db.group_members.some(
          (m) => m.group_id === row.group_id && m.person_id === row.person_id,
        )
        if (!exists) {
          this.db.group_members.push({
            group_id: row.group_id,
            person_id: row.person_id,
            added_at: nowIso(),
          })
        }
      } else {
        this.db.group_members = this.db.group_members.filter(
          (m) => !(m.group_id === row.group_id && m.person_id === row.person_id),
        )
      }
    }

    const me = this.db.school_people.find(
      (p) => p.school_id === row.school_id && p.user_id === this.sessionUserId(),
    )
    row.status = approve ? 'approved' : 'declined'
    row.decided_by = me?.id ?? null
    row.decided_at = nowIso()
    row.decision_note = note ?? null
    this.persist({ table: 'school' })
  }

  /* ----------------------------- своды оценок --------------------------- */

  async gradeSummary(input: {
    school_id: string
    class_id: string
    year_id?: string | null
  }): Promise<GradeSummary> {
    const year =
      this.db.school_terms.find((t) => t.id === input.year_id) ??
      this.db.school_terms.find((t) => t.school_id === input.school_id && t.kind === 'year')
    const halves = year
      ? this.db.school_terms.filter((t) => t.parent_id === year.id)
      : []
    const quarters = this.db.school_terms
      .filter((t) => t.kind === 'quarter' && halves.some((h) => h.id === t.parent_id))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))

    const students = this.db.school_people
      .filter((p) => p.school_id === input.school_id && p.class_id === input.class_id && p.role === 'student')
      .sort((a, b) => a.last_name.localeCompare(b.last_name, 'ru'))

    const cells: SummaryCell[] = []
    const subjects = new Set<string>()

    for (const person of students) {
      if (!person.user_id) continue
      for (const member of this.db.space_members.filter((m) => m.user_id === person.user_id)) {
        const assignment = this.db.teaching_assignments.find((a) => a.space_id === member.space_id)
        if (!assignment) continue
        const subject = this.db.school_subjects.find((x) => x.id === assignment.subject_id)
        const subjectName = subject?.name ?? 'Предмет'
        subjects.add(subjectName)

        const items = this.db.grade_items.filter((i) => i.space_id === member.space_id)
        for (const term of quarters) {
          // оценка попадает в период по дате работы, а не по дате выставления
          const inTerm = items.filter(
            (i) => i.date.slice(0, 10) >= term.start_date && i.date.slice(0, 10) <= term.end_date,
          )
          const ids = new Set(inTerm.map((i) => i.id))
          const scores = this.db.grades
            .filter((g) => g.student_id === person.user_id && ids.has(g.item_id) && g.score !== null)
            .map((g) => g.score!)
          cells.push({
            person_id: person.id,
            subject_name: subjectName,
            term_id: term.id,
            average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
            count: scores.length,
          })
        }
      }
    }

    return {
      terms: quarters.map((t) => ({ id: t.id, name: t.name })),
      people: students.map((p) => ({
        id: p.id,
        name: [p.last_name, p.first_name].filter(Boolean).join(' ').trim() || 'Ученик',
      })),
      subjects: [...subjects].sort((a, b) => a.localeCompare(b, 'ru')),
      cells,
    }
  }

  /* --------------------------- роли-наблюдатели ------------------------- */

  async listWards(): Promise<Ward[]> {
    const id = this.sessionUserId()
    if (!id) return []
    const me = this.db.school_people.find((p) => p.user_id === id)
    if (!me) return []

    const wards = new Map<string, Ward>()
    const add = (personId: string, relation: WardRelation) => {
      const person = this.db.school_people.find((p) => p.id === personId)
      if (!person || wards.has(personId)) return
      wards.set(personId, {
        person_id: person.id,
        user_id: person.user_id,
        name: [person.last_name, person.first_name].filter(Boolean).join(' ').trim() || 'Ученик',
        class_label: this.mockClassLabel(person.class_id),
        relation,
      })
    }

    // дети родителя
    for (const link of this.db.parent_children.filter((c) => c.parent_id === me.id)) {
      add(link.child_id, 'child')
    }
    // ученики закреплённых классов: классрук и завуч
    const myClasses = this.db.person_classes.filter((c) => c.person_id === me.id).map((c) => c.class_id)
    for (const person of this.db.school_people) {
      if (person.role === 'student' && person.class_id && myClasses.includes(person.class_id)) {
        add(person.id, 'class')
      }
    }

    return [...wards.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  /** «9» + «А» → «9А»; дублирует логику useSchool, но та живёт в UI */
  private mockClassLabel(classId: string | null): string {
    if (!classId) return '—'
    const klass = this.db.school_classes.find((c) => c.id === classId)
    if (!klass) return '—'
    const parallel = this.db.school_parallels.find((p) => p.id === klass.parallel_id)
    const prefix = parallel?.name ?? ''
    const glue = /^\d+$/.test(prefix) && klass.name.length <= 2 ? '' : ' '
    return `${prefix}${glue}${klass.name}`.trim() || klass.name
  }

  async wardDiary(personId: string): Promise<WardDiary> {
    const wards = await this.listWards()
    const ward = wards.find((w) => w.person_id === personId)
    if (!ward) throw new Error('Нет доступа к этому ученику')
    if (!ward.user_id) return { ward, subjects: [], average: null }

    const today = new Date().toISOString().slice(0, 10)
    const subjects: WardSubject[] = []

    for (const member of this.db.space_members.filter((m) => m.user_id === ward.user_id)) {
      const space = this.db.spaces.find((x) => x.id === member.space_id)
      if (!space) continue
      // личные пространства ученика в сводку не идут: там нет предмета
      const assignment = this.db.teaching_assignments.find((a) => a.space_id === space.id)
      if (!assignment) continue
      const subject = this.db.school_subjects.find((x) => x.id === assignment.subject_id)

      const items = this.db.grade_items.filter((i) => i.space_id === space.id)
      const itemIds = new Set(items.map((i) => i.id))
      const grades = this.db.grades
        .filter((g) => g.student_id === ward.user_id && itemIds.has(g.item_id) && g.score !== null)
        .map((g) => ({ g, item: items.find((i) => i.id === g.item_id)! }))
        .filter((x) => Boolean(x.item))
        .sort((a, b) => b.g.updated_at.localeCompare(a.g.updated_at))

      const scale = this.db.grade_scales.find((x) => x.space_id === space.id && x.is_default)
      const scores = grades.map((x) => x.g.score!).filter((n) => Number.isFinite(n))
      const attendance = this.db.attendance.filter(
        (a) => a.student_id === ward.user_id && a.space_id === space.id,
      )

      subjects.push({
        space_id: space.id,
        subject_name: subject?.name ?? space.name,
        average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        scale_max: scale?.max_value ?? null,
        recent: grades.slice(0, 5).map((x) => ({
          title: x.item.title,
          score: x.g.score,
          date: x.g.updated_at.slice(0, 10),
          reason: x.g.reason,
        })),
        homework: this.db.lessons
          .filter((l) => l.space_id === space.id && l.homework && (l.homework_due ?? l.date) >= today)
          .sort((a, b) => (a.homework_due ?? a.date).localeCompare(b.homework_due ?? b.date))
          .slice(0, 5)
          .map((l) => ({ title: l.title, text: l.homework ?? '', due: l.homework_due })),
        absences: attendance.filter((a) => a.status === 'absent').length,
        lates: attendance.filter((a) => a.status === 'late').length,
      })
    }

    subjects.sort((a, b) => a.subject_name.localeCompare(b.subject_name, 'ru'))
    const withAvg = subjects.filter((s) => s.average !== null)
    return {
      ward,
      subjects,
      average: withAvg.length
        ? withAvg.reduce((n, s) => n + (s.average ?? 0), 0) / withAvg.length
        : null,
    }
  }

  /* ------------------------------ расписание ---------------------------- */

  async createBellSlot(input: {
    school_id: string
    level?: SchoolLevel | null
    position: number
    starts_at: string
    ends_at: string
  }): Promise<BellSlot> {
    this.assertSchoolAdmin(input.school_id)
    const row: BellSlot = {
      id: uid('bell'),
      school_id: input.school_id,
      level: input.level ?? null,
      position: input.position,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      created_at: nowIso(),
    }
    this.db.bell_slots.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async updateBellSlot(
    id: string,
    patch: Partial<Pick<BellSlot, 'starts_at' | 'ends_at' | 'position' | 'level'>>,
  ): Promise<BellSlot> {
    const row = this.db.bell_slots.find((x) => x.id === id)
    if (!row) throw new Error('Урок сетки не найден')
    this.assertSchoolAdmin(row.school_id)
    Object.assign(row, patch)
    this.persist({ table: 'school' })
    return row
  }

  async deleteBellSlot(id: string): Promise<void> {
    const row = this.db.bell_slots.find((x) => x.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    this.db.bell_slots = this.db.bell_slots.filter((x) => x.id !== id)
    // ячейки этого урока исчезают вместе с ним
    this.db.schedule_entries = this.db.schedule_entries.filter((x) => x.slot_id !== id)
    this.persist({ table: 'school' })
  }

  async createBellPreset(schoolId: string, firstAt = '08:30'): Promise<void> {
    this.assertSchoolAdmin(schoolId)
    const [h, m] = firstAt.split(':').map(Number)
    const start = h * 60 + m
    const hhmm = (mins: number) =>
      `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
    for (let i = 0; i < 8; i++) {
      // после второго и четвёртого урока перемена длиннее: обед
      const at = start + i * 55 + (i >= 2 ? 15 : 0) + (i >= 4 ? 15 : 0)
      await this.createBellSlot({
        school_id: schoolId,
        position: i,
        starts_at: hhmm(at),
        ends_at: hhmm(at + 45),
      })
    }
  }

  async placeLesson(input: {
    school_id: string
    assignment_id: string
    term_id?: string | null
    weekday: number
    slot_id: string
    room?: string | null
  }): Promise<ScheduleEntry> {
    this.assertSchoolAdmin(input.school_id)
    const term = input.term_id ?? null
    const clash = this.db.schedule_entries.find(
      (x) =>
        x.assignment_id === input.assignment_id &&
        x.weekday === input.weekday &&
        x.slot_id === input.slot_id &&
        (x.term_id ?? null) === term,
    )
    if (clash) throw new Error('Этот курс уже стоит в этой ячейке')
    const row: ScheduleEntry = {
      id: uid('slot'),
      school_id: input.school_id,
      assignment_id: input.assignment_id,
      term_id: term,
      weekday: input.weekday,
      slot_id: input.slot_id,
      room: input.room ?? null,
      created_at: nowIso(),
    }
    this.db.schedule_entries.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async updatePlacement(id: string, patch: Partial<Pick<ScheduleEntry, 'room'>>): Promise<ScheduleEntry> {
    const row = this.db.schedule_entries.find((x) => x.id === id)
    if (!row) throw new Error('Ячейка не найдена')
    this.assertSchoolAdmin(row.school_id)
    Object.assign(row, patch)
    this.persist({ table: 'school' })
    return row
  }

  async removePlacement(id: string): Promise<void> {
    const row = this.db.schedule_entries.find((x) => x.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    this.db.schedule_entries = this.db.schedule_entries.filter((x) => x.id !== id)
    this.persist({ table: 'school' })
  }

  async myWeek(mondayIso: string): Promise<ScheduleDay[]> {
    const id = this.sessionUserId()
    if (!id) return buildWeek(mondayIso, [], [])
    const person = this.db.school_people.find((p) => p.user_id === id)
    if (!person) return buildWeek(mondayIso, [], [])

    const myGroups = new Set(
      this.db.group_members.filter((m) => m.person_id === person.id).map((m) => m.group_id),
    )
    const myAssignments = new Set(
      this.db.teaching_teachers.filter((t) => t.teacher_id === person.id).map((t) => t.assignment_id),
    )

    const lessons: ScheduleLesson[] = []
    for (const entry of this.db.schedule_entries.filter((x) => x.school_id === person.school_id)) {
      const a = this.db.teaching_assignments.find((x) => x.id === entry.assignment_id)
      const slot = this.db.bell_slots.find((x) => x.id === entry.slot_id)
      if (!a || !slot) continue
      // своё расписание: группы ученика плюс курсы учителя
      if (!myGroups.has(a.group_id) && !myAssignments.has(a.id)) continue
      const subject = this.db.school_subjects.find((x) => x.id === a.subject_id)
      const group = this.db.school_groups.find((x) => x.id === a.group_id)
      lessons.push({
        entry_id: entry.id,
        assignment_id: a.id,
        space_id: a.space_id,
        subject_name: subject?.name ?? 'Предмет',
        group_name: group?.name ?? '',
        teachers: this.db.teaching_teachers
          .filter((t) => t.assignment_id === a.id)
          .map((t) => {
            const p = this.db.school_people.find((x) => x.id === t.teacher_id)
            return p ? `${p.last_name} ${p.first_name.slice(0, 1)}.` : ''
          })
          .filter(Boolean)
          .join(', '),
        weekday: entry.weekday,
        slot,
        room: entry.room,
      })
    }

    return buildWeek(
      mondayIso,
      lessons,
      this.db.school_holidays.filter((h) => h.school_id === person.school_id),
    )
  }

  /* ---------------------------- КТП и уроки ---------------------------- */

  async createLessonKind(schoolId: string, name: string, color: CardColor = 'blue'): Promise<LessonKind> {
    this.assertSchoolAdmin(schoolId)
    const kind: LessonKind = {
      id: uid('lkind'),
      school_id: schoolId,
      name: name.trim(),
      color,
      counts_hours: true,
      position: this.db.lesson_kinds.filter((k) => k.school_id === schoolId).length,
      created_at: nowIso(),
    }
    this.db.lesson_kinds.push(kind)
    this.persist({ table: 'school' })
    return kind
  }

  async updateLessonKind(id: string, patch: Partial<Omit<LessonKind, 'id' | 'school_id'>>): Promise<LessonKind> {
    const kind = this.db.lesson_kinds.find((k) => k.id === id)
    if (!kind) throw new Error('Тип урока не найден')
    this.assertSchoolAdmin(kind.school_id)
    Object.assign(kind, patch)
    this.persist({ table: 'school' })
    return kind
  }

  async deleteLessonKind(id: string): Promise<void> {
    const kind = this.db.lesson_kinds.find((k) => k.id === id)
    if (!kind) return
    this.assertSchoolAdmin(kind.school_id)
    this.db.lesson_kinds = this.db.lesson_kinds.filter((k) => k.id !== id)
    this.db.curriculum_lessons.forEach((l) => {
      if (l.kind_id === id) l.kind_id = null
    })
    this.persist({ table: 'school' })
  }

  /** Собирает план из плоских строк: темы с уроками внутри плюс уроки вне тем */
  private shapeCurriculum(c: Curriculum): CurriculumView {
    const mine = this.db.curriculum_lessons
      .filter((l) => l.curriculum_id === c.id)
      .sort((a, b) => a.position - b.position)
    return {
      ...c,
      topics: this.db.curriculum_topics
        .filter((t) => t.curriculum_id === c.id)
        .sort((a, b) => a.position - b.position)
        .map((t) => ({ ...t, lessons: mine.filter((l) => l.topic_id === t.id) })),
      loose: mine.filter((l) => !l.topic_id),
      assignment_ids: this.db.teaching_assignments.filter((a) => a.curriculum_id === c.id).map((a) => a.id),
    }
  }

  async listCurricula(schoolId: string, subjectId?: string | null): Promise<CurriculumView[]> {
    return this.db.curricula
      .filter((c) => c.school_id === schoolId && (!subjectId || c.subject_id === subjectId))
      .map((c) => this.shapeCurriculum(c))
  }

  async createCurriculum(input: {
    school_id: string
    subject_id?: string | null
    owner_id?: string | null
    name: string
    description?: string | null
  }): Promise<Curriculum> {
    const row: Curriculum = {
      id: uid('ktp'),
      school_id: input.school_id,
      subject_id: input.subject_id ?? null,
      owner_id: input.owner_id ?? null,
      name: input.name.trim(),
      description: input.description ?? null,
      is_auto: false,
      source_id: null,
      created_at: nowIso(),
    }
    this.db.curricula.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async updateCurriculum(
    id: string,
    patch: Partial<Pick<Curriculum, 'name' | 'description' | 'subject_id' | 'owner_id'>>,
  ): Promise<Curriculum> {
    const row = this.db.curricula.find((c) => c.id === id)
    if (!row) throw new Error('КТП не найдено')
    Object.assign(row, patch)
    this.persist({ table: 'school' })
    return row
  }

  async deleteCurriculum(id: string): Promise<void> {
    this.db.curricula = this.db.curricula.filter((c) => c.id !== id)
    this.db.curriculum_topics = this.db.curriculum_topics.filter((t) => t.curriculum_id !== id)
    this.db.curriculum_lessons = this.db.curriculum_lessons.filter((l) => l.curriculum_id !== id)
    this.db.teaching_assignments.forEach((a) => {
      if (a.curriculum_id === id) a.curriculum_id = null
    })
    this.persist({ table: 'school' })
  }

  async copyCurriculum(sourceId: string, ownerId: string | null, name?: string): Promise<string> {
    const src = this.db.curricula.find((c) => c.id === sourceId)
    if (!src) throw new Error('КТП не найдено')
    const copy: Curriculum = {
      ...src,
      id: uid('ktp'),
      owner_id: ownerId,
      name: name?.trim() || `${src.name} (копия)`,
      is_auto: false,
      source_id: src.id,
      created_at: nowIso(),
    }
    this.db.curricula.push(copy)
    // темы копируем по одной, чтобы знать, куда лягут их уроки
    const map = new Map<string, string>()
    this.db.curriculum_topics
      .filter((t) => t.curriculum_id === sourceId)
      .forEach((t) => {
        const id = uid('ktpt')
        map.set(t.id, id)
        this.db.curriculum_topics.push({ ...t, id, curriculum_id: copy.id, created_at: nowIso() })
      })
    this.db.curriculum_lessons
      .filter((l) => l.curriculum_id === sourceId)
      .forEach((l) => {
        this.db.curriculum_lessons.push({
          ...l,
          id: uid('ktpl'),
          curriculum_id: copy.id,
          topic_id: l.topic_id ? (map.get(l.topic_id) ?? null) : null,
          created_at: nowIso(),
        })
      })
    this.persist({ table: 'school' })
    return copy.id
  }

  async setAssignmentCurriculum(assignmentId: string, curriculumId: string | null): Promise<void> {
    const row = this.db.teaching_assignments.find((a) => a.id === assignmentId)
    if (!row) throw new Error('Курс не найден')
    row.curriculum_id = curriculumId
    this.persist({ table: 'school' })
  }

  async createTopic(curriculumId: string, name: string, hours?: number | null): Promise<CurriculumTopic> {
    const topic: CurriculumTopic = {
      id: uid('ktpt'),
      curriculum_id: curriculumId,
      name: name.trim(),
      hours: hours ?? null,
      position: this.db.curriculum_topics.filter((t) => t.curriculum_id === curriculumId).length,
      created_at: nowIso(),
    }
    this.db.curriculum_topics.push(topic)
    this.persist({ table: 'school' })
    return topic
  }

  async updateTopic(
    id: string,
    patch: Partial<Pick<CurriculumTopic, 'name' | 'hours' | 'position'>>,
  ): Promise<CurriculumTopic> {
    const topic = this.db.curriculum_topics.find((t) => t.id === id)
    if (!topic) throw new Error('Тема не найдена')
    Object.assign(topic, patch)
    this.persist({ table: 'school' })
    return topic
  }

  async deleteTopic(id: string): Promise<void> {
    this.db.curriculum_topics = this.db.curriculum_topics.filter((t) => t.id !== id)
    // уроки темы не теряются, а переезжают в «вне тем»
    this.db.curriculum_lessons.forEach((l) => {
      if (l.topic_id === id) l.topic_id = null
    })
    this.persist({ table: 'school' })
  }

  async createPlanLesson(input: {
    curriculum_id: string
    topic_id?: string | null
    kind_id?: string | null
    title: string
    theory?: string | null
    task?: string | null
  }): Promise<CurriculumLesson> {
    const lesson: CurriculumLesson = {
      id: uid('ktpl'),
      curriculum_id: input.curriculum_id,
      topic_id: input.topic_id ?? null,
      kind_id: input.kind_id ?? null,
      title: input.title.trim(),
      theory: input.theory ?? null,
      task: input.task ?? null,
      position: this.db.curriculum_lessons.filter((l) => l.curriculum_id === input.curriculum_id).length,
      created_at: nowIso(),
    }
    this.db.curriculum_lessons.push(lesson)
    this.persist({ table: 'school' })
    return lesson
  }

  async updatePlanLesson(
    id: string,
    patch: Partial<Pick<CurriculumLesson, 'title' | 'theory' | 'task' | 'kind_id' | 'topic_id' | 'position'>>,
  ): Promise<CurriculumLesson> {
    const lesson = this.db.curriculum_lessons.find((l) => l.id === id)
    if (!lesson) throw new Error('Урок плана не найден')
    Object.assign(lesson, patch)
    this.persist({ table: 'school' })
    return lesson
  }

  async deletePlanLesson(id: string): Promise<void> {
    this.db.curriculum_lessons = this.db.curriculum_lessons.filter((l) => l.id !== id)
    this.persist({ table: 'school' })
  }

  async attachLessonToPlan(lessonId: string): Promise<void> {
    const lesson = this.db.lessons.find((l) => l.id === lessonId)
    if (!lesson || lesson.curriculum_lesson_id) return
    const assign = this.db.teaching_assignments.find((a) => a.space_id === lesson.space_id)
    // пространство не привязано к школьному курсу — плана тут и не должно быть
    if (!assign) return

    if (!assign.curriculum_id) {
      const uid_ = this.sessionUserId()
      const person = this.db.school_people.find(
        (p) => p.school_id === assign.school_id && p.user_id === uid_,
      )
      const subject = this.db.school_subjects.find((x) => x.id === assign.subject_id)
      const group = this.db.school_groups.find((g) => g.id === assign.group_id)
      const row: Curriculum = {
        id: uid('ktp'),
        school_id: assign.school_id,
        subject_id: assign.subject_id,
        owner_id: person?.id ?? null,
        name: [subject?.name, group?.name].filter(Boolean).join(' · ') || 'КТП курса',
        description: null,
        is_auto: true,
        source_id: null,
        created_at: nowIso(),
      }
      this.db.curricula.push(row)
      assign.curriculum_id = row.id
    }

    const planned: CurriculumLesson = {
      id: uid('ktpl'),
      curriculum_id: assign.curriculum_id,
      topic_id: null,
      kind_id: null,
      title: lesson.topic?.trim() || lesson.title,
      theory: lesson.theory,
      task: lesson.task,
      position: this.db.curriculum_lessons.filter((l) => l.curriculum_id === assign.curriculum_id).length,
      created_at: nowIso(),
    }
    this.db.curriculum_lessons.push(planned)
    lesson.curriculum_lesson_id = planned.id
    this.persist({ table: 'school' })
  }

  /* ------------------------- периоды и каникулы ------------------------ */

  async createTerm(input: {
    school_id: string
    parent_id?: string | null
    kind: TermKind
    name: string
    start_date: string
    end_date: string
  }): Promise<SchoolTerm> {
    this.assertSchoolAdmin(input.school_id)
    const row: SchoolTerm = {
      id: uid('term'),
      school_id: input.school_id,
      parent_id: input.parent_id ?? null,
      kind: input.kind,
      name: input.name.trim(),
      start_date: input.start_date,
      end_date: input.end_date,
      position: this.db.school_terms.filter(
        (t) => t.school_id === input.school_id && t.kind === input.kind,
      ).length,
      is_current: false,
      created_at: nowIso(),
    }
    this.db.school_terms.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async updateTerm(
    id: string,
    patch: Partial<Pick<SchoolTerm, 'name' | 'start_date' | 'end_date' | 'position' | 'is_current'>>,
  ): Promise<SchoolTerm> {
    const row = this.db.school_terms.find((t) => t.id === id)
    if (!row) throw new Error('Период не найден')
    this.assertSchoolAdmin(row.school_id)
    Object.assign(row, patch)
    // текущий период ровно один: отмечая новый, снимаем отметку с остальных
    if (patch.is_current) {
      this.db.school_terms
        .filter((t) => t.school_id === row.school_id && t.id !== id)
        .forEach((t) => (t.is_current = false))
    }
    this.persist({ table: 'school' })
    return row
  }

  async deleteTerm(id: string): Promise<void> {
    const row = this.db.school_terms.find((t) => t.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    // вложенные периоды уходят вместе с родителем, как и в базе
    const doomed = new Set<string>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const t of this.db.school_terms) {
        if (t.parent_id && doomed.has(t.parent_id) && !doomed.has(t.id)) {
          doomed.add(t.id)
          grew = true
        }
      }
    }
    this.db.school_terms = this.db.school_terms.filter((t) => !doomed.has(t.id))
    this.db.school_groups.forEach((g) => {
      if (g.term_id && doomed.has(g.term_id)) g.term_id = null
    })
    this.persist({ table: 'school' })
  }

  async createTermPreset(schoolId: string, yearStart: string): Promise<void> {
    this.assertSchoolAdmin(schoolId)
    const start = new Date(yearStart)
    const shift = (months: number, days = 0) => {
      const d = new Date(start)
      d.setMonth(d.getMonth() + months)
      d.setDate(d.getDate() + days)
      return d.toISOString().slice(0, 10)
    }
    const yearEnd = shift(12, -1)

    const year = await this.createTerm({
      school_id: schoolId,
      kind: 'year',
      name: `${start.getFullYear()}/${new Date(yearEnd).getFullYear()}`,
      start_date: yearStart,
      end_date: yearEnd,
    })
    await this.updateTerm(year.id, { is_current: true })

    const h1 = await this.createTerm({
      school_id: schoolId,
      parent_id: year.id,
      kind: 'semester',
      name: 'I полугодие',
      start_date: yearStart,
      end_date: shift(4),
    })
    const h2 = await this.createTerm({
      school_id: schoolId,
      parent_id: year.id,
      kind: 'semester',
      name: 'II полугодие',
      start_date: shift(4, 1),
      end_date: yearEnd,
    })

    const quarters: Array<[string, string, string, string]> = [
      [h1.id, 'I четверть', yearStart, shift(2)],
      [h1.id, 'II четверть', shift(2, 1), shift(4)],
      [h2.id, 'III четверть', shift(4, 1), shift(7)],
      [h2.id, 'IV четверть', shift(7, 1), shift(9)],
      [h2.id, 'Летний период', shift(9, 1), yearEnd],
    ]
    for (const [parent, name, from, to] of quarters) {
      await this.createTerm({
        school_id: schoolId,
        parent_id: parent,
        kind: 'quarter',
        name,
        start_date: from,
        end_date: to,
      })
    }
  }

  async createHoliday(input: {
    school_id: string
    name: string
    start_date: string
    end_date: string
  }): Promise<SchoolHoliday> {
    this.assertSchoolAdmin(input.school_id)
    const row: SchoolHoliday = {
      id: uid('holiday'),
      school_id: input.school_id,
      name: input.name.trim(),
      start_date: input.start_date,
      end_date: input.end_date,
      created_at: nowIso(),
    }
    this.db.school_holidays.push(row)
    this.persist({ table: 'school' })
    return row
  }

  async updateHoliday(
    id: string,
    patch: Partial<Pick<SchoolHoliday, 'name' | 'start_date' | 'end_date'>>,
  ): Promise<SchoolHoliday> {
    const row = this.db.school_holidays.find((h) => h.id === id)
    if (!row) throw new Error('Каникулы не найдены')
    this.assertSchoolAdmin(row.school_id)
    Object.assign(row, patch)
    this.persist({ table: 'school' })
    return row
  }

  async deleteHoliday(id: string): Promise<void> {
    const row = this.db.school_holidays.find((h) => h.id === id)
    if (!row) return
    this.assertSchoolAdmin(row.school_id)
    this.db.school_holidays = this.db.school_holidays.filter((h) => h.id !== id)
    this.persist({ table: 'school' })
  }

  /* ------------------------------- роли -------------------------------- */

  async setPersonRoles(personId: string, roles: SchoolRole[]): Promise<void> {
    const person = this.db.school_people.find((p) => p.id === personId)
    if (!person) throw new Error('Человек не найден')
    this.assertSchoolAdmin(person.school_id)
    const list = [...new Set(roles)]
    this.db.person_roles = this.db.person_roles.filter((r) => r.person_id !== personId)
    list.forEach((role) => this.db.person_roles.push({ person_id: personId, role }))
    // основной остаётся первая выбранная: по ней работают старые экраны
    if (list.length) person.role = list[0]
    this.persist({ table: 'school' })
  }

  async setPersonClasses(personId: string, classIds: string[]): Promise<void> {
    const person = this.db.school_people.find((p) => p.id === personId)
    if (!person) throw new Error('Человек не найден')
    this.assertSchoolAdmin(person.school_id)
    this.db.person_classes = this.db.person_classes.filter((c) => c.person_id !== personId)
    ;[...new Set(classIds)].forEach((class_id) =>
      this.db.person_classes.push({ person_id: personId, class_id }),
    )
    this.persist({ table: 'school' })
  }

  async setParentChildren(parentId: string, childIds: string[]): Promise<void> {
    const person = this.db.school_people.find((p) => p.id === parentId)
    if (!person) throw new Error('Человек не найден')
    this.assertSchoolAdmin(person.school_id)
    this.db.parent_children = this.db.parent_children.filter((c) => c.parent_id !== parentId)
    ;[...new Set(childIds)]
      .filter((id) => id !== parentId)
      .forEach((child_id) => this.db.parent_children.push({ parent_id: parentId, child_id }))
    this.persist({ table: 'school' })
  }

  async myMemberships(): Promise<MyMembership[]> {
    const uid_ = this.sessionUserId()
    if (!uid_) return []
    const list: MyMembership[] = []
    for (const p of this.db.school_people.filter((x) => x.user_id === uid_)) {
      const school = this.db.schools.find((s) => s.id === p.school_id)
      list.push({
        school_id: p.school_id,
        school_name: school?.name ?? 'Школа',
        person_id: p.id,
        is_owner: school?.owner_id === uid_,
        roles: [
          ...new Set([
            p.role,
            ...this.db.person_roles.filter((r) => r.person_id === p.id).map((r) => r.role),
          ]),
        ],
      })
    }
    for (const school of this.db.schools.filter((x) => x.owner_id === uid_)) {
      const found = list.find((m) => m.school_id === school.id)
      if (found) {
        found.is_owner = true
        if (!found.roles.includes('admin')) found.roles.push('admin')
      } else {
        list.push({
          school_id: school.id,
          school_name: school.name,
          person_id: null,
          is_owner: true,
          roles: ['admin'],
        })
      }
    }
    return list
  }

  /* ============================ платформа ================================ */

  /** В локальном режиме главный админ — первый зарегистрированный аккаунт */
  private platformAdminId(): string | null {
    return this.db.platform_admins[0] ?? this.db.users[0]?.id ?? null
  }

  async isPlatformAdmin(): Promise<boolean> {
    const me = this.db.users.find((u) => u.id === localStorage.getItem(SESSION_KEY))
    return Boolean(me && me.id === this.platformAdminId())
  }

  async platformOverview(): Promise<PlatformOverview> {
    const people = this.db.school_people
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
    return {
      users: this.db.users.length,
      schools: this.db.schools.length,
      blocked: this.db.schools.filter((s) => (s as School & { is_blocked?: boolean }).is_blocked).length,
      spaces: this.db.spaces.length,
      people: people.length,
      students: people.filter((p) => p.role === 'student').length,
      teachers: people.filter((p) => p.role === 'teacher').length,
      no_account: people.filter((p) => !p.user_id).length,
      materials: this.db.materials.length,
      assignments: this.db.assignments.length,
      grades: this.db.grades.length,
      courses: this.db.teaching_assignments.length,
      new_users_7d: this.db.users.filter((u) => new Date(u.created_at).getTime() > weekAgo).length,
    }
  }

  async platformSchools(): Promise<PlatformSchool[]> {
    return this.db.schools.map((s) => {
      const mine = this.db.school_people.filter((p) => p.school_id === s.id)
      const owner = this.db.users.find((u) => u.id === s.owner_id)
      const extra = s as School & { is_blocked?: boolean; blocked_reason?: string | null }
      return {
        id: s.id,
        name: s.name,
        code: s.code,
        owner_id: s.owner_id,
        owner_name: owner?.name ?? null,
        owner_email: owner?.email ?? null,
        is_blocked: Boolean(extra.is_blocked),
        blocked_reason: extra.blocked_reason ?? null,
        created_at: s.created_at,
        people: mine.length,
        students: mine.filter((p) => p.role === 'student').length,
        teachers: mine.filter((p) => p.role === 'teacher').length,
        spaces: this.db.spaces.filter((x) => (x as Space & { school_id?: string }).school_id === s.id).length,
      }
    })
  }

  async platformSpaces(): Promise<PlatformSpace[]> {
    return this.db.spaces.map((sp) => {
      const extra = sp as Space & { school_id?: string | null }
      return {
        id: sp.id,
        name: sp.name,
        color: sp.color,
        owner_id: sp.owner_id,
        owner_name: this.db.users.find((u) => u.id === sp.owner_id)?.name ?? null,
        school_id: extra.school_id ?? null,
        school_name: this.db.schools.find((s) => s.id === extra.school_id)?.name ?? null,
        members: this.db.space_members.filter((m) => m.space_id === sp.id).length,
        materials: this.db.materials.filter((m) => m.space_id === sp.id).length,
        created_at: sp.created_at,
      }
    })
  }

  async platformPeople(query: string): Promise<PlatformPerson[]> {
    const q = query.trim().toLowerCase()
    return this.db.school_people
      .filter((p) => {
        if (!q) return true
        const name = [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ').toLowerCase()
        return name.includes(q) || (p.login ?? '').toLowerCase().includes(q)
      })
      .slice(0, 300)
      .map((p) => {
        const klass = this.db.school_classes.find((c) => c.id === p.class_id)
        const parallel = klass ? this.db.school_parallels.find((x) => x.id === klass.parallel_id) : undefined
        const prefix = parallel?.name ?? ''
        const glue = /^\d+$/.test(prefix) && (klass?.name.length ?? 0) <= 2 ? '' : ' '
        return {
          id: p.id,
          school_id: p.school_id,
          school_name: this.db.schools.find((s) => s.id === p.school_id)?.name ?? null,
          role: p.role,
          full_name:
            [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ').trim() ||
            p.login ||
            'Без имени',
          login: p.login,
          user_id: p.user_id,
          email: this.db.users.find((u) => u.id === p.user_id)?.email ?? null,
          is_active: p.is_active,
          class_label: klass ? `${prefix}${glue}${klass.name}`.trim() : null,
        }
      })
  }

  async platformAudit(limit = 200): Promise<PlatformAuditEntry[]> {
    return [...this.db.platform_audit]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((row) => ({
        ...row,
        actor_name: this.db.users.find((u) => u.id === row.actor_id)?.name ?? null,
      }))
  }

  async platformLog(entry: {
    action: string
    target_type?: string | null
    target_id?: string | null
    target_label?: string | null
    meta?: Record<string, unknown>
  }): Promise<void> {
    const me = this.me()
    this.db.platform_audit.push({
      id: uid('audit'),
      actor_id: me.id,
      actor_name: me.name,
      action: entry.action,
      target_type: entry.target_type ?? null,
      target_id: entry.target_id ?? null,
      target_label: entry.target_label ?? null,
      meta: entry.meta ?? {},
      created_at: nowIso(),
    })
    this.persist({ table: 'school' })
  }

  async platformBlockSchool(schoolId: string, blocked: boolean, reason?: string | null): Promise<void> {
    const school = this.db.schools.find((s) => s.id === schoolId) as
      | (School & { is_blocked?: boolean; blocked_reason?: string | null })
      | undefined
    if (!school) throw new Error('Школа не найдена')
    school.is_blocked = blocked
    school.blocked_reason = blocked ? (reason ?? null) : null
    await this.platformLog({
      action: blocked ? 'school.block' : 'school.unblock',
      target_type: 'school',
      target_id: schoolId,
      target_label: school.name,
      meta: reason ? { reason } : {},
    })
    this.persist({ table: 'school' })
  }

  async platformResetPassword(personId: string, password: string): Promise<void> {
    const person = this.db.school_people.find((p) => p.id === personId)
    if (!person) throw new Error('Человек не найден')
    const results = await this.setAccountPassword(person.school_id, [{ person_id: personId, password }])
    const bad = results.find((r) => !r.ok)
    if (bad) throw new Error(bad.error ?? 'Не удалось сменить пароль')
    await this.platformLog({
      action: 'person.reset_password',
      target_type: 'school_person',
      target_id: personId,
      target_label: `${person.last_name} ${person.first_name}`.trim() || person.login || personId,
      meta: { school_id: person.school_id },
    })
  }


  async platformSearch(query: string): Promise<PlatformFinding[]> {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const spaceName = (id: string) => this.db.spaces.find((s) => s.id === id)?.name ?? null
    const schoolName = (id: string) => {
      const sp = this.db.spaces.find((s) => s.id === id) as (Space & { school_id?: string }) | undefined
      return this.db.schools.find((x) => x.id === sp?.school_id)?.name ?? null
    }
    const userName = (id: string | null) =>
      id ? (this.db.users.find((u) => u.id === id)?.name ?? null) : null
    const hit = (...parts: Array<string | null | undefined>) =>
      parts.some((p) => (p ?? '').toLowerCase().includes(q))

    const out: PlatformFinding[] = []
    for (const m of this.db.materials) {
      const extra = m as Material & { is_hidden?: boolean }
      if (!hit(m.title, m.description, m.content, m.file_name)) continue
      out.push({
        kind: 'material',
        id: m.id,
        space_id: m.space_id,
        space_name: spaceName(m.space_id),
        school_name: schoolName(m.space_id),
        author_id: m.author_id,
        author_name: userName(m.author_id),
        title: m.title,
        excerpt: `${m.description ?? ''} ${m.content ?? ''}`.trim().slice(0, 300),
        is_hidden: Boolean(extra.is_hidden),
        created_at: m.created_at,
      })
    }
    for (const c of this.db.comments) {
      const extra = c as Comment & { is_hidden?: boolean }
      if (!hit(c.body)) continue
      out.push({
        kind: 'comment',
        id: c.id,
        space_id: c.space_id,
        space_name: spaceName(c.space_id),
        school_name: schoolName(c.space_id),
        author_id: c.author_id,
        author_name: userName(c.author_id),
        title: c.body.slice(0, 80),
        excerpt: c.body.slice(0, 300),
        is_hidden: Boolean(extra.is_hidden),
        created_at: c.created_at,
      })
    }
    for (const a of this.db.assignments) {
      if (!hit(a.title, a.description)) continue
      out.push({
        kind: 'assignment',
        id: a.id,
        space_id: a.space_id,
        space_name: spaceName(a.space_id),
        school_name: schoolName(a.space_id),
        author_id: null,
        author_name: null,
        title: a.title,
        excerpt: (a.description ?? '').slice(0, 300),
        is_hidden: false,
        created_at: a.created_at,
      })
    }
    return out.sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 200)
  }

  async platformHide(
    kind: 'material' | 'comment',
    id: string,
    hidden: boolean,
    reason?: string | null,
    label?: string | null,
  ): Promise<void> {
    const row =
      kind === 'material'
        ? (this.db.materials.find((m) => m.id === id) as (Material & Record<string, unknown>) | undefined)
        : (this.db.comments.find((c) => c.id === id) as (Comment & Record<string, unknown>) | undefined)
    if (!row) throw new Error('Не найдено')
    row.is_hidden = hidden
    row.hidden_reason = hidden ? (reason ?? null) : null
    row.hidden_at = hidden ? nowIso() : null
    await this.platformLog({
      action: hidden ? `${kind}.hide` : `${kind}.unhide`,
      target_type: kind,
      target_id: id,
      target_label: label ?? null,
      meta: reason ? { reason } : {},
    })
    this.persist({ table: kind === 'material' ? 'materials' : 'comments' })
  }

  async platformOpenIncident(input: {
    title: string
    note?: string | null
    finding: PlatformFinding
  }): Promise<PlatformIncident> {
    const me = this.me()
    const f = input.finding
    const row: PlatformIncident = {
      id: uid('incident'),
      opened_by: me.id,
      opened_by_name: me.name,
      kind: 'content',
      status: 'open',
      title: input.title,
      note: input.note ?? null,
      snapshot: {
        kind: f.kind,
        title: f.title,
        excerpt: f.excerpt,
        author_name: f.author_name,
        space_name: f.space_name,
        school_name: f.school_name,
        created_at: f.created_at,
        captured_at: nowIso(),
      },
      source_type: f.kind,
      source_id: f.id,
      space_id: f.space_id,
      school_id: null,
      author_id: f.author_id,
      created_at: nowIso(),
      closed_at: null,
    }
    this.db.platform_incidents.push(row)
    await this.platformLog({
      action: 'incident.open',
      target_type: f.kind,
      target_id: f.id,
      target_label: input.title,
    })
    this.persist({ table: 'school' })
    return row
  }

  async platformIncidents(): Promise<PlatformIncident[]> {
    return [...this.db.platform_incidents]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => ({
        ...r,
        opened_by_name: this.db.users.find((u) => u.id === r.opened_by)?.name ?? null,
      }))
  }

  async platformCloseIncident(id: string, closed: boolean): Promise<void> {
    const row = this.db.platform_incidents.find((r) => r.id === id)
    if (!row) return
    row.status = closed ? 'closed' : 'open'
    row.closed_at = closed ? nowIso() : null
    await this.platformLog({
      action: closed ? 'incident.close' : 'incident.reopen',
      target_type: 'incident',
      target_id: id,
    })
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
      // скрытое модерацией не показываем участникам
      .filter((c) => !(c as Comment & { is_hidden?: boolean }).is_hidden)
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
      .filter((m) => m.space_id === spaceId && !(m as Material & { is_hidden?: boolean }).is_hidden)
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
        teacher_comment: null,
        reviewed_at: null,
        grade_item_id: null,
        revision_count: 0,
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
            reason: null,
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
      // без даты работа не попала бы ни в одну четверть свода
      date: input.date || nowIso().slice(0, 10),
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
        reason: null,
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
        reason: null,
        graded_by: me.id,
        updated_at: nowIso(),
      }
      this.db.grades.push(grade)
    }
    if (input.score !== undefined) grade.score = input.score
    if (input.flag !== undefined) grade.flag = input.flag
    if (input.comment !== undefined) grade.comment = input.comment
    if (input.reason !== undefined) grade.reason = input.reason
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
      homework_due: input.homework_due ?? null,
      theory: input.theory ?? null,
      task: input.task ?? null,
      curriculum_lesson_id: input.curriculum_lesson_id ?? null,
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
