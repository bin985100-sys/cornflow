import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Ban,
  Building2,
  Check,
  ExternalLink,
  KeyRound,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { usePlatformCtx } from '@/context/PlatformContext'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/primitives'
import { cardPalette, cx, generatePassword } from '@/lib/utils'
import type { PlatformPerson, PlatformSchool } from '@/lib/types'

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">{title}</h1>
        <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>
      </header>
      {children}
    </div>
  )
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

/* --------------------------------- обзор ---------------------------------- */

export function PlatformOverviewPage() {
  const { overview, schools } = usePlatformCtx()
  if (!overview) return null

  const cards: Array<{ label: string; value: number; hint: string }> = [
    { label: 'Школы', value: overview.schools, hint: overview.blocked ? `заблокировано: ${overview.blocked}` : 'все активны' },
    { label: 'Аккаунты', value: overview.users, hint: `за неделю: +${overview.new_users_7d}` },
    { label: 'Пространства', value: overview.spaces, hint: `курсов из школ: ${overview.courses}` },
    { label: 'Люди в школах', value: overview.people, hint: `учеников ${overview.students} · учителей ${overview.teachers}` },
    { label: 'Без аккаунта', value: overview.no_account, hint: 'заведены, но войти не могут' },
    { label: 'Материалы', value: overview.materials, hint: `заданий: ${overview.assignments}` },
    { label: 'Оценки', value: overview.grades, hint: 'во всех журналах' },
  ]

  const blocked = schools.filter((s) => s.is_blocked)

  return (
    <Page title="Платформа" subtitle="Всё, что происходит в сервисе, одним экраном.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="cf-card p-4">
            <p className="text-[26px] font-semibold leading-none">{c.value}</p>
            <p className="mt-1.5 text-[13.5px] font-medium">{c.label}</p>
            <p className="text-[12px] text-ink-3">{c.hint}</p>
          </div>
        ))}
      </div>

      {blocked.length > 0 && (
        <div className="cf-card border-[#E5484D]/25 bg-[#FDECEC]/50 p-4">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-[#8E2226]">
            <Ban size={16} /> Заблокированные школы: {blocked.length}
          </p>
          <div className="mt-2 space-y-1">
            {blocked.map((s) => (
              <p key={s.id} className="text-[12.5px] text-ink-2">
                {s.name} — {s.blocked_reason || 'причина не указана'}
              </p>
            ))}
          </div>
        </div>
      )}
    </Page>
  )
}

/* --------------------------------- школы ---------------------------------- */

export function PlatformSchoolsPage() {
  const { schools } = usePlatformCtx()
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return schools
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.owner_email ?? '').toLowerCase().includes(q),
    )
  }, [schools, query])

  return (
    <Page title="Школы" subtitle="Все школы сервиса, их владельцы и размер. Отсюда же закрывается вход.">
      <div className="cf-card flex flex-wrap items-center gap-2 p-3">
        <span className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="cf-input w-full pl-9"
            placeholder="Название, код школы или почта владельца"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </span>
        <span className="text-[13px] text-ink-3">найдено: {list.length}</span>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Ничего не нашлось" description="Проверьте запрос — ищем по названию, коду и почте владельца." />
      ) : (
        <div className="space-y-2">
          {list.map((s) => (
            <SchoolRow key={s.id} school={s} />
          ))}
        </div>
      )}
    </Page>
  )
}

function SchoolRow({ school }: { school: PlatformSchool }) {
  const toast = useToast()
  const platform = usePlatformCtx()
  const [confirm, setConfirm] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <div className="cf-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 size={16} className="text-ink-3" />
        <h3 className="text-[15px] font-semibold">{school.name}</h3>
        <span className="cf-pill px-2 py-[2px] font-mono text-[11px]">{school.code}</span>
        {school.is_blocked && (
          <span className="cf-pill border-[#E5484D]/30 bg-[#FDECEC] px-2 py-[2px] text-[11px] font-semibold text-[#8E2226]">
            заблокирована
          </span>
        )}
        <button
          className={cx('ml-auto px-3 py-1.5 text-[12.5px]', school.is_blocked ? 'cf-btn-brand' : 'cf-btn-ghost')}
          onClick={() => {
            if (school.is_blocked) void unblock()
            else setConfirm(true)
          }}
        >
          {school.is_blocked ? <ShieldCheck size={14} /> : <Ban size={14} />}
          {school.is_blocked ? 'Разблокировать' : 'Заблокировать'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
        <span>владелец: {school.owner_name ?? '—'}{school.owner_email ? ` · ${school.owner_email}` : ''}</span>
        <span>людей: {school.people} (учеников {school.students}, учителей {school.teachers})</span>
        <span>пространств: {school.spaces}</span>
        <span>создана {dateLabel(school.created_at)}</span>
      </div>

      {school.is_blocked && school.blocked_reason && (
        <p className="mt-2 rounded-[12px] bg-surface-2 p-2.5 text-[12.5px] text-ink-2">
          Причина: {school.blocked_reason}
        </p>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title={`Заблокировать «${school.name}»?`} size="sm">
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-ink-3">
            Школьные аккаунты перестанут входить по коду и логину. Данные, материалы
            и оценки остаются на месте — блокировка снимается в один клик.
          </p>
          <div>
            <span className="mb-1 block text-[12.5px] text-ink-2">Причина (попадёт в журнал)</span>
            <input
              className="cf-input w-full"
              placeholder="Жалоба на содержимое, проверка"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="cf-btn-ghost px-4" onClick={() => setConfirm(false)}>
              Отмена
            </button>
            <button className="cf-btn-brand px-4" onClick={() => void block()}>
              Заблокировать
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )

  async function block() {
    setConfirm(false)
    try {
      await db.platformBlockSchool(school.id, true, reason.trim() || null)
      await platform.refresh()
      toast.success('Школа заблокирована')
    } catch (e) {
      toast.error(e)
    }
  }

  async function unblock() {
    try {
      await db.platformBlockSchool(school.id, false)
      await platform.refresh()
      toast.success('Блокировка снята')
    } catch (e) {
      toast.error(e)
    }
  }
}

/* ----------------------------- пространства ------------------------------- */

export function PlatformSpacesPage() {
  const platform = usePlatformCtx()
  const { spaces } = platform
  const navigate = useNavigate()
  const toast = useToast()
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return spaces
    return spaces.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.owner_name ?? '').toLowerCase().includes(q) ||
        (s.school_name ?? '').toLowerCase().includes(q),
    )
  }, [spaces, query])

  async function open(id: string, name: string) {
    try {
      await db.platformLog({
        action: 'space.open',
        target_type: 'space',
        target_id: id,
        target_label: name,
      })
      await platform.refresh()
    } catch {
      // журнал не должен мешать работе
    }
    localStorage.setItem('cornflow.space', id)
    navigate('/app')
    toast.success('Открыто от имени администратора — запись в журнале')
  }

  return (
    <Page
      title="Пространства"
      subtitle="Все курсы и личные пространства сервиса. Открытие чужого пространства пишется в журнал."
    >
      <div className="cf-card flex flex-wrap items-center gap-2 p-3">
        <span className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="cf-input w-full pl-9"
            placeholder="Название, владелец или школа"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </span>
        <span className="text-[13px] text-ink-3">найдено: {list.length}</span>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Ничего не нашлось" description="Ищем по названию пространства, владельцу и школе." />
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {list.map((s) => (
            <div key={s.id} className="cf-card flex flex-wrap items-center gap-2 p-3">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cardPalette[s.color].accent }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{s.name}</p>
                <p className="text-[12px] text-ink-3">
                  {s.owner_name ?? 'владелец неизвестен'}
                  {s.school_name ? ` · ${s.school_name}` : ''} · участников {s.members} · материалов {s.materials}
                </p>
              </div>
              <button className="cf-btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => void open(s.id, s.name)}>
                <ExternalLink size={14} /> Открыть
              </button>
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

/* ---------------------------------- люди ---------------------------------- */

export function PlatformPeoplePage() {
  const { findPeople } = usePlatformCtx()
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<PlatformPerson[]>([])
  const [busy, setBusy] = useState(true)
  const [resetting, setResetting] = useState<PlatformPerson | null>(null)

  useEffect(() => {
    let alive = true
    setBusy(true)
    const timer = window.setTimeout(() => {
      void findPeople(query)
        .then((r) => alive && setPeople(r))
        .finally(() => alive && setBusy(false))
    }, 250)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [query, findPeople])

  return (
    <Page
      title="Люди"
      subtitle="Поиск по всем школам сразу. Пароль показать нельзя — в базе только хеш; доступ восстанавливается сбросом."
    >
      <div className="cf-card flex flex-wrap items-center gap-2 p-3">
        <span className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="cf-input w-full pl-9"
            placeholder="Фамилия, имя или логин"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </span>
        <span className="text-[13px] text-ink-3">{busy ? 'ищем…' : `найдено: ${people.length}`}</span>
      </div>

      {people.length === 0 && !busy ? (
        <EmptyState title="Никого не нашлось" description="Ищем по фамилии, имени, отчеству и логину во всех школах." />
      ) : (
        <div className="cf-card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="bg-surface-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">Человек</th>
                <th className="px-3 py-2 font-medium">Школа</th>
                <th className="px-3 py-2 font-medium">Роль</th>
                <th className="px-3 py-2 font-medium">Логин</th>
                <th className="px-3 py-2 font-medium">Доступ</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    {p.full_name}
                    {p.class_label && <span className="ml-1.5 text-[11.5px] text-ink-3">{p.class_label}</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-3">{p.school_name ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-3">
                    {p.role === 'student' ? 'ученик' : p.role === 'teacher' ? 'учитель' : 'админ школы'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px]">{p.login ?? '—'}</td>
                  <td className="px-3 py-2">
                    {p.user_id ? (
                      <span className="text-green-600">есть</span>
                    ) : (
                      <span className="text-ink-3">не заведён</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.user_id && (
                      <button
                        className="cf-btn-ghost px-3 py-1 text-[12px]"
                        onClick={() => setResetting(p)}
                        title="Задать новый пароль"
                      >
                        <KeyRound size={13} /> Сбросить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resetting && <ResetModal person={resetting} onClose={() => setResetting(null)} />}
    </Page>
  )
}

function ResetModal({ person, onClose }: { person: PlatformPerson; onClose: () => void }) {
  const toast = useToast()
  const platform = usePlatformCtx()
  const [password, setPassword] = useState(() => generatePassword())
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <Modal open onClose={onClose} title={`Новый пароль · ${person.full_name}`} size="sm">
      <div className="space-y-3">
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Старый пароль посмотреть нельзя: в базе лежит хеш, а не текст. Здесь
          задаётся новый — передайте его человеку и попросите сменить. Сброс
          попадёт в журнал действий.
        </p>
        <div>
          <span className="mb-1 block text-[12.5px] text-ink-2">Пароль</span>
          <div className="flex gap-2">
            <input
              className="cf-input w-full font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="cf-btn-ghost px-3" onClick={() => setPassword(generatePassword())}>
              Другой
            </button>
          </div>
        </div>
        {done ? (
          <div className="flex items-center gap-2 rounded-[12px] bg-brand-soft p-3 text-[13px] text-brand">
            <Check size={15} /> Пароль изменён, запись в журнале есть
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button className="cf-btn-ghost px-4" onClick={onClose}>
              Отмена
            </button>
            <button
              className="cf-btn-brand px-4"
              disabled={busy || password.trim().length < 6}
              onClick={async () => {
                setBusy(true)
                try {
                  await db.platformResetPassword(person.id, password.trim())
                  setDone(true)
                  // журнал держится в контексте — без перечитывания запись не видна
                  await platform.refresh()
                } catch (e) {
                  toast.error(e)
                } finally {
                  setBusy(false)
                }
              }}
            >
              Сменить пароль
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* -------------------------------- журнал ---------------------------------- */

const ACTION_LABEL: Record<string, string> = {
  'space.open': 'открыл чужое пространство',
  'school.block': 'заблокировал школу',
  'school.unblock': 'снял блокировку',
  'person.reset_password': 'сбросил пароль',
  'material.hide': 'скрыл материал',
  'material.unhide': 'вернул материал',
  'comment.hide': 'скрыл комментарий',
  'comment.unhide': 'вернул комментарий',
  'incident.open': 'зафиксировал находку',
  'incident.close': 'закрыл инцидент',
  'incident.reopen': 'переоткрыл инцидент',
}

/**
 * Записи от триггеров базы приходят кодом вида «grades.update». Разбираем их
 * на человеческий вид, а для правок показываем, что именно изменилось.
 */
const TABLE_LABEL: Record<string, string> = {
  grades: 'оценку',
  grade_items: 'работу в журнале',
  grade_categories: 'тип оценивания',
  grade_scales: 'шкалу',
  grade_periods: 'период',
  attendance: 'отметку посещаемости',
  materials: 'материал',
  comments: 'комментарий',
  assignments: 'задание',
  submissions: 'сдачу работы',
  spaces: 'пространство',
  school_people: 'человека в школе',
  schools: 'школу',
}
const OP_LABEL: Record<string, string> = { insert: 'создал', update: 'изменил', delete: 'удалил' }

function actionLabel(action: string): string {
  const known = ACTION_LABEL[action]
  if (known) return known
  const [table, op] = action.split('.')
  const verb = OP_LABEL[op]
  const what = TABLE_LABEL[table]
  return verb && what ? `${verb} ${what}` : action
}

/** Для правок показываем «было → стало» по изменившимся полям */
function changeSummary(meta: Record<string, unknown>): string | null {
  const before = meta.before as Record<string, unknown> | null | undefined
  const after = meta.after as Record<string, unknown> | null | undefined
  if (!before || !after) return null
  const skip = new Set(['updated_at', 'created_at', 'id'])
  const parts: string[] = []
  for (const key of Object.keys(after)) {
    if (skip.has(key)) continue
    const a = before[key]
    const b = after[key]
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    parts.push(`${key}: ${fmt(a)} → ${fmt(b)}`)
    if (parts.length >= 4) break
  }
  return parts.length ? parts.join(', ') : null
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—'
  const text = typeof v === 'string' ? v : JSON.stringify(v)
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

export function PlatformAuditPage() {
  const { audit } = usePlatformCtx()

  return (
    <Page
      title="Журнал действий"
      subtitle="Что делал главный администратор. Записи неизменяемы: политик на правку и удаление у таблицы нет."
    >
      {audit.length === 0 ? (
        <EmptyState
          title="Записей пока нет"
          description="Сюда попадают открытие чужих пространств, блокировки школ и сбросы паролей."
        />
      ) : (
        <div className="cf-card overflow-x-auto p-0">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead className="bg-surface-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">Когда</th>
                <th className="px-3 py-2 font-medium">Кто</th>
                <th className="px-3 py-2 font-medium">Что</th>
                <th className="px-3 py-2 font-medium">Над чем</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-3">{dateLabel(row.created_at)}</td>
                  <td className="px-3 py-2">{row.actor_name ?? '—'}</td>
                  <td className="px-3 py-2">{actionLabel(row.action)}</td>
                  <td className="px-3 py-2 text-ink-3">
                    {row.target_label ?? row.target_id ?? '—'}
                    {typeof row.meta?.reason === 'string' && ` · ${row.meta.reason}`}
                    {(() => {
                      const diff = changeSummary(row.meta ?? {})
                      return diff ? <span className="block text-[11.5px]">{diff}</span> : null
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}

/* заглушка на будущее, чтобы иконка не пропала из импортов */
export const PlatformIcon = ShieldAlert
