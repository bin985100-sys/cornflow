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
} from '../types'
import {
  colorFromString,
  formatBytes,
  inviteCode,
  nowIso,
  resolveMime,
  safeFileKey,
  uid,
} from '../utils'
import { DEFAULT_CATEGORIES, defaultPeriods, presetByKey } from '../grading'
import { BUCKET, supabase } from '../supabase'
import type {
  ChangeEvent,
  CreateAssignmentInput,
  CreateFolderInput,
  CreateMaterialInput,
  CreateGradeItemInput,
  CreateSpaceInput,
  DataProvider,
  GradeInput,
  SignInInput,
  SignUpInput,
  UploadResult,
} from './provider'

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
    if (p) return p
    // Профиль ещё не создан (например, вход через Google) — создаём на лету.
    const meta = data.user.user_metadata ?? {}
    const created = unwrap(
      await supabase()
        .from('users')
        .insert({
          id: data.user.id,
          email: data.user.email,
          name: (meta.name as string) || data.user.email?.split('@')[0] || 'Пользователь',
          role: (meta.role as User['role']) || 'student',
          avatar: (meta.avatar_url as string) ?? null,
        })
        .select()
        .single(),
    )
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
    if (error) throw new Error(error.message)
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
    if (error) throw new Error(error.message)
    const user = await this.getCurrentUser()
    if (!user) throw new Error('Профиль не найден')
    return user
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

  async updateProfile(patch: Partial<Pick<User, 'name' | 'avatar' | 'role'>>): Promise<User> {
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
    const mime = resolveMime(file)
    // Ключ только из латиницы: кириллицу в именах объектов ломают прокси и CDN
    const path = `${spaceId}/${uid()}-${safeFileKey(file.name)}`
    const timer = setInterval(() => onProgress?.(Math.min(85, 8 + Math.random() * 70)), 250)
    try {
      const { error } = await supabase()
        .storage.from(BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: mime })
      if (error) {
        if (/exceeded the maximum allowed size|payload too large|413/i.test(error.message)) {
          throw new Error(
            `Файл «${file.name}» (${formatBytes(file.size)}) больше лимита хранилища. ` +
              'Увеличьте лимит в Supabase → Storage → Settings или загрузите файл меньшего размера.',
          )
        }
        throw new Error(`Не удалось загрузить «${file.name}»: ${error.message}`)
      }
    } finally {
      clearInterval(timer)
    }
    onProgress?.(100)
    return {
      file_url: `storage:${path}`,
      file_name: file.name,
      file_size: file.size,
      mime_type: mime,
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
      attendance: (unwrap(attendance) as unknown as Attendance[]) ?? [],
      students,
    }
  }

  async ensureGradebook(spaceId: string): Promise<GradebookSnapshot> {
    const current = await this.loadGradebook(spaceId)
    const jobs: PromiseLike<unknown>[] = []

    if (!current.scales.length) {
      const preset = presetByKey('eight').build()
      jobs.push(
        supabase()
          .from('grade_scales')
          .insert({ ...preset, space_id: spaceId, is_default: true })
          .then(() => undefined),
      )
    }
    if (!current.categories.length) {
      jobs.push(
        supabase()
          .from('grade_categories')
          .insert(DEFAULT_CATEGORIES.map((c) => ({ ...c, space_id: spaceId })))
          .then(() => undefined),
      )
    }
    if (!current.periods.length) {
      jobs.push(
        supabase()
          .from('grade_periods')
          .insert(defaultPeriods().map((p) => ({ ...p, space_id: spaceId })))
          .then(() => undefined),
      )
    }
    if (!jobs.length) return current
    await Promise.all(jobs.map((j) => Promise.resolve(j)))
    return this.loadGradebook(spaceId)
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

  /* -------------------------------- realtime ----------------------------- */

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
      ]
      const gradebookTables = [
        'grade_scales',
        'grade_periods',
        'grade_categories',
        'grade_items',
        'grades',
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
