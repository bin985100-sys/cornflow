import type {
  Assignment,
  AssignmentView,
  Folder,
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
} from '../types'
import { colorFromString, inviteCode, nowIso, uid } from '../utils'
import { blobUrl, deleteBlob, putBlob } from './idb'
import type {
  ChangeEvent,
  CreateAssignmentInput,
  CreateFolderInput,
  CreateMaterialInput,
  CreateSpaceInput,
  DataProvider,
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
    this.persist({ table: 'spaces' })
  }

  async joinSpaceByCode(code: string): Promise<Space> {
    const me = this.me()
    const normalized = code.trim().toUpperCase()
    const space = this.db.spaces.find((s) => s.invite_code.toUpperCase() === normalized)
    if (!space) throw new Error('Пространство с таким кодом не найдено')
    const exists = this.db.space_members.find((m) => m.space_id === space.id && m.user_id === me.id)
    if (!exists) {
      this.db.space_members.push({
        space_id: space.id,
        user_id: me.id,
        permission: me.role === 'teacher' ? 'edit' : 'view',
        joined_at: nowIso(),
      })
      this.persist({ table: 'spaces', spaceId: space.id })
    }
    return space
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
    this.persist({ table: 'submissions', spaceId: assignment?.space_id ?? null })
    return sub
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
