import { useState } from 'react'
import { CalendarRange, Check, Palmtree, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/primitives'
import { cx, formatDate } from '@/lib/utils'
import type { SchoolApi } from '@/hooks/useSchool'
import type { SchoolHoliday, SchoolTerm } from '@/lib/types'

/**
 * Отчётные периоды школы и каникулы.
 *
 * Периоды вложены: год → полугодия → четверти. Группа привязывается к одному
 * из них, своды оценок считаются по ним, расписание по ним режется. Это не то
 * же самое, что периоды внутри журнала курса — те остаются как были.
 */
export function TermsSection({ school }: { school: SchoolApi }) {
  const toast = useToast()
  const [preset, setPreset] = useState(false)
  const [editing, setEditing] = useState<SchoolTerm | null>(null)
  const [holiday, setHoliday] = useState<SchoolHoliday | 'new' | null>(null)
  const [confirm, setConfirm] = useState<SchoolTerm | null>(null)

  return (
    <section className="space-y-5">
      {school.isAdmin && (
        <div className="cf-card flex flex-wrap items-center gap-2 p-3">
          <span className="text-[13px] text-ink-2">Учебных лет: {school.years.length}</span>
          <button className="cf-btn-brand ml-auto px-4" onClick={() => setPreset(true)}>
            <Plus size={15} /> Учебный год
          </button>
        </div>
      )}

      {school.years.length === 0 ? (
        <EmptyState
          title="Периодов пока нет"
          description="Заведите учебный год — полугодия и пять четвертей, включая летнюю, создадутся сразу. Даты потом можно поправить."
        />
      ) : (
        <div className="space-y-3">
          {school.years.map((year) => (
            <article key={year.id} className="cf-card p-4">
              <header className="flex flex-wrap items-center gap-2">
                <CalendarRange size={16} className="text-ink-3" />
                <h3 className="text-[15px] font-semibold">{year.name}</h3>
                <span className="text-[12.5px] text-ink-3">
                  {formatDate(year.start_date)} — {formatDate(year.end_date)}
                </span>
                {school.isAdmin && (
                  <div className="ml-auto flex gap-1">
                    <button className="cf-icon-btn" onClick={() => setEditing(year)} title="Изменить">
                      <Pencil size={14} />
                    </button>
                    <button className="cf-icon-btn" onClick={() => setConfirm(year)} title="Удалить год">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </header>

              <div className="mt-3 space-y-2">
                {school.termChildren(year.id).map((half) => (
                  <div key={half.id} className="rounded-[16px] border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold">{half.name}</span>
                      <span className="text-[12px] text-ink-3">
                        {formatDate(half.start_date)} — {formatDate(half.end_date)}
                      </span>
                      {school.isAdmin && (
                        <button
                          className="cf-icon-btn ml-auto"
                          onClick={() => setEditing(half)}
                          title="Изменить"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {school.termChildren(half.id).map((q) => (
                        <button
                          key={q.id}
                          disabled={!school.isAdmin}
                          onClick={() => setEditing(q)}
                          className={cx(
                            'cf-pill flex items-center gap-1.5 px-2.5 py-[3px] text-[12px] font-medium transition-colors',
                            q.id === school.currentTerm?.id
                              ? 'border-brand/30 bg-brand-soft text-brand'
                              : 'text-ink-2',
                          )}
                          title={`${formatDate(q.start_date)} — ${formatDate(q.end_date)}`}
                        >
                          {q.id === school.currentTerm?.id && <Check size={11} />}
                          {q.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Palmtree size={14} className="text-ink-3" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Каникулы</h3>
          {school.isAdmin && (
            <button className="cf-btn-ghost ml-auto px-3 text-[12.5px]" onClick={() => setHoliday('new')}>
              <Plus size={14} /> Добавить
            </button>
          )}
        </div>

        <div className="cf-card p-3">
          {school.holidays.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">
              Дни каникул исчезают из расписания у всех и не считаются пропусками.
            </p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {school.holidays.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-2 rounded-[14px] border border-line px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{h.name}</span>
                  <span className="shrink-0 text-[11.5px] text-ink-3">
                    {formatDate(h.start_date)} — {formatDate(h.end_date)}
                  </span>
                  {school.isAdmin && (
                    <button className="cf-icon-btn shrink-0" onClick={() => setHoliday(h)}>
                      <Pencil size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {preset && <PresetModal school={school} onClose={() => setPreset(false)} />}
      {editing && <TermModal school={school} term={editing} onClose={() => setEditing(null)} />}
      {holiday && (
        <HolidayModal
          school={school}
          holiday={holiday === 'new' ? null : holiday}
          onClose={() => setHoliday(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Удалить учебный год?"
        description="Полугодия и четверти внутри него исчезнут. Группы, привязанные к этим периодам, останутся — просто без периода."
        confirmLabel="Удалить"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          try {
            await db.deleteTerm(confirm.id)
            await school.refresh()
          } catch (e) {
            toast.error(e)
          } finally {
            setConfirm(null)
          }
        }}
      />
    </section>
  )
}

function PresetModal({ school, onClose }: { school: SchoolApi; onClose: () => void }) {
  const toast = useToast()
  const year = new Date().getFullYear()
  const [start, setStart] = useState(`${year}-09-01`)
  const [busy, setBusy] = useState(false)

  return (
    <Modal open onClose={onClose} title="Новый учебный год">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Первый день года</span>
          <input
            type="date"
            className="cf-input w-full"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>

        <p className="text-[12.5px] text-ink-3">
          Сразу создадутся два полугодия и пять четвертей, включая летнюю. Даты — ровными кусками от
          первого дня; поправить их можно в любой момент.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button
            className="cf-btn-brand px-4"
            disabled={busy || !start}
            onClick={async () => {
              if (!school.schoolId) return
              setBusy(true)
              try {
                await db.createTermPreset(school.schoolId, start)
                await school.refresh()
                onClose()
              } catch (e) {
                toast.error(e)
              } finally {
                setBusy(false)
              }
            }}
          >
            Создать
          </button>
        </div>
      </div>
    </Modal>
  )
}

function TermModal({
  school,
  term,
  onClose,
}: {
  school: SchoolApi
  term: SchoolTerm
  onClose: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(term.name)
  const [start, setStart] = useState(term.start_date.slice(0, 10))
  const [end, setEnd] = useState(term.end_date.slice(0, 10))
  const [current, setCurrent] = useState(term.is_current)
  const [busy, setBusy] = useState(false)

  return (
    <Modal open onClose={onClose} title={term.name}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Название</span>
          <input className="cf-input w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-ink-2">Начало</span>
            <input
              type="date"
              className="cf-input w-full"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-ink-2">Конец</span>
            <input
              type="date"
              className="cf-input w-full"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>

        {term.kind !== 'year' && (
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-[3px]"
              checked={current}
              onChange={(e) => setCurrent(e.target.checked)}
            />
            <span className="text-[13px] text-ink-2">
              Текущий период
              <span className="block text-[12px] text-ink-3">
                По нему открываются журналы и считаются своды. Текущий — ровно один.
              </span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button
            className="cf-btn-brand px-4"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                await db.updateTerm(term.id, {
                  name: name.trim(),
                  start_date: start,
                  end_date: end,
                  is_current: current,
                })
                await school.refresh()
                onClose()
              } catch (e) {
                toast.error(e)
              } finally {
                setBusy(false)
              }
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}

function HolidayModal({
  school,
  holiday,
  onClose,
}: {
  school: SchoolApi
  holiday: SchoolHoliday | null
  onClose: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(holiday?.name ?? '')
  const [start, setStart] = useState(holiday?.start_date.slice(0, 10) ?? '')
  const [end, setEnd] = useState(holiday?.end_date.slice(0, 10) ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!school.schoolId || !name.trim() || !start || !end) return
    setBusy(true)
    try {
      if (holiday) {
        await db.updateHoliday(holiday.id, { name: name.trim(), start_date: start, end_date: end })
      } else {
        await db.createHoliday({
          school_id: school.schoolId,
          name: name.trim(),
          start_date: start,
          end_date: end,
        })
      }
      await school.refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={holiday ? 'Каникулы' : 'Новые каникулы'}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Название</span>
          <input
            className="cf-input w-full"
            placeholder="Осенние"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-ink-2">С</span>
            <input
              type="date"
              className="cf-input w-full"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-ink-2">По</span>
            <input
              type="date"
              className="cf-input w-full"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>

        <div className="flex justify-between gap-2 pt-1">
          {holiday ? (
            <button
              className="cf-btn-ghost px-3 text-[12.5px] text-red-500"
              onClick={async () => {
                try {
                  await db.deleteHoliday(holiday.id)
                  await school.refresh()
                  onClose()
                } catch (e) {
                  toast.error(e)
                }
              }}
            >
              <Trash2 size={14} /> Удалить
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="cf-btn-ghost px-4" onClick={onClose}>
              Отмена
            </button>
            <button
              className="cf-btn-brand px-4"
              disabled={busy || !name.trim() || !start || !end}
              onClick={() => void save()}
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
