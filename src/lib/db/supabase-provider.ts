import type {
  Assignment,
  AssignmentView,
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
} from '../types'
import { colorFromString, inviteCode, nowIso, uid } from '../utils'
import { BUCKET, supabase } from '../supabase'
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

const PENDING_ROLE_KEY = 'cornflow.pendingRole'
const GOOGLE_MODE_KEY = 'cornflow.googleMode'

/* ---------------------------------------------------------------------------
   Реализация поверх Supabase: auth + postgres + storage + realtime.
   Схема таблиц — supabase/migrations/0001_init.sql (там же политики RLS).
   Включается автоматически, как только в .env заданы
   VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.
--------------------------------------------------------------------------- */

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
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
    const { data, error } = await supabase().rpc('join_space_by_code', {
      p_code: code.trim().toUpperCase(),
    })
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Пространство с таким кодом не найдено')
    void me
    return data as Space
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
      const channel = supabase().channel('cornflow-changes')
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
