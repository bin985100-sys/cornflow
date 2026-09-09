import { useMemo, useState } from 'react'
import { KeyRound, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/primitives'
import { cx, download, generatePassword, loginFromName, normalizeLogin } from '@/lib/utils'
import type { SchoolApi } from '@/hooks/useSchool'
import type { AccountResult, SchoolPerson, SchoolRole } from '@/lib/types'

const PAGE = 100

/**
 * Ученики и учителя школы. Учеников может быть сколько угодно: список
 * подгружается порциями, добавление — построчной вставкой из таблицы.
 *
 * Аккаунты выдаёт администратор: логин и пароль. Пароли нигде не хранятся —
 * их видно один раз при выдаче, поэтому список сразу можно скачать файлом.
 */
export function PeopleSection({ school, role }: { school: SchoolApi; role: SchoolRole }) {
  const toast = useToast()
  const people = role === 'student' ? school.students : school.teachers
  const [query, setQuery] = useState('')
  const [classFilter, setClassFilter] = useState<string>('')
  const [limit, setLimit] = useState(PAGE)
  const [adding, setAdding] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [issuing, setIssuing] = useState<SchoolPerson[] | null>(null)
  const [confirm, setConfirm] = useState<SchoolPerson | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter((p) => {
      if (classFilter && p.class_id !== classFilter) return false
      if (!q) return true
      return (
        school.fullName(p).toLowerCase().includes(q) || (p.login ?? '').toLowerCase().includes(q)
      )
    })
  }, [people, query, classFilter, school])

  const withoutAccount = filtered.filter((p) => !p.user_id)

  return (
    <section className="space-y-4">
      <div className="cf-card flex flex-wrap items-center gap-2 p-3">
        <span className="relative flex-1 min-w-[180px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="cf-input w-full pl-9"
            placeholder={role === 'student' ? 'Поиск по ученикам' : 'Поиск по учителям'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </span>

        {role === 'student' && (
          <select className="cf-input w-40" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">Все классы</option>
            {school.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {school.classLabel(c.id)}
              </option>
            ))}
          </select>
        )}

        {school.isAdmin && (
          <>
            <button className="cf-btn-ghost px-3 text-[12.5px]" onClick={() => setBulk(true)}>
              <Users size={14} /> Списком
            </button>
            <button className="cf-btn-brand px-4" onClick={() => setAdding(true)}>
              <Plus size={15} /> Добавить
            </button>
          </>
        )}
      </div>

      {school.isAdmin && withoutAccount.length > 0 && (
        <div className="cf-card flex flex-wrap items-center gap-2 border-brand/30 bg-brand-soft/40 p-3">
          <KeyRound size={16} className="text-brand" />
          <span className="text-[13px]">
            Без аккаунта: <b>{withoutAccount.length}</b>. Пока аккаунта нет, человек не может войти в школу.
          </span>
          <button className="cf-btn-brand ml-auto px-4" onClick={() => setIssuing(withoutAccount)}>
            Выдать логины и пароли
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={role === 'student' ? 'Учеников пока нет' : 'Учителей пока нет'}
          description={
            school.isAdmin
              ? 'Добавьте по одному или вставьте список из таблицы — по человеку на строку.'
              : 'Список заполняет администратор школы.'
          }
        />
      ) : (
        <div className="cf-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-surface-2 text-left text-[12px] text-ink-3">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Фамилия и имя</th>
                  {role === 'student' && <th className="px-4 py-2.5 font-medium">Класс</th>}
                  <th className="px-4 py-2.5 font-medium">Логин</th>
                  <th className="px-4 py-2.5 font-medium">Аккаунт</th>
                  {school.isAdmin && <th className="w-24 px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    school={school}
                    role={role}
                    onIssue={() => setIssuing([person])}
                    onDelete={() => setConfirm(person)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > limit && (
            <button
              className="w-full border-t border-line py-2.5 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2"
              onClick={() => setLimit((v) => v + PAGE)}
            >
              Показать ещё {Math.min(PAGE, filtered.length - limit)} из {filtered.length - limit}
            </button>
          )}
        </div>
      )}

      {adding && <PersonModal school={school} role={role} onClose={() => setAdding(false)} />}
      {bulk && <BulkModal school={school} role={role} onClose={() => setBulk(false)} />}
      {issuing && <IssueModal school={school} people={issuing} onClose={() => setIssuing(null)} />}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm ? `Удалить ${school.fullName(confirm)}?` : ''}
        description="Запись пропадёт из школы и из всех групп. Уже выставленные оценки останутся в журналах."
        confirmLabel="Удалить"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const person = confirm
          setConfirm(null)
          if (!person) return
          try {
            await db.deletePerson(person.id)
            await school.refresh()
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </section>
  )
}

function PersonRow({
  person,
  school,
  role,
  onIssue,
  onDelete,
}: {
  person: SchoolPerson
  school: SchoolApi
  role: SchoolRole
  onIssue: () => void
  onDelete: () => void
}) {
  const toast = useToast()

  async function moveToClass(classId: string) {
    try {
      await db.updatePerson(person.id, { class_id: classId || null })
      await school.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <tr className="border-t border-line">
      <td className="px-4 py-2.5">{school.fullName(person)}</td>
      {role === 'student' && (
        <td className="px-4 py-2">
          {school.isAdmin ? (
            <select
              className="cf-input h-8 w-32 py-0 text-[12.5px]"
              value={person.class_id ?? ''}
              onChange={(e) => void moveToClass(e.target.value)}
            >
              <option value="">без класса</option>
              {school.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {school.classLabel(c.id)}
                </option>
              ))}
            </select>
          ) : (
            school.classLabel(person.class_id)
          )}
        </td>
      )}
      <td className="px-4 py-2.5 font-mono text-[12.5px]">{person.login ?? '—'}</td>
      <td className="px-4 py-2.5">
        <span
          className={cx(
            'cf-pill px-2 py-[2px] text-[11.5px]',
            person.user_id ? 'border-green-500/25 text-green-600' : 'text-ink-3',
          )}
        >
          {person.user_id ? 'есть' : 'нет'}
        </span>
      </td>
      {school.isAdmin && (
        <td className="px-4 py-2">
          <div className="flex items-center justify-end gap-1">
            <button className="cf-icon-btn" onClick={onIssue} title={person.user_id ? 'Сменить пароль' : 'Выдать аккаунт'}>
              <KeyRound size={15} />
            </button>
            <button className="cf-icon-btn" onClick={onDelete} title="Удалить">
              <Trash2 size={15} />
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}

/* ------------------------- добавление по одному --------------------------- */

function PersonModal({
  school,
  role,
  onClose,
}: {
  school: SchoolApi
  role: SchoolRole
  onClose: () => void
}) {
  const toast = useToast()
  const [last, setLast] = useState('')
  const [first, setFirst] = useState('')
  const [middle, setMiddle] = useState('')
  const [classId, setClassId] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!school.schoolId || !last.trim()) return
    setBusy(true)
    try {
      await db.createPerson({
        school_id: school.schoolId,
        role,
        last_name: last,
        first_name: first,
        middle_name: middle || null,
        class_id: role === 'student' ? classId || null : null,
        login: normalizeLogin(loginFromName(last, first)) || null,
      })
      await school.refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={role === 'student' ? 'Новый ученик' : 'Новый учитель'} size="sm">
      <div className="space-y-3">
        <Field label="Фамилия">
          <input className="cf-input w-full" value={last} onChange={(e) => setLast(e.target.value)} autoFocus />
        </Field>
        <Field label="Имя">
          <input className="cf-input w-full" value={first} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label="Отчество">
          <input className="cf-input w-full" value={middle} onChange={(e) => setMiddle(e.target.value)} />
        </Field>
        {role === 'student' && (
          <Field label="Класс">
            <select className="cf-input w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">без класса</option>
              {school.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {school.classLabel(c.id)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <p className="text-[12px] text-ink-3">
          Логин предложится сам — «Иванов Пётр» станет <code>ivanov.p</code>. Аккаунт и пароль
          выдаются отдельно, кнопкой «Выдать логины и пароли».
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand px-4" disabled={busy || !last.trim()} onClick={() => void save()}>
            <UserPlus size={15} /> Добавить
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* --------------------------- вставка списком ------------------------------ */

function BulkModal({
  school,
  role,
  onClose,
}: {
  school: SchoolApi
  role: SchoolRole
  onClose: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [classId, setClassId] = useState('')
  const [busy, setBusy] = useState(false)

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  async function save() {
    if (!school.schoolId || !lines.length) return
    setBusy(true)
    try {
      const inputs = lines.map((line) => {
        // «Фамилия Имя Отчество» или «Фамилия Имя, 9А» — класс после запятой
        const [namePart, classPart] = line.split(',').map((s) => s.trim())
        const [last = '', first = '', middle = ''] = namePart.split(/\s+/)
        const named = classPart
          ? school.classes.find((c) => school.classLabel(c.id).toLowerCase() === classPart.toLowerCase())
          : undefined
        return {
          school_id: school.schoolId!,
          role,
          last_name: last,
          first_name: first,
          middle_name: middle || null,
          class_id: role === 'student' ? (named?.id ?? classId ?? null) || null : null,
          login: normalizeLogin(loginFromName(last, first)) || null,
        }
      })
      // порциями, чтобы не упереться в лимит одного запроса
      for (let i = 0; i < inputs.length; i += 200) {
        await db.createPeople(inputs.slice(i, i + 200))
      }
      await school.refresh()
      toast.success(`Добавлено: ${inputs.length}`)
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Добавить списком" size="md">
      <div className="space-y-3">
        <p className="text-[12.5px] text-ink-3">
          По человеку на строку: <code>Фамилия Имя Отчество</code>. Можно указать класс после
          запятой — <code>Иванов Пётр, 9А</code>. Логины подставятся автоматически.
        </p>
        <textarea
          className="cf-input h-56 w-full resize-none font-mono text-[12.5px]"
          placeholder={'Иванов Пётр, 9А\nПетрова Анна, 9А\nСидоров Илья, 9Б'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        {role === 'student' && (
          <Field label="Класс по умолчанию">
            <select className="cf-input w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">без класса</option>
              {school.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {school.classLabel(c.id)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="mr-auto text-[12.5px] text-ink-3">Строк: {lines.length}</span>
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand px-4" disabled={busy || !lines.length} onClick={() => void save()}>
            Добавить {lines.length || ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------------------- выдача аккаунтов ---------------------------- */

interface Draft {
  person: SchoolPerson
  login: string
  password: string
}

function IssueModal({
  school,
  people,
  onClose,
}: {
  school: SchoolApi
  people: SchoolPerson[]
  onClose: () => void
}) {
  const toast = useToast()
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    people.map((person) => ({
      person,
      login: person.login || normalizeLogin(loginFromName(person.last_name, person.first_name)),
      password: generatePassword(),
    })),
  )
  const [results, setResults] = useState<AccountResult[] | null>(null)
  const [busy, setBusy] = useState(false)

  function patch(id: string, key: 'login' | 'password', value: string) {
    setDrafts((list) =>
      list.map((d) =>
        d.person.id === id ? { ...d, [key]: key === 'login' ? normalizeLogin(value) : value } : d,
      ),
    )
  }

  async function issue() {
    if (!school.schoolId) return
    setBusy(true)
    try {
      const res = await db.createAccounts(
        school.schoolId,
        drafts.map((d) => ({ person_id: d.person.id, login: d.login, password: d.password })),
      )
      setResults(res)
      await school.refresh()
      const failed = res.filter((r) => !r.ok).length
      if (failed) toast.error(`Не удалось завести аккаунтов: ${failed}`)
      else toast.success('Аккаунты готовы')
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  function exportList() {
    const head = 'ФИО;Код школы;Логин;Пароль'
    const rows = drafts
      .filter((d) => !results || results.find((r) => r.person_id === d.person.id)?.ok)
      .map((d) => [school.fullName(d.person), school.school.code, d.login, d.password].join(';'))
    const csv = '﻿' + [head, ...rows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    download(url, `cornflow-accounts-${school.school.code}.csv`)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <Modal open onClose={onClose} title="Логины и пароли" size="lg">
      <div className="space-y-3">
        <p className="text-[12.5px] text-ink-3">
          Пароли нигде не сохраняются — их видно только сейчас. Скачайте список, прежде чем
          закрыть окно. Забытый пароль не восстанавливается, но администратор всегда может
          задать новый.
        </p>

        <div className="max-h-[46vh] overflow-y-auto rounded-[18px] border border-line">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead className="sticky top-0 bg-surface-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">Человек</th>
                <th className="px-3 py-2 font-medium">Логин</th>
                <th className="px-3 py-2 font-medium">Пароль</th>
                {results && <th className="px-3 py-2 font-medium">Итог</th>}
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => {
                const res = results?.find((r) => r.person_id === d.person.id)
                return (
                  <tr key={d.person.id} className="border-t border-line">
                    <td className="px-3 py-1.5">{school.fullName(d.person)}</td>
                    <td className="px-3 py-1.5">
                      <input
                        className="cf-input h-8 w-36 py-0 font-mono text-[12.5px]"
                        value={d.login}
                        disabled={Boolean(results)}
                        onChange={(e) => patch(d.person.id, 'login', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className="cf-input h-8 w-32 py-0 font-mono text-[12.5px]"
                        value={d.password}
                        disabled={Boolean(results)}
                        onChange={(e) => patch(d.person.id, 'password', e.target.value)}
                      />
                    </td>
                    {results && (
                      <td className="px-3 py-1.5 text-[12px]">
                        {res?.ok ? (
                          <span className="text-green-600">готово</span>
                        ) : (
                          <span className="text-red-500">{res?.error ?? '—'}</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[12.5px] text-ink-3">
            Код школы: <b className="font-mono">{school.school.code}</b> — его вводят вместе с логином
          </span>
          <button className="cf-btn-ghost px-4" onClick={exportList}>
            Скачать список
          </button>
          {results ? (
            <button className="cf-btn-brand px-4" onClick={onClose}>
              Готово
            </button>
          ) : (
            <button className="cf-btn-brand px-4" disabled={busy} onClick={() => void issue()}>
              Завести аккаунты
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[12.5px] text-ink-2">{label}</span>
      {children}
    </div>
  )
}
