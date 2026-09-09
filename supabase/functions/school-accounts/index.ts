// ===========================================================================
// CornFlow · school-accounts
//
// Заводит аккаунты ученикам и учителям, которых администратор создал в школе,
// и меняет им пароль. Здесь и только здесь живёт service_role-ключ: Supabase
// подставляет его сам через переменную окружения, в браузер он не попадает.
//
// Вызывать с заголовком Authorization: Bearer <токен администратора>.
// Функция сама проверяет, что вызывающий — администратор именно этой школы.
//
// Тело запроса:
//   { action: "create",       school_id, people: [{ person_id, login, password }] }
//   { action: "set_password", school_id, people: [{ person_id, password }] }
//
// Ответ: { results: [{ person_id, ok, error? }] }
// ===========================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_BATCH = 200

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Служебная почта аккаунта: логин + код школы. Письма туда не ходят. */
function loginEmail(login: string, code: string) {
  const safe = login.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
  return `${safe}@${code.trim().toLowerCase()}.cornflow.school`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Только POST' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Нет токена' }, 401)

  // кто пришёл
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: me, error: meErr } = await asUser.auth.getUser()
  if (meErr || !me?.user) return json({ error: 'Не удалось опознать пользователя' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  let body: {
    action?: string
    school_id?: string
    people?: Array<{ person_id: string; login?: string; password?: string }>
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Некорректный JSON' }, 400)
  }

  const { action, school_id: schoolId } = body
  const people = body.people ?? []
  if (!schoolId) return json({ error: 'Не указана школа' }, 400)
  if (!Array.isArray(people) || people.length === 0) return json({ error: 'Пустой список' }, 400)
  if (people.length > MAX_BATCH) return json({ error: `За раз не больше ${MAX_BATCH}` }, 400)

  // право: владелец школы или человек с ролью admin в ней
  const { data: school } = await admin
    .from('schools')
    .select('id, code, owner_id')
    .eq('id', schoolId)
    .maybeSingle()
  if (!school) return json({ error: 'Школа не найдена' }, 404)

  let allowed = school.owner_id === me.user.id
  if (!allowed) {
    const { data: adminRow } = await admin
      .from('school_people')
      .select('id')
      .eq('school_id', schoolId)
      .eq('user_id', me.user.id)
      .eq('role', 'admin')
      .maybeSingle()
    allowed = Boolean(adminRow)
  }
  if (!allowed) return json({ error: 'Нужны права администратора школы' }, 403)

  const ids = people.map((p) => p.person_id)
  const { data: rows } = await admin
    .from('school_people')
    .select('id, role, login, user_id, first_name, last_name')
    .eq('school_id', schoolId)
    .in('id', ids)
  const byId = new Map((rows ?? []).map((r) => [r.id, r]))

  const results: Array<{ person_id: string; ok: boolean; error?: string; login?: string }> = []

  for (const item of people) {
    const person = byId.get(item.person_id)
    if (!person) {
      results.push({ person_id: item.person_id, ok: false, error: 'Человек не найден в этой школе' })
      continue
    }
    const password = (item.password ?? '').trim()
    if (password.length < 6) {
      results.push({ person_id: item.person_id, ok: false, error: 'Пароль короче 6 символов' })
      continue
    }

    try {
      if (action === 'set_password') {
        if (!person.user_id) throw new Error('У человека ещё нет аккаунта')
        const { error } = await admin.auth.admin.updateUserById(person.user_id, { password })
        if (error) throw new Error(error.message)
        results.push({ person_id: person.id, ok: true })
        continue
      }

      if (action !== 'create') throw new Error('Неизвестное действие')

      const login = (item.login ?? person.login ?? '').trim()
      if (!login) throw new Error('Не задан логин')
      const email = loginEmail(login, school.code)
      const name = [person.last_name, person.first_name].filter(Boolean).join(' ') || login

      // аккаунт уже есть — просто обновляем пароль
      if (person.user_id) {
        const { error } = await admin.auth.admin.updateUserById(person.user_id, { password })
        if (error) throw new Error(error.message)
        await admin.from('school_people').update({ login }).eq('id', person.id)
        results.push({ person_id: person.id, ok: true, login })
        continue
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          role: person.role === 'student' ? 'student' : 'teacher',
          school_login: login,
        },
      })
      if (createErr || !created?.user) throw new Error(createErr?.message ?? 'Не удалось создать аккаунт')

      // профиль создаётся триггером handle_new_user; на всякий случай убеждаемся
      await admin
        .from('users')
        .upsert(
          {
            id: created.user.id,
            name,
            email,
            role: person.role === 'student' ? 'student' : 'teacher',
          },
          { onConflict: 'id' },
        )

      const { error: linkErr } = await admin
        .from('school_people')
        .update({ user_id: created.user.id, login })
        .eq('id', person.id)
      if (linkErr) throw new Error(linkErr.message)

      results.push({ person_id: person.id, ok: true, login })
    } catch (e) {
      results.push({ person_id: item.person_id, ok: false, error: (e as Error).message })
    }
  }

  return json({ results })
})
