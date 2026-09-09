import type {
  Assignment,
  AssignmentView,
  Attendance,
  AttendanceStatus,
  CriterionScore,
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
  Folder,
  Material,
  MaterialView,
  Permission,
  Progress,
  ProgressStatus,
  Space,
  SpaceView,
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
import { colorFromString, inviteCode, nowIso, schoolLoginEmail, uid } from '../utils'
import {
  DEFAULT_CATEGORIES,
  DEFAULT_LESSON_PRIORITIES,
  DEFAULT_LESSON_STATUSES,
  defaultPeriods,
  presetByKey,
} from '../grading'
import { BUCKET, supabase } from '../supabase'
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
  SchoolSignInInput,
  GradeInput,
  SignInInput,
  SignUpInput,
  UploadResult,
} from './provider'

const PENDING_ROLE_KEY = 'cornflow.pendingRole'
const GOOGLE_MODE_KEY = 'cornflow.googleMode'

/* ---------------------------------------------------------------------------
   Реализация поверх Supabase: auth + postgres + storage + realtime.
   Схема таблиц — supabase/migrations/0001_init.sql (там же политики RLS).
   Включается автоматически, как только в .env заданы
   VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.
--------------------------------------------------------------------------- */

function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(humanError(res.error))
  return res.data as T
}

/** Понятный текст вместо служебного сообщения Postgres. */
function humanError(error: { message: string; code?: string }): string {
  if (error.code === '23505' || error.message.includes('duplicate key value')) {
    return 'Запись с таким названием в этом пространстве уже есть'
  }
  return error.message
}

export class SupabaseProvider implements DataProvider {
  readonly kind = 'supabase' as const

  private listeners = new Set<(e: ChangeEvent) => void>()
  private realtimeReady = false

  /* --------------------------------- auth -------------------------------- */

  private async profile(userId: string): Promise<User | null> {
    const { data, error } = await supabase().from('users').select('*').eq('id', userId).maybeSingle()
    if (error) throw new Error(error.message)
    return (data as User) ?? null
  }

  /** Создаёт стартовое пространство, если у пользователя ещё нет ни одного. */
  private async ensureStarterSpace(user: User): Promise<void> {
    const { data: existing } = await supabase()
      .from('space_members')
      .select('space_id')
      .eq('user_id', user.id)
      .limit(1)
    if (existing && existing.length) return

    const { data: space } = await supabase()
      .from('spaces')
      .insert({
        name: user.role === 'teacher' ? 'Мой курс' : 'Моё пространство',
        description:
          user.role === 'teacher'
            ? 'Первое пространство — переименуйте его под свой предмет'
            : 'Личные материалы и конспекты',
        owner_id: user.id,
        color: user.role === 'teacher' ? 'blue' : 'purple',
        invite_code: inviteCode(),
      })
      .select()
      .single()

    if (space) {
      await supabase()
        .from('space_members')
        .insert({ space_id: (space as Space).id, user_id: user.id, permission: 'edit' })
    }
  }

  async getCurrentUser(): Promise<User | null> {
    const { data } = await supabase().auth.getUser()
    if (!data.user) return null
    const p = await this.profile(data.user.id)
    if (p) {
      localStorage.removeItem(PENDING_ROLE_KEY)
      localStorage.removeItem(GOOGLE_MODE_KEY)
      // Аккаунт мог остаться без единого пространства (например, профиль
      // создавали в обход приложения) — тогда заводим стартовое.
      await this.ensureStarterSpace(p).catch(() => undefined)
      return p
    }
    // Профиля нет. Если человек пришёл со вкладки «Войти», аккаунта у него
    // действительно ещё не было — не заводим его молча, а просим зарегистрироваться.
    if (localStorage.getItem(GOOGLE_MODE_KEY) === 'signin') {
      localStorage.removeItem(GOOGLE_MODE_KEY)
      await supabase().auth.signOut()
      throw new Error(
        'Аккаунта с этой почтой ещё нет. Перейдите на вкладку «Создать аккаунт», выберите роль и зарегистрируйтесь.',
      )
    }
    localStorage.removeItem(GOOGLE_MODE_KEY)
    // Первый вход через Google — создаём профиль на лету.
    const meta = data.user.user_metadata ?? {}
    // Роль, выбранную на экране регистрации перед переходом в Google,
    // держим в localStorage: через OAuth она иначе теряется.
    const pending = localStorage.getItem(PENDING_ROLE_KEY)
    const pendingRole: User['role'] | null =
      pending === 'teacher' || pending === 'student' ? pending : null
    const created = unwrap(
      await supabase()
        .from('users')
        .insert({
          id: data.user.id,
          email: data.user.email,
          name: (meta.name as string) || data.user.email?.split('@')[0] || 'Пользователь',
          role: (meta.role as User['role']) || pendingRole || 'student',
          avatar: (meta.avatar_url as string) ?? null,
        })
        .select()
        .single(),
    )
    localStorage.removeItem(PENDING_ROLE_KEY)
    const user = created as unknown as User
    // Вход через Google: профиля ещё не было, значит это первая сессия —
    // заводим стартовое пространство, как при обычной регистрации.
    await this.ensureStarterSpace(user).catch(() => undefined)
    return user
  }

  async signUp(input: SignUpInput): Promise<User> {
    const { data, error } = await supabase().auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: { data: { name: input.name, role: input.role } },
    })
    if (error) {
      const text = error.message.toLowerCase()
      if (text.includes('already registered') || text.includes('already been registered')) {
        throw new Error('Аккаунт с такой почтой уже есть — перейдите на вкладку «Войти»')
      }
      if (text.includes('rate limit')) {
        throw new Error('Слишком много попыток подряд — подождите пару минут и попробуйте снова')
      }
      throw new Error(error.message)
    }
    if (!data.user) throw new Error('Не удалось создать аккаунт')

    // Триггер handle_new_user создаёт строку в public.users; на случай, если
    // подтверждение почты выключено, дожидаемся её появления.
    const user = (await this.profile(data.user.id)) ?? {
      id: data.user.id,
      name: input.name,
      email: input.email,
      role: input.role,
      avatar: null,
      created_at: nowIso(),
    }

    // Стартовое пространство пользователя
    await this.ensureStarterSpace(user).catch(() => undefined)

    return user
  }

  async signIn(input: SignInInput): Promise<User> {
    const { error } = await supabase().auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    })
    if (error) {
      const text = error.message.toLowerCase()
      if (text.includes('invalid login')) {
        throw new Error(
          'Неверная почта или пароль. Если вы заводили аккаунт через Google — войдите кнопкой «Продолжить с Google»: пароля у такого аккаунта нет, задать его можно в настройках.',
        )
      }
      if (text.includes('email not confirmed')) {
        throw new Error('Почта ещё не подтверждена — откройте письмо со ссылкой подтверждения')
      }
      throw new Error(error.message)
    }
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Профиль не найден')
    return user
  }

  /** Запомнить роль перед уходом на страницу Google. */
  rememberPendingRole(role: User['role']): void {
    localStorage.setItem(PENDING_ROLE_KEY, role)
  }

  /** Отметить, с какой вкладки уходили в Google: вход или регистрация. */
  rememberAuthMode(mode: 'signin' | 'signup'): void {
    localStorage.setItem(GOOGLE_MODE_KEY, mode)
  }

  async signInWithGoogle(redirectTo?: string): Promise<void> {
    const { error } = await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo || `${window.location.origin}/app` },
    })
    if (error) throw new Error(error.message)
  }

  async signOut(): Promise<void> {
    await supabase().auth.signOut()
  }

  /**
   * Смена роли аккаунта. База разрешает её, только пока человек не состоит
   * ни в одном чужом курсе — иначе ученик мог бы выдать себе права учителя.
   */
  async setRole(role: User['role']): Promise<User> {
    const me = await this.requireUser()
    return unwrap(
      await supabase().from('users').update({ role }).eq('id', me.id).select().single(),
    ) as User
  }

  /** Загрузка фото профиля: файл кладётся в публичный бакет avatars/<user_id>/… */
  async uploadAvatar(file: File): Promise<string> {
    const me = await this.requireUser()
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${me.id}/${Date.now()}.${ext}`
    const { error } = await supabase()
      .storage.from('avatars')
      .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type })
    if (error) throw new Error(error.message)
    const { data } = supabase().storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  }

  /** Задать или сменить пароль текущему аккаунту (в том числе входившему через Google). */
  async setPassword(password: string): Promise<void> {
    const { error } = await supabase().auth.updateUser({ password })
    if (error) throw new Error(error.message)
  }

  async updateProfile(patch: Partial<Pick<User, 'name' | 'avatar'>>): Promise<User> {
    const me = await this.requireUser()
    return unwrap(
      await supabase().from('users').update(patch).eq('id', me.id).select().single(),
    ) as User
  }

  onAuthChange(cb: (user: User | null) => void): () => void {
    const { data } = supabase().auth.onAuthStateChange(async () => {
      cb(await this.getCurrentUser().catch(() => null))
    })
    return () => data.subscription.unsubscribe()
  }

  private async requireUser(): Promise<User> {
    const u = await this.getCurrentUser()
    if (!u) throw new Error('Нужно войти в аккаунт')
    return u
  }

  /* ------------------------------ пространства --------------------------- */

  async listSpaces(): Promise<SpaceView[]> {
    const me = await this.requireUser()
    const memberships = unwrap(
      await supabase().from('space_members').select('space_id, permission').eq('user_id', me.id),
    ) as Array<{ space_id: string; permission: Permission }>
    if (!memberships.length) return []
    const ids = memberships.map((m) => m.space_id)

    const spaces = unwrap(
      await supabase().from('spaces').select('*').in('id', ids).order('created_at'),
    ) as Space[]

    const allMembers = unwrap(
      await supabase()
        .from('space_members')
        .select('space_id, user_id, permission, users(id, name, avatar, role)')
        .in('space_id', ids),
    ) as unknown as Array<{
      space_id: string
      user_id: string
      permission: Permission
      users: { id: string; name: string; avatar: string | null; role: User['role'] } | null
    }>

    return spaces.map((s) => ({
      ...s,
      permission: memberships.find((m) => m.space_id === s.id)?.permission ?? 'view',
      is_owner: s.owner_id === me.id,
      members: allMembers
        .filter((m) => m.space_id === s.id)
        .map((m) => ({
          id: m.user_id,
          name: m.users?.name ?? 'Участник',
          avatar: m.users?.avatar ?? null,
          role: m.users?.role ?? 'student',
          permission: m.permission,
        })),
    }))
  }

  async createSpace(input: CreateSpaceInput): Promise<Space> {
    const me = await this.requireUser()
    const space = unwrap(
      await supabase()
        .from('spaces')
        .insert({
          name: input.name.trim(),
          description: input.description ?? null,
          owner_id: me.id,
          color: input.color ?? colorFromString(input.name),
          invite_code: inviteCode(),
        })
        .select()
        .single(),
    ) as Space
    await supabase()
      .from('space_members')
      .insert({ space_id: space.id, user_id: me.id, permission: 'edit' })
    return space
  }

  async updateSpace(id: string, patch: Partial<Space>): Promise<Space> {
    return unwrap(await supabase().from('spaces').update(patch).eq('id', id).select().single()) as Space
  }

  async deleteSpace(id: string): Promise<void> {
    const { error } = await supabase().from('spaces').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async joinSpaceByCode(code: string): Promise<Space> {
    const me = await this.requireUser()
    // RPC обходит RLS ровно настолько, чтобы найти пространство по коду
    const normalized = code.trim().toUpperCase()
    const { data, error } = await supabase().rpc('join_space_by_code', { p_code: normalized })
    if (error) throw new Error(error.message)
    void me
    if (data) return data as Space

    // Не пространство — пробуем код набора: вступаем во все его пространства
    const bundle = await supabase().rpc('join_bundle_by_code', { p_code: normalized })
    if (bundle.error) throw new Error(bundle.error.message)
    if (!bundle.data) throw new Error('Пространство или набор с таким кодом не найдены')
    return bundle.data as Space
  }

  async setMemberPermission(spaceId: string, userId: string, permission: Permission): Promise<void> {
    const { error } = await supabase()
      .from('space_members')
      .update({ permission })
      .eq('space_id', spaceId)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
  }

  async removeMember(spaceId: string, userId: string): Promise<void> {
    const { error } = await supabase()
      .from('space_members')
      .delete()
      .eq('space_id', spaceId)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
  }

  async regenerateInviteCode(spaceId: string): Promise<string> {
    const code = inviteCode()
    await this.updateSpace(spaceId, { invite_code: code } as Partial<Space>)
    return code
  }

  /* ---------------------------------- папки ------------------------------ */


  /* ------------------------------ обсуждения ----------------------------- */

  async listComments(target: { materialId?: string; assignmentId?: string }): Promise<CommentView[]> {
    let q = supabase().from('comments').select('*').order('created_at')
    q = target.materialId
      ? q.eq('material_id', target.materialId)
      : q.eq('assignment_id', target.assignmentId ?? '')
    const rows = unwrap(await q) as Comment[]
    if (!rows.length) return []
    const authors = unwrap(
      await supabase()
        .from('users')
        .select('id, name, avatar')
        .in('id', [...new Set(rows.map((c) => c.author_id))]),
    ) as Array<Pick<User, 'id' | 'name' | 'avatar'>>
    return rows.map((c) => ({ ...c, author: authors.find((a) => a.id === c.author_id) ?? null }))
  }

  async addComment(input: {
    space_id: string
    material_id?: string
    assignment_id?: string
    body: string
  }): Promise<Comment> {
    const me = await this.requireUser()
    return unwrap(
      await supabase()
        .from('comments')
        .insert({
          space_id: input.space_id,
          material_id: input.material_id ?? null,
          assignment_id: input.assignment_id ?? null,
          author_id: me.id,
          body: input.body.trim(),
        })
        .select()
        .single(),
    ) as Comment
  }

  async deleteComment(id: string): Promise<void> {
    const { error } = await supabase().from('comments').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  /* -------------------------------- тесты -------------------------------- */

  async listQuizzes(spaceId: string): Promise<QuizView[]> {
    const me = await this.requireUser()
    const rows = unwrap(
      await supabase().from('quizzes').select('*').eq('space_id', spaceId).order('created_at', { ascending: false }),
    ) as Quiz[]
    if (!rows.length) return []
    const ids = rows.map((q) => q.id)
    const attempts = unwrap(
      await supabase().from('quiz_attempts').select('*').in('quiz_id', ids),
    ) as QuizAttempt[]
    const questions = unwrap(
      await supabase().from('quiz_questions').select('id, quiz_id, points').in('quiz_id', ids),
    ) as Array<{ id: string; quiz_id: string; points: number }>
    const studentIds = [...new Set(attempts.map((a) => a.student_id))]
    const students = studentIds.length
      ? ((unwrap(
          await supabase().from('users').select('id, name, avatar').in('id', studentIds),
        ) as Array<Pick<User, 'id' | 'name' | 'avatar'>>) ?? [])
      : []
    return rows.map((q) => {
      const mine = attempts
        .filter((a) => a.quiz_id === q.id && a.student_id === me.id)
        .sort((a, b) => b.score - a.score)[0]
      const qq = questions.filter((x) => x.quiz_id === q.id)
      return {
        ...q,
        questions: qq.length,
        points: qq.reduce((sum, x) => sum + x.points, 0),
        myAttempt: mine ?? null,
        attempts: attempts
          .filter((a) => a.quiz_id === q.id)
          .map((a) => ({ ...a, student: students.find((s) => s.id === a.student_id) ?? null })),
      }
    })
  }

  async createQuiz(input: {
    space_id: string
    title: string
    description?: string | null
    due_date?: string | null
    attempts_allowed?: number
  }): Promise<Quiz> {
    const me = await this.requireUser()
    return unwrap(
      await supabase()
        .from('quizzes')
        .insert({
          space_id: input.space_id,
          title: input.title.trim(),
          description: input.description ?? null,
          due_date: input.due_date ?? null,
          attempts_allowed: input.attempts_allowed ?? 1,
          author_id: me.id,
        })
        .select()
        .single(),
    ) as Quiz
  }

  async updateQuiz(id: string, patch: Partial<Quiz>): Promise<Quiz> {
    return unwrap(
      await supabase().from('quizzes').update(patch).eq('id', id).select().single(),
    ) as Quiz
  }

  async deleteQuiz(id: string): Promise<void> {
    const { error } = await supabase().from('quizzes').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async listQuizEditor(quizId: string): Promise<Array<QuizQuestion & { options: QuizOption[] }>> {
    const questions = unwrap(
      await supabase().from('quiz_questions').select('*').eq('quiz_id', quizId).order('position'),
    ) as QuizQuestion[]
    if (!questions.length) return []
    const options = unwrap(
      await supabase()
        .from('quiz_options')
        .select('*')
        .in('question_id', questions.map((q) => q.id))
        .order('position'),
    ) as QuizOption[]
    return questions.map((q) => ({ ...q, options: options.filter((o) => o.question_id === q.id) }))
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
    // проще и надёжнее переписать набор целиком: вопросов в тесте немного
    const { error: delErr } = await supabase().from('quiz_questions').delete().eq('quiz_id', quizId)
    if (delErr) throw new Error(delErr.message)
    for (const [i, q] of questions.entries()) {
      const created = unwrap(
        await supabase()
          .from('quiz_questions')
          .insert({ quiz_id: quizId, position: i, text: q.text.trim(), multiple: q.multiple, points: q.points })
          .select()
          .single(),
      ) as QuizQuestion
      const rows = q.options.map((o, k) => ({
        question_id: created.id,
        position: k,
        text: o.text.trim(),
        is_correct: o.is_correct,
      }))
      if (rows.length) {
        const { error } = await supabase().from('quiz_options').insert(rows)
        if (error) throw new Error(error.message)
      }
    }
  }

  async getQuizForStudent(quizId: string): Promise<QuizForStudent> {
    const { data, error } = await supabase().rpc('get_quiz_for_student', { p_quiz: quizId })
    if (error) throw new Error(error.message)
    return data as QuizForStudent
  }

  async submitQuiz(quizId: string, answers: Record<string, string[]>): Promise<QuizResult> {
    const { data, error } = await supabase().rpc('submit_quiz', { p_quiz: quizId, p_answers: answers })
    if (error) throw new Error(error.message)
    return data as QuizResult
  }

  /* ------------------------------- папки --------------------------------- */
  async listFolders(spaceId: string): Promise<Folder[]> {
    return unwrap(
      await supabase().from('folders').select('*').eq('space_id', spaceId).order('name'),
    ) as Folder[]
  }

  async createFolder(input: CreateFolderInput): Promise<Folder> {
    return unwrap(
      await supabase()
        .from('folders')
        .insert({
          space_id: input.space_id,
          parent_id: input.parent_id ?? null,
          name: input.name.trim(),
          color: input.color ?? colorFromString(input.name),
        })
        .select()
        .single(),
    ) as Folder
  }

  async updateFolder(id: string, patch: Partial<Folder>): Promise<Folder> {
    return unwrap(await supabase().from('folders').update(patch).eq('id', id).select().single()) as Folder
  }

  async deleteFolder(id: string): Promise<void> {
    const { error } = await supabase().from('folders').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  /* -------------------------------- материалы ---------------------------- */

  private async decorate(rows: Material[], meId: string): Promise<MaterialView[]> {
    if (!rows.length) return []
    const ids = rows.map((r) => r.id)

    const [tagLinks, tags, authors, starred, progress] = await Promise.all([
      supabase().from('material_tags').select('material_id, tag_id').in('material_id', ids),
      supabase().from('tags').select('*'),
      supabase()
        .from('users')
        .select('id, name, avatar')
        .in('id', Array.from(new Set(rows.map((r) => r.author_id)))),
      supabase().from('starred').select('material_id').eq('user_id', meId).in('material_id', ids),
      supabase()
        .from('progress')
        .select('material_id, status')
        .eq('user_id', meId)
        .in('material_id', ids),
    ])

    const links = (tagLinks.data ?? []) as Array<{ material_id: string; tag_id: string }>
    const allTags = (tags.data ?? []) as Tag[]
    const authorRows = (authors.data ?? []) as Array<Pick<User, 'id' | 'name' | 'avatar'>>
    const starredIds = new Set(((starred.data ?? []) as Array<{ material_id: string }>).map((s) => s.material_id))
    const progressMap = new Map(
      ((progress.data ?? []) as Array<{ material_id: string; status: ProgressStatus }>).map((p) => [
        p.material_id,
        p.status,
      ]),
    )

    return rows.map((r) => ({
      ...r,
      tags: links
        .filter((l) => l.material_id === r.id)
        .map((l) => allTags.find((t) => t.id === l.tag_id))
        .filter((t): t is Tag => Boolean(t)),
      author: authorRows.find((a) => a.id === r.author_id) ?? null,
      starred: starredIds.has(r.id),
      progress: progressMap.get(r.id) ?? null,
    }))
  }

  async listMaterials(spaceId: string): Promise<MaterialView[]> {
    const me = await this.requireUser()
    const rows = unwrap(
      await supabase()
        .from('materials')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false }),
    ) as Material[]
    return this.decorate(rows, me.id)
  }

  async listAllMaterials(): Promise<MaterialView[]> {
    const me = await this.requireUser()
    const rows = unwrap(
      await supabase().from('materials').select('*').order('created_at', { ascending: false }),
    ) as Material[]
    return this.decorate(rows, me.id)
  }

  async createMaterial(input: CreateMaterialInput): Promise<Material> {
    const me = await this.requireUser()
    const { tagIds, ...rest } = input
    const material = unwrap(
      await supabase()
        .from('materials')
        .insert({
          ...rest,
          color: input.color ?? colorFromString(input.title + input.type),
          author_id: me.id,
        })
        .select()
        .single(),
    ) as Material
    if (tagIds?.length) {
      await supabase()
        .from('material_tags')
        .insert(tagIds.map((tag_id) => ({ material_id: material.id, tag_id })))
    }
    return material
  }

  async updateMaterial(id: string, patch: Partial<Material> & { tagIds?: string[] }): Promise<Material> {
    const { tagIds, ...rest } = patch
    const material = unwrap(
      await supabase()
        .from('materials')
        .update({ ...rest, updated_at: nowIso() })
        .eq('id', id)
        .select()
        .single(),
    ) as Material
    if (tagIds) await this.setMaterialTags(id, tagIds)
    return material
  }

  async deleteMaterial(id: string): Promise<void> {
    const { data } = await supabase().from('materials').select('file_url').eq('id', id).maybeSingle()
    const fileUrl = (data as { file_url: string | null } | null)?.file_url
    const { error } = await supabase().from('materials').delete().eq('id', id)
    if (error) throw new Error(error.message)
    if (fileUrl?.startsWith('storage:')) {
      await supabase().storage.from(BUCKET).remove([fileUrl.slice(8)])
    }
  }

  async uploadFile(
    spaceId: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<UploadResult> {
    // supabase-js не отдаёт гранулярный прогресс, поэтому показываем
    // укрупнённые стадии — UI остаётся честным.
    onProgress?.(8)
    const path = `${spaceId}/${uid()}-${file.name.replace(/[^\w.\-А-Яа-яЁё]/g, '_')}`
    const timer = setInterval(() => onProgress?.(Math.min(85, 8 + Math.random() * 70)), 250)
    try {
      const { error } = await supabase()
        .storage.from(BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
      if (error) throw new Error(error.message)
    } finally {
      clearInterval(timer)
    }
    onProgress?.(100)
    return {
      file_url: `storage:${path}`,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
    }
  }

  async resolveFileUrl(material: { file_url: string | null }): Promise<string | null> {
    const url = material.file_url
    if (!url) return null
    if (!url.startsWith('storage:')) return url
    const path = url.slice(8)
    const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(path, 60 * 60)
    if (error) throw new Error(error.message)
    return data?.signedUrl ?? null
  }

  /* ----------------------------------- теги ------------------------------ */

  async listTags(): Promise<Tag[]> {
    return unwrap(await supabase().from('tags').select('*').order('name')) as Tag[]
  }

  async createTag(input: { name: string; color: Tag['color']; icon: string }): Promise<Tag> {
    return unwrap(await supabase().from('tags').insert(input).select().single()) as Tag
  }

  async deleteTag(id: string): Promise<void> {
    const { error } = await supabase().from('tags').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async setMaterialTags(materialId: string, tagIds: string[]): Promise<void> {
    await supabase().from('material_tags').delete().eq('material_id', materialId)
    if (tagIds.length) {
      const { error } = await supabase()
        .from('material_tags')
        .insert(tagIds.map((tag_id) => ({ material_id: materialId, tag_id })))
      if (error) throw new Error(error.message)
    }
  }

  /* --------------------------- избранное и прогресс ---------------------- */

  async toggleStar(materialId: string): Promise<boolean> {
    const me = await this.requireUser()
    const { data } = await supabase()
      .from('starred')
      .select('material_id')
      .eq('user_id', me.id)
      .eq('material_id', materialId)
      .maybeSingle()
    if (data) {
      await supabase().from('starred').delete().eq('user_id', me.id).eq('material_id', materialId)
      return false
    }
    await supabase().from('starred').insert({ user_id: me.id, material_id: materialId })
    return true
  }

  async setProgress(materialId: string, status: ProgressStatus): Promise<void> {
    const me = await this.requireUser()
    const { data } = await supabase()
      .from('progress')
      .select('status')
      .eq('user_id', me.id)
      .eq('material_id', materialId)
      .maybeSingle()
    if ((data as { status: ProgressStatus } | null)?.status === 'studied' && status === 'viewed') return
    const { error } = await supabase()
      .from('progress')
      .upsert(
        { user_id: me.id, material_id: materialId, status, updated_at: nowIso() },
        { onConflict: 'user_id,material_id' },
      )
    if (error) throw new Error(error.message)
  }

  async listSpaceProgress(spaceId: string) {
    const materials = unwrap(
      await supabase().from('materials').select('id').eq('space_id', spaceId),
    ) as Array<{ id: string }>
    if (!materials.length) return []
    const rows = unwrap(
      await supabase()
        .from('progress')
        .select('user_id, material_id, status, updated_at, users(id, name, avatar)')
        .in(
          'material_id',
          materials.map((m) => m.id),
        ),
    ) as unknown as Array<Progress & { users: Pick<User, 'id' | 'name' | 'avatar'> | null }>
    return rows.map(({ users, ...rest }) => ({ ...rest, user: users }))
  }

  /* --------------------------------- задания ----------------------------- */

  private async decorateAssignments(rows: Assignment[], meId: string): Promise<AssignmentView[]> {
    if (!rows.length) return []
    const ids = rows.map((r) => r.id)
    const attachmentIds = Array.from(new Set(rows.flatMap((r) => r.attachments ?? [])))

    const [subsRes, matsRes] = await Promise.all([
      supabase().from('submissions').select('*, users(id, name, avatar)').in('assignment_id', ids),
      attachmentIds.length
        ? supabase().from('materials').select('*').in('id', attachmentIds)
        : Promise.resolve({ data: [] as Material[], error: null }),
    ])

    const subs = (subsRes.data ?? []) as Array<
      Submission & { users: Pick<User, 'id' | 'name' | 'avatar'> | null }
    >
    const mats = (matsRes.data ?? []) as Material[]

    return rows.map((a) => {
      const mine = subs.filter((s) => s.assignment_id === a.id)
      return {
        ...a,
        attachments: a.attachments ?? [],
        attachedMaterials: mats.filter((m) => (a.attachments ?? []).includes(m.id)),
        mySubmission: mine.find((s) => s.student_id === meId) ?? null,
        submissions: mine.map(({ users, ...rest }) => ({ ...rest, student: users })),
      }
    })
  }

  async listAssignments(spaceId: string): Promise<AssignmentView[]> {
    const me = await this.requireUser()
    const rows = unwrap(
      await supabase().from('assignments').select('*').eq('space_id', spaceId).order('due_date'),
    ) as Assignment[]
    return this.decorateAssignments(rows, me.id)
  }

  async listAllAssignments(): Promise<AssignmentView[]> {
    const me = await this.requireUser()
    const rows = unwrap(await supabase().from('assignments').select('*').order('due_date')) as Assignment[]
    return this.decorateAssignments(rows, me.id)
  }

  async createAssignment(input: CreateAssignmentInput): Promise<Assignment> {
    const me = await this.requireUser()
    return unwrap(
      await supabase()
        .from('assignments')
        .insert({ ...input, attachments: input.attachments ?? [], author_id: me.id })
        .select()
        .single(),
    ) as Assignment
  }

  async updateAssignment(id: string, patch: Partial<Assignment>): Promise<Assignment> {
    return unwrap(
      await supabase().from('assignments').update(patch).eq('id', id).select().single(),
    ) as Assignment
  }

  async deleteAssignment(id: string): Promise<void> {
    const { error } = await supabase().from('assignments').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async submitAssignment(
    assignmentId: string,
    payload: { comment?: string | null; attachments?: string[] },
  ): Promise<Submission> {
    const me = await this.requireUser()
    return unwrap(
      await supabase()
        .from('submissions')
        .upsert(
          {
            assignment_id: assignmentId,
            student_id: me.id,
            status: 'submitted',
            comment: payload.comment ?? null,
            attachments: payload.attachments ?? [],
            submitted_at: nowIso(),
          },
          { onConflict: 'assignment_id,student_id' },
        )
        .select()
        .single(),
    ) as Submission
  }

  async gradeSubmission(submissionId: string, grade: number | null): Promise<Submission> {
    return unwrap(
      await supabase()
        .from('submissions')
        .update({ grade, status: grade === null ? 'submitted' : 'graded' })
        .eq('id', submissionId)
        .select()
        .single(),
    ) as Submission
  }

  /* ------------------------------ личные задачи -------------------------- */

  async listTasks(): Promise<Task[]> {
    const me = await this.requireUser()
    return unwrap(
      await supabase()
        .from('tasks')
        .select('*')
        .eq('user_id', me.id)
        .order('done')
        .order('due_date', { nullsFirst: false }),
    ) as Task[]
  }

  async createTask(input: { title: string; due_date?: string | null; space_id?: string | null }): Promise<Task> {
    const me = await this.requireUser()
    return unwrap(
      await supabase()
        .from('tasks')
        .insert({
          user_id: me.id,
          title: input.title.trim(),
          due_date: input.due_date ?? null,
          space_id: input.space_id ?? null,
        })
        .select()
        .single(),
    ) as Task
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<Task> {
    return unwrap(await supabase().from('tasks').update(patch).eq('id', id).select().single()) as Task
  }

  async deleteTask(id: string): Promise<void> {
    const { error } = await supabase().from('tasks').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  /* -------------------------------- realtime ----------------------------- */

  /** Присутствие: кто прямо сейчас открыл это пространство. */
  joinPresence(
    spaceId: string,
    me: Pick<User, 'id' | 'name' | 'avatar'>,
    onChange: (people: Array<Pick<User, 'id' | 'name' | 'avatar'>>) => void,
  ): () => void {
    const channel = supabase().channel(`space:${spaceId}`, {
      config: { presence: { key: me.id } },
    })
    const collect = () => {
      const state = channel.presenceState() as Record<string, Array<Record<string, unknown>>>
      const people = Object.values(state)
        .map((entries) => entries[0])
        .filter(Boolean)
        .map((e) => ({
          id: String(e.id ?? ''),
          name: String(e.name ?? 'Участник'),
          avatar: (e.avatar as string | null) ?? null,
        }))
      onChange(people)
    }
    channel
      .on('presence', { event: 'sync' }, collect)
      .on('presence', { event: 'join' }, collect)
      .on('presence', { event: 'leave' }, collect)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ id: me.id, name: me.name, avatar: me.avatar })
        }
      })
    return () => {
      void channel.unsubscribe()
    }
  }

  /** Живой обмен текстом конспекта между соавторами. */
  joinNoteChannel(
    materialId: string,
    me: Pick<User, 'id' | 'name'>,
    onRemote: (payload: { html: string; by: string; byName: string }) => void,
  ): { send: (html: string) => void; leave: () => void } {
    const channel = supabase().channel(`note:${materialId}`)
    channel
      .on('broadcast', { event: 'edit' }, ({ payload }) => {
        const p = payload as { html: string; by: string; byName: string }
        if (p.by !== me.id) onRemote(p)
      })
      .subscribe()
    return {
      send: (html: string) => {
        void channel.send({ type: 'broadcast', event: 'edit', payload: { html, by: me.id, byName: me.name } })
      },
      leave: () => {
        void channel.unsubscribe()
      },
    }
  }

  /* ------------------------------ журнал оценок -------------------------- */

  private async spaceStudents(spaceId: string): Promise<GradebookSnapshot['students']> {
    const rows = unwrap(
      await supabase()
        .from('space_members')
        .select('user_id, users(id, name, avatar, role)')
        .eq('space_id', spaceId),
    ) as unknown as Array<{ users: GradebookSnapshot['students'][number] | null }>
    return rows
      .map((r) => r.users)
      .filter((u): u is GradebookSnapshot['students'][number] => !!u)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  async loadGradebook(spaceId: string): Promise<GradebookSnapshot> {
    const [scales, periods, categories, items, attendance, students] = await Promise.all([
      supabase().from('grade_scales').select('*').eq('space_id', spaceId),
      supabase().from('grade_periods').select('*').eq('space_id', spaceId).order('start_date'),
      supabase().from('grade_categories').select('*').eq('space_id', spaceId).order('created_at'),
      supabase().from('grade_items').select('*').eq('space_id', spaceId).order('date'),
      supabase().from('attendance').select('*').eq('space_id', spaceId),
      this.spaceStudents(spaceId),
    ])

    const itemRows = (unwrap(items) as unknown as GradeItem[]) ?? []
    const itemIds = itemRows.map((i) => i.id)
    const grades = itemIds.length
      ? ((unwrap(
          await supabase().from('grades').select('*').in('item_id', itemIds),
        ) as unknown as Grade[]) ?? [])
      : []

    const lessons =
      (unwrap(
        await supabase().from('lessons').select('*').eq('space_id', spaceId).order('date'),
      ) as unknown as Lesson[]) ?? []
    const lessonStatuses =
      (unwrap(
        await supabase().from('lesson_statuses').select('*').eq('space_id', spaceId).order('position'),
      ) as unknown as LessonStatus[]) ?? []
    const lessonPriorities =
      (unwrap(
        await supabase()
          .from('lesson_priorities')
          .select('*')
          .eq('space_id', spaceId)
          .order('rank', { ascending: false }),
      ) as unknown as LessonPriority[]) ?? []

    const criteria =
      (unwrap(
        await supabase()
          .from('grade_criteria')
          .select('*')
          .eq('space_id', spaceId)
          .order('position'),
      ) as unknown as GradeCriterion[]) ?? []
    const criterionIds = criteria.map((c) => c.id)
    const criterionScores = criterionIds.length
      ? ((unwrap(
          await supabase().from('criterion_scores').select('*').in('criterion_id', criterionIds),
        ) as unknown as CriterionScore[]) ?? [])
      : []

    return {
      scales: (unwrap(scales) as unknown as GradeScale[]) ?? [],
      periods: (unwrap(periods) as unknown as GradePeriod[]) ?? [],
      categories: (unwrap(categories) as unknown as GradeCategory[]) ?? [],
      items: itemRows,
      grades,
      criteria,
      criterionScores,
      lessons,
      lessonStatuses,
      lessonPriorities,
      attendance: (unwrap(attendance) as unknown as Attendance[]) ?? [],
      students,
    }
  }

  /** Один заход на пространство за раз: иначе две параллельные загрузки журнала
   *  успевают обе увидеть пустоту и обе засеять справочники. */
  private seeding = new Map<string, Promise<GradebookSnapshot>>()

  async ensureGradebook(spaceId: string): Promise<GradebookSnapshot> {
    const running = this.seeding.get(spaceId)
    if (running) return running
    const job = this.seedGradebook(spaceId).finally(() => this.seeding.delete(spaceId))
    this.seeding.set(spaceId, job)
    return job
  }

  private async seedGradebook(spaceId: string): Promise<GradebookSnapshot> {
    const current = await this.loadGradebook(spaceId)
    const jobs: PromiseLike<unknown>[] = []

    // upsert + ignoreDuplicates: даже если параллельно засеет другая вкладка,
    // второй набор просто не запишется — в базе стоят уникальные индексы.
    if (!current.scales.length) {
      const preset = presetByKey('eight').build()
      jobs.push(
        supabase()
          .from('grade_scales')
          .upsert({ ...preset, space_id: spaceId, is_default: true }, {
            onConflict: 'space_id,name',
            ignoreDuplicates: true,
          })
          .then(() => undefined),
      )
    }
    if (!current.lessonStatuses.length) {
      jobs.push(
        supabase()
          .from('lesson_statuses')
          .upsert(
            DEFAULT_LESSON_STATUSES.map((x, i) => ({ ...x, space_id: spaceId, position: i })),
            { onConflict: 'space_id,name', ignoreDuplicates: true },
          )
          .then(() => undefined),
      )
    }
    if (!current.lessonPriorities.length) {
      jobs.push(
        supabase()
          .from('lesson_priorities')
          .upsert(
            DEFAULT_LESSON_PRIORITIES.map((x, i) => ({ ...x, space_id: spaceId, position: i })),
            { onConflict: 'space_id,name', ignoreDuplicates: true },
          )
          .then(() => undefined),
      )
    }
    if (!current.periods.length) {
      jobs.push(
        supabase()
          .from('grade_periods')
          .upsert(defaultPeriods().map((p) => ({ ...p, space_id: spaceId })), {
            onConflict: 'space_id,name',
            ignoreDuplicates: true,
          })
          .then(() => undefined),
      )
    }
    if (jobs.length) await Promise.all(jobs.map((j) => Promise.resolve(j)))

    // Категории заводим вторым проходом: они ссылаются на уровни важности
    const after = jobs.length ? await this.loadGradebook(spaceId) : current
    if (!after.categories.length) {
      const byName = new Map(after.lessonPriorities.map((p) => [p.name, p.id]))
      const { error } = await supabase()
        .from('grade_categories')
        .upsert(
          DEFAULT_CATEGORIES.map((c, i) => {
            const { priority, ...rest } = c
            return {
              ...rest,
              space_id: spaceId,
              default_priority_id: byName.get(priority) ?? null,
              position: i,
            }
          }),
          { onConflict: 'space_id,name', ignoreDuplicates: true },
        )
      if (error) throw new Error(error.message)
      return this.loadGradebook(spaceId)
    }
    return jobs.length ? after : current
  }

  async createScale(input: Omit<GradeScale, 'id' | 'created_at'>): Promise<GradeScale> {
    if (input.is_default) await this.dropDefaultScale(input.space_id)
    return unwrap(
      await supabase().from('grade_scales').insert(input).select().single(),
    ) as unknown as GradeScale
  }

  private async dropDefaultScale(spaceId: string) {
    await supabase().from('grade_scales').update({ is_default: false }).eq('space_id', spaceId)
  }

  async updateScale(id: string, patch: Partial<GradeScale>): Promise<GradeScale> {
    if (patch.is_default) {
      const { data } = await supabase().from('grade_scales').select('space_id').eq('id', id).single()
      if (data) await this.dropDefaultScale((data as { space_id: string }).space_id)
    }
    return unwrap(
      await supabase().from('grade_scales').update(patch).eq('id', id).select().single(),
    ) as unknown as GradeScale
  }

  async deleteScale(id: string): Promise<void> {
    const { error } = await supabase().from('grade_scales').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async createPeriod(input: Omit<GradePeriod, 'id' | 'created_at'>): Promise<GradePeriod> {
    if (input.is_current) await this.dropCurrentPeriod(input.space_id)
    return unwrap(
      await supabase().from('grade_periods').insert(input).select().single(),
    ) as unknown as GradePeriod
  }

  private async dropCurrentPeriod(spaceId: string) {
    await supabase().from('grade_periods').update({ is_current: false }).eq('space_id', spaceId)
  }

  async updatePeriod(id: string, patch: Partial<GradePeriod>): Promise<GradePeriod> {
    if (patch.is_current) {
      const { data } = await supabase().from('grade_periods').select('space_id').eq('id', id).single()
      if (data) await this.dropCurrentPeriod((data as { space_id: string }).space_id)
    }
    return unwrap(
      await supabase().from('grade_periods').update(patch).eq('id', id).select().single(),
    ) as unknown as GradePeriod
  }

  async deletePeriod(id: string): Promise<void> {
    const { error } = await supabase().from('grade_periods').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async createCategory(input: Omit<GradeCategory, 'id' | 'created_at'>): Promise<GradeCategory> {
    return unwrap(
      await supabase().from('grade_categories').insert(input).select().single(),
    ) as unknown as GradeCategory
  }

  async updateCategory(id: string, patch: Partial<GradeCategory>): Promise<GradeCategory> {
    return unwrap(
      await supabase().from('grade_categories').update(patch).eq('id', id).select().single(),
    ) as unknown as GradeCategory
  }

  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase().from('grade_categories').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async createGradeItem(input: CreateGradeItemInput): Promise<GradeItem> {
    return unwrap(
      await supabase()
        .from('grade_items')
        .insert({
          space_id: input.space_id,
          period_id: input.period_id ?? null,
          category_id: input.category_id ?? null,
          assignment_id: input.assignment_id ?? null,
          title: input.title.trim() || 'Работа',
          date: input.date,
          max_score: input.max_score ?? 5,
          weight: input.weight ?? 1,
          scale_id: input.scale_id ?? null,
        })
        .select()
        .single(),
    ) as unknown as GradeItem
  }

  async updateGradeItem(id: string, patch: Partial<GradeItem>): Promise<GradeItem> {
    return unwrap(
      await supabase().from('grade_items').update(patch).eq('id', id).select().single(),
    ) as unknown as GradeItem
  }

  async deleteGradeItem(id: string): Promise<void> {
    const { error } = await supabase().from('grade_items').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  /* ---------------------------- критерии работы -------------------------- */

  async createCriterion(input: Omit<GradeCriterion, 'id' | 'created_at'>): Promise<GradeCriterion> {
    return unwrap(
      await supabase().from('grade_criteria').insert(input).select().single(),
    ) as unknown as GradeCriterion
  }

  async updateCriterion(id: string, patch: Partial<GradeCriterion>): Promise<GradeCriterion> {
    return unwrap(
      await supabase().from('grade_criteria').update(patch).eq('id', id).select().single(),
    ) as unknown as GradeCriterion
  }

  async deleteCriterion(id: string): Promise<void> {
    const { error } = await supabase().from('grade_criteria').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async setCriterionScores(
    itemId: string,
    studentId: string,
    values: Array<Pick<CriterionScore, 'criterion_id' | 'score'>>,
  ): Promise<Grade> {
    if (values.length) {
      const { error } = await supabase()
        .from('criterion_scores')
        .upsert(
          values.map((v) => ({
            criterion_id: v.criterion_id,
            student_id: studentId,
            score: v.score,
            updated_at: nowIso(),
          })),
          { onConflict: 'criterion_id,student_id' },
        )
      if (error) throw new Error(error.message)
    }
    const filled = values.filter((v) => v.score !== null)
    const total = filled.length ? filled.reduce((sum, v) => sum + (v.score as number), 0) : null
    return this.setGrade(itemId, studentId, { score: total, flag: 'none' })
  }

  async setGrade(itemId: string, studentId: string, input: GradeInput): Promise<Grade> {
    const me = await this.requireUser()
    const payload: Record<string, unknown> = {
      item_id: itemId,
      student_id: studentId,
      graded_by: me.id,
      updated_at: nowIso(),
    }
    if (input.score !== undefined) payload.score = input.score
    if (input.flag !== undefined) payload.flag = input.flag
    if (input.comment !== undefined) payload.comment = input.comment

    return unwrap(
      await supabase()
        .from('grades')
        .upsert(payload, { onConflict: 'item_id,student_id' })
        .select()
        .single(),
    ) as unknown as Grade
  }

  async clearGrade(itemId: string, studentId: string): Promise<void> {
    const { error } = await supabase()
      .from('grades')
      .delete()
      .eq('item_id', itemId)
      .eq('student_id', studentId)
    if (error) throw new Error(error.message)
  }

  /* ------------------------------ уроки ---------------------------------- */

  async createLesson(input: CreateLessonInput): Promise<Lesson> {
    // Статус и важность по умолчанию берём из справочников пространства
    const [statuses, priorities, category] = await Promise.all([
      supabase().from('lesson_statuses').select('id,is_default').eq('space_id', input.space_id),
      supabase().from('lesson_priorities').select('id,is_default').eq('space_id', input.space_id),
      input.category_id
        ? supabase()
            .from('grade_categories')
            .select('default_priority_id')
            .eq('id', input.category_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const defStatus =
      (statuses.data as Array<{ id: string; is_default: boolean }> | null)?.find((x) => x.is_default)
        ?.id ?? null
    const defPriority =
      (priorities.data as Array<{ id: string; is_default: boolean }> | null)?.find(
        (x) => x.is_default,
      )?.id ?? null
    const catPriority =
      (category.data as { default_priority_id: string | null } | null)?.default_priority_id ?? null

    return unwrap(
      await supabase()
        .from('lessons')
        .insert({
          space_id: input.space_id,
          period_id: input.period_id ?? null,
          category_id: input.category_id ?? null,
          status_id: input.status_id ?? defStatus,
          priority_id: input.priority_id ?? catPriority ?? defPriority,
          title: input.title.trim() || 'Занятие',
          topic: input.topic ?? null,
          date: input.date,
          starts_at: input.starts_at ?? null,
          duration_min: input.duration_min ?? null,
          homework: input.homework ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single(),
    ) as unknown as Lesson
  }

  async updateLesson(id: string, patch: Partial<Lesson>): Promise<Lesson> {
    return unwrap(
      await supabase().from('lessons').update(patch).eq('id', id).select().single(),
    ) as unknown as Lesson
  }

  async deleteLesson(id: string): Promise<void> {
    const { error } = await supabase().from('lessons').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  /* --------------------- справочники занятий ----------------------------- */

  private async dropDefault(table: string, spaceId: string, column: string) {
    await supabase().from(table).update({ [column]: false }).eq('space_id', spaceId)
  }

  async createLessonStatus(input: Omit<LessonStatus, 'id' | 'created_at'>): Promise<LessonStatus> {
    if (input.is_default) await this.dropDefault('lesson_statuses', input.space_id, 'is_default')
    return unwrap(
      await supabase().from('lesson_statuses').insert(input).select().single(),
    ) as unknown as LessonStatus
  }

  async updateLessonStatus(id: string, patch: Partial<LessonStatus>): Promise<LessonStatus> {
    if (patch.is_default) {
      const { data } = await supabase().from('lesson_statuses').select('space_id').eq('id', id).single()
      if (data) await this.dropDefault('lesson_statuses', (data as { space_id: string }).space_id, 'is_default')
    }
    return unwrap(
      await supabase().from('lesson_statuses').update(patch).eq('id', id).select().single(),
    ) as unknown as LessonStatus
  }

  async deleteLessonStatus(id: string): Promise<void> {
    const { error } = await supabase().from('lesson_statuses').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async createLessonPriority(
    input: Omit<LessonPriority, 'id' | 'created_at'>,
  ): Promise<LessonPriority> {
    if (input.is_default) await this.dropDefault('lesson_priorities', input.space_id, 'is_default')
    return unwrap(
      await supabase().from('lesson_priorities').insert(input).select().single(),
    ) as unknown as LessonPriority
  }

  async updateLessonPriority(id: string, patch: Partial<LessonPriority>): Promise<LessonPriority> {
    if (patch.is_default) {
      const { data } = await supabase()
        .from('lesson_priorities')
        .select('space_id')
        .eq('id', id)
        .single()
      if (data)
        await this.dropDefault('lesson_priorities', (data as { space_id: string }).space_id, 'is_default')
    }
    return unwrap(
      await supabase().from('lesson_priorities').update(patch).eq('id', id).select().single(),
    ) as unknown as LessonPriority
  }

  async deleteLessonPriority(id: string): Promise<void> {
    const { error } = await supabase().from('lesson_priorities').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  /* ------------------- наборы пространств (один код) --------------------- */

  async listBundles(): Promise<SpaceBundleView[]> {
    const me = await this.requireUser()
    const rows = unwrap(
      await supabase()
        .from('space_bundles')
        .select('*, bundle_spaces(space_id, spaces(id, name, color, owner_id))')
        .order('created_at'),
    ) as unknown as Array<
      SpaceBundle & {
        bundle_spaces: Array<{
          space_id: string
          spaces: { id: string; name: string; color: Space['color']; owner_id: string } | null
        }>
      }
    >
    return rows.map((b) => ({
      ...b,
      is_owner: b.owner_id === me.id,
      spaces: (b.bundle_spaces ?? [])
        .map((bs) => bs.spaces)
        .filter((sp): sp is { id: string; name: string; color: Space['color']; owner_id: string } => !!sp)
        .map((sp) => ({ ...sp, is_mine: sp.owner_id === me.id })),
    }))
  }

  async createBundle(input: {
    name: string
    description?: string | null
    permission?: Permission
  }): Promise<SpaceBundle> {
    const me = await this.requireUser()
    return unwrap(
      await supabase()
        .from('space_bundles')
        .insert({
          name: input.name.trim() || 'Набор пространств',
          description: input.description ?? null,
          permission: input.permission ?? 'view',
          owner_id: me.id,
          code: inviteCode(),
        })
        .select()
        .single(),
    ) as unknown as SpaceBundle
  }

  async updateBundle(id: string, patch: Partial<SpaceBundle>): Promise<SpaceBundle> {
    return unwrap(
      await supabase().from('space_bundles').update(patch).eq('id', id).select().single(),
    ) as unknown as SpaceBundle
  }

  async deleteBundle(id: string): Promise<void> {
    const { error } = await supabase().from('space_bundles').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async regenerateBundleCode(id: string): Promise<string> {
    const code = inviteCode()
    const { error } = await supabase().from('space_bundles').update({ code }).eq('id', id)
    if (error) throw new Error(error.message)
    return code
  }

  async addSpaceToBundle(bundleId: string, spaceId: string): Promise<void> {
    const me = await this.requireUser()
    // Право добавить пространство проверяет политика: нужен доступ на правку
    const { error } = await supabase()
      .from('bundle_spaces')
      .insert({ bundle_id: bundleId, space_id: spaceId, added_by: me.id })
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message)
  }

  async removeSpaceFromBundle(bundleId: string, spaceId: string): Promise<void> {
    const { error } = await supabase()
      .from('bundle_spaces')
      .delete()
      .eq('bundle_id', bundleId)
      .eq('space_id', spaceId)
    if (error) throw new Error(error.message)
  }

  async attachSpaceToBundleByCode(code: string, spaceId: string): Promise<SpaceBundle> {
    const { data, error } = await supabase().rpc('attach_space_to_bundle', {
      p_code: code.trim().toUpperCase(),
      p_space: spaceId,
    })
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Набор с таким кодом не найден')
    return data as SpaceBundle
  }

  async setAttendance(
    spaceId: string,
    studentId: string,
    date: string,
    status: AttendanceStatus,
    note?: string | null,
  ): Promise<Attendance> {
    return unwrap(
      await supabase()
        .from('attendance')
        .upsert(
          { space_id: spaceId, student_id: studentId, date, status, note: note ?? null },
          { onConflict: 'space_id,student_id,date' },
        )
        .select()
        .single(),
    ) as unknown as Attendance
  }

  async clearAttendance(spaceId: string, studentId: string, date: string): Promise<void> {
    const { error } = await supabase()
      .from('attendance')
      .delete()
      .eq('space_id', spaceId)
      .eq('student_id', studentId)
      .eq('date', date)
    if (error) throw new Error(error.message)
  }


  /* =======================================================================
     Школа
     ===================================================================== */

  async listSchools(): Promise<School[]> {
    const { data, error } = await supabase().from('schools').select('*').order('created_at')
    if (error) throw new Error(humanError(error))
    return (data ?? []) as School[]
  }

  async createSchool(name: string): Promise<School> {
    const me = await this.requireUser()
    const school = unwrap(
      await supabase()
        .from('schools')
        .insert({ name: name.trim(), code: inviteCode(), owner_id: me.id })
        .select()
        .single(),
    ) as unknown as School
    // создатель сразу становится администратором школы
    await supabase().from('school_people').insert({
      school_id: school.id,
      role: 'admin',
      last_name: me.name,
      first_name: '',
      user_id: me.id,
    })
    this.listeners.forEach((l) => l({ table: 'school' }))
    return school
  }

  async updateSchool(id: string, patch: Partial<Pick<School, 'name' | 'code'>>): Promise<School> {
    const row = unwrap(
      await supabase().from('schools').update(patch).eq('id', id).select().single(),
    ) as unknown as School
    this.listeners.forEach((l) => l({ table: 'school' }))
    return row
  }

  async deleteSchool(id: string): Promise<void> {
    const { error } = await supabase().from('schools').delete().eq('id', id)
    if (error) throw new Error(humanError(error))
    this.listeners.forEach((l) => l({ table: 'school' }))
  }

  async loadSchool(schoolId: string): Promise<SchoolSnapshot> {
    const me = await this.requireUser()
    const [school, parallels, classes, people, subjects, subjectClasses, types, groups, members, assignments] =
      await Promise.all([
        supabase().from('schools').select('*').eq('id', schoolId).single(),
        supabase().from('school_parallels').select('*').eq('school_id', schoolId).order('position'),
        supabase().from('school_classes').select('*').eq('school_id', schoolId).order('position'),
        supabase().from('school_people').select('*').eq('school_id', schoolId).order('last_name'),
        supabase().from('school_subjects').select('*').eq('school_id', schoolId).order('position'),
        supabase().from('subject_classes').select('*'),
        supabase().from('subject_assessment_types').select('*').order('position'),
        supabase().from('school_groups').select('*').eq('school_id', schoolId).order('name'),
        supabase().from('group_members').select('*'),
        supabase().from('teaching_assignments').select('*').eq('school_id', schoolId),
      ])

    if (school.error) throw new Error(humanError(school.error))
    const s = school.data as unknown as School
    const peopleRows = (people.data ?? []) as unknown as SchoolPerson[]
    const subjectRows = (subjects.data ?? []) as unknown as SchoolSubject[]
    const groupRows = (groups.data ?? []) as unknown as SchoolGroup[]

    const linkRows = (subjectClasses.data ?? []) as Array<{ subject_id: string; class_id: string }>
    const typeRows = (types.data ?? []) as unknown as SubjectAssessmentType[]
    const memberRows = (members.data ?? []) as Array<{ group_id: string; person_id: string }>

    const mine = peopleRows.find((p) => p.user_id === me.id)
    const role: SchoolRole = s.owner_id === me.id ? 'admin' : (mine?.role ?? 'student')

    return {
      school: s,
      role,
      parallels: (parallels.data ?? []) as unknown as SchoolParallel[],
      classes: (classes.data ?? []) as unknown as SchoolClass[],
      people: peopleRows,
      subjects: subjectRows.map((sub) => ({
        ...sub,
        class_ids: linkRows.filter((l) => l.subject_id === sub.id).map((l) => l.class_id),
        assessment_types: typeRows.filter((t) => t.subject_id === sub.id),
      })),
      groups: groupRows.map((g) => ({
        ...g,
        member_ids: memberRows.filter((m) => m.group_id === g.id).map((m) => m.person_id),
      })),
      assignments: (assignments.data ?? []) as unknown as TeachingAssignment[],
    }
  }

  /* ------------------------- параллели и классы ------------------------- */

  async createParallel(schoolId: string, name: string): Promise<SchoolParallel> {
    const row = unwrap(
      await supabase()
        .from('school_parallels')
        .insert({ school_id: schoolId, name: name.trim() })
        .select()
        .single(),
    ) as unknown as SchoolParallel
    this.listeners.forEach((l) => l({ table: 'school' }))
    return row
  }

  async updateParallel(
    id: string,
    patch: Partial<Pick<SchoolParallel, 'name' | 'position'>>,
  ): Promise<SchoolParallel> {
    const row = unwrap(
      await supabase().from('school_parallels').update(patch).eq('id', id).select().single(),
    ) as unknown as SchoolParallel
    this.listeners.forEach((l) => l({ table: 'school' }))
    return row
  }

  async deleteParallel(id: string): Promise<void> {
    const { error } = await supabase().from('school_parallels').delete().eq('id', id)
    if (error) throw new Error(humanError(error))
    this.listeners.forEach((l) => l({ table: 'school' }))
  }

  async createClass(schoolId: string, parallelId: string, name: string): Promise<SchoolClass> {
    const row = unwrap(
      await supabase()
        .from('school_classes')
        .insert({ school_id: schoolId, parallel_id: parallelId, name: name.trim() })
        .select()
        .single(),
    ) as unknown as SchoolClass
    this.listeners.forEach((l) => l({ table: 'school' }))
    return row
  }

  async updateClass(
    id: string,
    patch: Partial<Pick<SchoolClass, 'name' | 'parallel_id' | 'position'>>,
  ): Promise<SchoolClass> {
    const row = unwrap(
      await supabase().from('school_classes').update(patch).eq('id', id).select().single(),
    ) as unknown as SchoolClass
    this.listeners.forEach((l) => l({ table: 'school' }))
    return row
  }

  async deleteClass(id: string): Promise<void> {
    const { error } = await supabase().from('school_classes').delete().eq('id', id)
    if (error) throw new Error(humanError(error))
    this.listeners.forEach((l) => l({ table: 'school' }))
  }

  /* ------------------------------ люди ---------------------------------- */

  async createPerson(input: CreatePersonInput): Promise<SchoolPerson> {
    const [row] = await this.createPeople([input])
    return row
  }

  async createPeople(inputs: CreatePersonInput[]): Promise<SchoolPerson[]> {
    if (!inputs.length) return []
    const rows = unwrap(
      await supabase()
        .from('school_people')
        .insert(
          inputs.map((i) => ({
            school_id: i.school_id,
            role: i.role,
            last_name: i.last_name.trim(),
            first_name: i.first_name.trim(),
            middle_name: i.middle_name ?? null,
            class_id: i.class_id ?? null,
            login: i.login ?? null,
            note: i.note ?? null,
          })),
        )
        .select(),
    ) as unknown as SchoolPerson[]
    this.listeners.forEach((l) => l({ table: 'school' }))
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
    const row = unwrap(
      await supabase().from('school_people').update(patch).eq('id', id).select().single(),
    ) as unknown as SchoolPerson
    this.listeners.forEach((l) => l({ table: 'school' }))
    return row
  }

  async deletePerson(id: string): Promise<void> {
    const { error } = await supabase().from('school_people').delete().eq('id', id)
    if (error) throw new Error(humanError(error))
    this.listeners.forEach((l) => l({ table: 'school' }))
  }

  /* ---------------------------- аккаунты -------------------------------- */

  private async callAccounts(
    action: 'create' | 'set_password',
    schoolId: string,
    people: Array<Record<string, unknown>>,
  ): Promise<AccountResult[]> {
    const out: AccountResult[] = []
    // серверная функция принимает не больше 200 человек за раз
    for (let i = 0; i < people.length; i += 200) {
      const { data, error } = await supabase().functions.invoke('school-accounts', {
        body: { action, school_id: schoolId, people: people.slice(i, i + 200) },
      })
      if (error) {
        throw new Error(
          'Не удалось обратиться к серверной функции school-accounts. ' +
            'Проверьте, что она развёрнута в проекте Supabase. Ответ: ' +
            error.message,
        )
      }
      const payload = data as { results?: AccountResult[]; error?: string }
      if (payload?.error) throw new Error(payload.error)
      out.push(...(payload?.results ?? []))
    }
    this.listeners.forEach((l) => l({ table: 'school' }))
    return out
  }

  async createAccounts(
    schoolId: string,
    people: Array<{ person_id: string; login: string; password: string }>,
  ): Promise<AccountResult[]> {
    return this.callAccounts('create', schoolId, people)
  }

  async setAccountPassword(
    schoolId: string,
    people: Array<{ person_id: string; password: string }>,
  ): Promise<AccountResult[]> {
    return this.callAccounts('set_password', schoolId, people)
  }

  /* ---------------------------- предметы -------------------------------- */

  private async subjectView(id: string): Promise<SubjectView> {
    const [subject, links, types] = await Promise.all([
      supabase().from('school_subjects').select('*').eq('id', id).single(),
      supabase().from('subject_classes').select('class_id').eq('subject_id', id),
      supabase().from('subject_assessment_types').select('*').eq('subject_id', id).order('position'),
    ])
    if (subject.error) throw new Error(humanError(subject.error))
    return {
      ...(subject.data as unknown as SchoolSubject),
      class_ids: ((links.data ?? []) as Array<{ class_id: string }>).map((l) => l.class_id),
      assessment_types: (types.data ?? []) as unknown as SubjectAssessmentType[],
    }
  }

  async createSubject(input: CreateSubjectInput): Promise<SubjectView> {
    const subject = unwrap(
      await supabase()
        .from('school_subjects')
        .insert({
          school_id: input.school_id,
          name: input.name.trim(),
          code: input.code ?? null,
          color: input.color ?? colorFromString(input.name),
        })
        .select()
        .single(),
    ) as unknown as SchoolSubject
    if (input.class_ids?.length) {
      await supabase()
        .from('subject_classes')
        .insert(input.class_ids.map((c) => ({ subject_id: subject.id, class_id: c })))
    }
    this.listeners.forEach((l) => l({ table: 'school' }))
    return this.subjectView(subject.id)
  }

  async updateSubject(
    id: string,
    patch: Partial<Pick<SchoolSubject, 'name' | 'code' | 'color' | 'position'>> & { class_ids?: string[] },
  ): Promise<SubjectView> {
    const { class_ids, ...rest } = patch
    if (Object.keys(rest).length) {
      const { error } = await supabase().from('school_subjects').update(rest).eq('id', id)
      if (error) throw new Error(humanError(error))
    }
    if (class_ids) {
      await supabase().from('subject_classes').delete().eq('subject_id', id)
      if (class_ids.length) {
        await supabase()
          .from('subject_classes')
          .insert(class_ids.map((c) => ({ subject_id: id, class_id: c })))
      }
    }
    this.listeners.forEach((l) => l({ table: 'school' }))
    return this.subjectView(id)
  }

  async deleteSubject(id: string): Promise<void> {
    const { error } = await supabase().from('school_subjects').delete().eq('id', id)
    if (error) throw new Error(humanError(error))
    this.listeners.forEach((l) => l({ table: 'school' }))
  }

  async addAssessmentType(
    subjectId: string,
    input: Omit<SubjectAssessmentType, 'id' | 'subject_id' | 'created_at'>,
  ): Promise<SubjectAssessmentType> {
    const row = unwrap(
      await supabase()
        .from('subject_assessment_types')
        .insert({ ...input, subject_id: subjectId })
        .select()
        .single(),
    ) as unknown as SubjectAssessmentType
    this.listeners.forEach((l) => l({ table: 'school' }))
    return row
  }

  async updateAssessmentType(
    id: string,
    patch: Partial<Omit<SubjectAssessmentType, 'id' | 'subject_id' | 'created_at'>>,
  ): Promise<SubjectAssessmentType> {
    const row = unwrap(
      await supabase().from('subject_assessment_types').update(patch).eq('id', id).select().single(),
    ) as unknown as SubjectAssessmentType
    this.listeners.forEach((l) => l({ table: 'school' }))
    return row
  }

  async deleteAssessmentType(id: string): Promise<void> {
    const { error } = await supabase().from('subject_assessment_types').delete().eq('id', id)
    if (error) throw new Error(humanError(error))
    this.listeners.forEach((l) => l({ table: 'school' }))
  }

  /* ----------------------------- группы --------------------------------- */

  private async groupView(id: string): Promise<GroupView> {
    const [group, members] = await Promise.all([
      supabase().from('school_groups').select('*').eq('id', id).single(),
      supabase().from('group_members').select('person_id').eq('group_id', id),
    ])
    if (group.error) throw new Error(humanError(group.error))
    return {
      ...(group.data as unknown as SchoolGroup),
      member_ids: ((members.data ?? []) as Array<{ person_id: string }>).map((m) => m.person_id),
    }
  }

  async createGroup(input: CreateGroupInput): Promise<GroupView> {
    const group = unwrap(
      await supabase()
        .from('school_groups')
        .insert({
          school_id: input.school_id,
          name: input.name.trim(),
          kind: input.kind,
          parallel_id: input.parallel_id ?? null,
          class_id: input.class_id ?? null,
        })
        .select()
        .single(),
    ) as unknown as SchoolGroup
    if (input.member_ids?.length) {
      await supabase()
        .from('group_members')
        .insert(input.member_ids.map((p) => ({ group_id: group.id, person_id: p })))
    }
    this.listeners.forEach((l) => l({ table: 'school' }))
    return this.groupView(group.id)
  }

  async updateGroup(
    id: string,
    patch: Partial<Pick<SchoolGroup, 'name' | 'parallel_id' | 'class_id'>> & { member_ids?: string[] },
  ): Promise<GroupView> {
    const { member_ids, ...rest } = patch
    if (Object.keys(rest).length) {
      const { error } = await supabase().from('school_groups').update(rest).eq('id', id)
      if (error) throw new Error(humanError(error))
    }
    if (member_ids) {
      await supabase().from('group_members').delete().eq('group_id', id)
      if (member_ids.length) {
        await supabase()
          .from('group_members')
          .insert(member_ids.map((p) => ({ group_id: id, person_id: p })))
      }
    }
    this.listeners.forEach((l) => l({ table: 'school' }))
    return this.groupView(id)
  }

  async deleteGroup(id: string): Promise<void> {
    const { error } = await supabase().from('school_groups').delete().eq('id', id)
    if (error) throw new Error(humanError(error))
    this.listeners.forEach((l) => l({ table: 'school' }))
  }

  /* --------------------------- преподавание ----------------------------- */

  async createTeaching(input: {
    school_id: string
    subject_id: string
    group_id: string
    teacher_id: string | null
  }): Promise<TeachingAssignment> {
    const me = await this.requireUser()
    const subject = await this.subjectView(input.subject_id)
    const group = await this.groupView(input.group_id)

    // пространство-журнал: у каждого учителя своё на каждый предмет
    const space = unwrap(
      await supabase()
        .from('spaces')
        .insert({
          name: `${subject.name} · ${group.name}`,
          description: 'Курс собран из школы: предмет, группа и учитель',
          owner_id: me.id,
          color: subject.color,
          invite_code: inviteCode(),
          school_id: input.school_id,
          subject_id: subject.id,
        })
        .select()
        .single(),
    ) as unknown as Space

    // участники: администратор, учитель и ученики группы
    const { data: peopleRows } = await supabase()
      .from('school_people')
      .select('id, user_id, role')
      .eq('school_id', input.school_id)
    const people = (peopleRows ?? []) as Array<{ id: string; user_id: string | null; role: SchoolRole }>

    const members: Array<{ space_id: string; user_id: string; permission: Permission }> = [
      { space_id: space.id, user_id: me.id, permission: 'edit' },
    ]
    const teacher = people.find((p) => p.id === input.teacher_id)
    if (teacher?.user_id && teacher.user_id !== me.id) {
      members.push({ space_id: space.id, user_id: teacher.user_id, permission: 'edit' })
    }
    for (const personId of group.member_ids) {
      const person = people.find((p) => p.id === personId)
      if (person?.user_id && !members.some((m) => m.user_id === person.user_id)) {
        members.push({ space_id: space.id, user_id: person.user_id, permission: 'view' })
      }
    }
    await supabase().from('space_members').upsert(members, { onConflict: 'space_id,user_id' })

    // журнал: типы работ берём из предмета, если они там заданы
    await this.ensureGradebook(space.id)
    if (subject.assessment_types.length) {
      await supabase().from('grade_categories').delete().eq('space_id', space.id)
      await supabase().from('grade_categories').insert(
        subject.assessment_types.map((t, i) => ({
          space_id: space.id,
          name: t.name,
          code: t.code,
          weight: t.weight,
          color: t.color,
          counts_toward_grade: t.counts_toward_grade,
          position: i,
        })),
      )
    }

    const row = unwrap(
      await supabase()
        .from('teaching_assignments')
        .insert({
          school_id: input.school_id,
          subject_id: input.subject_id,
          group_id: input.group_id,
          teacher_id: input.teacher_id,
          space_id: space.id,
        })
        .select()
        .single(),
    ) as unknown as TeachingAssignment

    this.listeners.forEach((l) => l({ table: 'school' }))
    this.listeners.forEach((l) => l({ table: 'spaces' }))
    return row
  }

  async deleteTeaching(id: string): Promise<void> {
    const { error } = await supabase().from('teaching_assignments').delete().eq('id', id)
    if (error) throw new Error(humanError(error))
    this.listeners.forEach((l) => l({ table: 'school' }))
  }

  /** Вход по школьному аккаунту: код школы + логин + выданный пароль */
  async signInToSchool(input: SchoolSignInInput): Promise<User> {
    const code = input.code.trim()
    const login = input.login.trim()
    if (!code || !login) throw new Error('Укажите код школы и логин')

    // сначала спрашиваем почту у базы — так работают и логины,
    // заведённые до появления строгой нормализации
    let email: string | null = null
    const { data } = await supabase().rpc('school_login_email', { p_code: code, p_login: login })
    if (typeof data === 'string' && data) email = data
    if (!email) email = schoolLoginEmail(login, code)

    const { error } = await supabase().auth.signInWithPassword({ email, password: input.password })
    if (error) {
      throw new Error('Неверный код школы, логин или пароль')
    }
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Профиль не найден')
    return user
  }

  subscribe(cb: (e: ChangeEvent) => void): () => void {
    this.listeners.add(cb)
    if (!this.realtimeReady) {
      this.realtimeReady = true
      const tables: ChangeEvent['table'][] = [
        'materials',
        'folders',
        'assignments',
        'submissions',
        'tasks',
        'spaces',
        'tags',
        'progress',
        'starred',
        'comments',
        'quizzes',
        'quiz_attempts',
      ]
      const gradebookTables = [
        'grade_scales',
        'grade_periods',
        'grade_categories',
        'grade_items',
        'grades',
        'grade_criteria',
        'criterion_scores',
        'attendance',
      ]
      const channel = supabase().channel('cornflow-changes')
      gradebookTables.forEach((table) => {
        channel.on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any,
          { event: '*', schema: 'public', table },
          (payload: { new?: { space_id?: string }; old?: { space_id?: string } }) => {
            const spaceId = payload.new?.space_id ?? payload.old?.space_id ?? null
            this.listeners.forEach((l) => l({ table: 'gradebook', spaceId }))
          },
        )
      })
      tables.forEach((table) => {
        channel.on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any,
          { event: '*', schema: 'public', table },
          (payload: { new?: { space_id?: string }; old?: { space_id?: string } }) => {
            const spaceId = payload.new?.space_id ?? payload.old?.space_id ?? null
            this.listeners.forEach((l) => l({ table, spaceId }))
          },
        )
      })
      channel.subscribe()
    }
    return () => this.listeners.delete(cb)
  }
}
