import { useState } from 'react'
import { CalendarRange, Check, Palmtree, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/primitives'
import { cx } from '@/lib/utils'
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
        <div className="space-y-4">
          {school.years.map((year) => (
            <YearCard key={year.id} year={year} school={school} onEdit={setEditing} />
          ))}
        </div>
      )}

      {/* каникулы */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 px-1">
          <Palmtree size={15} className="text-ink-3" />
          <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">Каникулы</h2>
          {school.isAdmin && (
            <button className="cf-btn-ghost ml-auto px-3 py-1.5 text-[12.5px]" onClick={() => setHoliday('new')}>
              <Plus size={14} /> Добавить
            </button>
          )}
        </div>
        {school.holidays.length === 0 ? (
          <p className="cf-card p-4 text-[12.5px] text-ink-3">
            Дни каникул исчезают из расписания у всех и не считаются пропусками.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {school.holidays.map((h) => (
              <div key={h.id} className="cf-card flex flex-wrap items-center gap-2 p-3">
                <span className="text-[13.5px] font-semibold">{h.name}</span>
                <span className="text-[12.5px] text-ink-3">
                  {dateLabel(h.start_date)} — {dateLabel(h.end_date)}
                </span>
                {school.isAdmin && (
                  <div className="ml-auto flex gap-1">
                    <button className="cf-icon-btn" onClick={() => setHoliday(h)} title="Изменить">
                      <Pencil size={14} />
                    </button>
                    <button
                      className="cf-icon-btn"
                      title="Удалить"
                      onClick={async () => {
                        try {
                          await db.deleteHoliday(h.id)
                          await school.refresh()
                        } catch (e) {
                          toast.error(e)
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {preset && <PresetModal school={school} onClose={() => setPreset(false)} />}
      {editing && <TermModal term={editing} school={school} onClose={() => setEditing(null)} />}
      {holiday && (
        <HolidayModal
          school={school}
          holiday={holiday === 'new' ? undefined : holiday}
          onClose={() => setHoliday(null)}
        />
      )}
    </section>
  )
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function YearCard({
  year,
  school,
  onEdit,
}: {
  year: SchoolTerm
  school: SchoolApi
  onEdit: (t: SchoolTerm) => void
}) {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const halves = school.termChildren(year.id)

  return (
    <div className="cf-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <CalendarRange size={16} className="text-ink-3" />
        <h3 className="text-[15px] font-semibold">{year.name}</h3>
        <span className="text-[12.5px] text-ink-3">
          {dateLabel(year.start_date)} — {dateLabel(year.end_date)}
        </span>
        {school.isAdmin && (
          <div className="ml-auto flex items-center gap-1">
            <button className="cf-icon-btn" onClick={() => onEdit(year)} title="Изменить даты">
              <Pencil size={14} />
            </button>
            <button className="cf-icon-btn" onClick={() => setConfirm(true)} title="Удалить год">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </header>

      <div className="mt-3 space-y-2.5">
        {halves.map((half) => (
          <div key={half.id} className="rounded-[14px] border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-semibold">{half.name}</span>
              <span className="text-[12px] text-ink-3">
                {dateLabel(half.start_date)} — {dateLabel(half.end_date)}
              </span>
              {school.isAdmin && (
                <button className="cf-icon-btn ml-auto" onClick={() => onEdit(half)} title="Изменить">
                  <Pencil size={13} />
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {school.termChildren(half.id).map((q) => (
                <button
                  key={q.id}
                  onClick={() => school.isAdmin && onEdit(q)}
                  className={cx(
                    'cf-pill px-2.5 py-[4px] text-[11.5px] font-semibold transition-colors',
                    q.is_current ? 'border-brand/30 bg-brand-soft text-brand' : 'text-ink-3',
                  )}
                  title={`${dateLabel(q.start_date)} — ${dateLabel(q.end_date)}`}
                >
                  {q.is_current && <Check size={11} className="mr-1 inline" />}
                  {q.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirm}
        title={`Удалить ${year.name}?`}
        description="Вместе с годом уйдут его полугодия и четверти. Группы, привязанные к ним, останутся без периода."
        confirmLabel="Удалить"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false)
          try {
            await db.deleteTerm(year.id)
            await school.refresh()
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </div>
  )
}

function PresetModal({ school, onClose }: { school: SchoolApi; onClose: () => void }) {
  const toast = useToast()
  const [start, setStart] = useState(() => `${new Date().getFullYear()}-09-01`)
  const [busy, setBusy] = useState(false)

  return (
    <Modal open onClose={onClose} title="Новый учебный год" size="sm">
      <div className="space-y-3">
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Создадутся сразу: год, два полугодия и пять четвертей вместе с летней.
          Даты делятся поровну — поправьте их потом под свой календарь.
        </p>
        <div>
          <span className="mb-1 block text-[12.5px] text-ink-2">Начало года</span>
          <input
            type="date"
            className="cf-input w-full"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
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
  term,
  school,
  onClose,
}: {
  term: SchoolTerm
  school: SchoolApi
  onClose: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(term.name)
  const [start, setStart] = useState(term.start_date)
  const [end, setEnd] = useState(term.end_date)
  const [current, setCurrent] = useState(term.is_current)
  const [busy, setBusy] = useState(false)

  return (
    <Modal open onClose={onClose} title={term.name} size="sm">
      <div className="space-y-3">
        <div>
          <span className="mb-1 block text-[12.5px] text-ink-2">Название</span>
          <input className="cf-input w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-[12.5px] text-ink-2">Начало</span>
            <input type="date" className="cf-input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <span className="mb-1 block text-[12.5px] text-ink-2">Конец</span>
            <input type="date" className="cf-input w-full" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {term.kind !== 'year' && (
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} />
            Текущий период — по нему открываются журналы и сводки
          </label>
        )}
        {end < start && (
          <p className="rounded-[12px] bg-[#FDECEC] p-2.5 text-[12.5px] text-[#8E2226]">
            Конец периода раньше начала — так сохранить не получится.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button
            className="cf-btn-brand px-4"
            disabled={busy || !name.trim() || end < start}
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
  holiday?: SchoolHoliday
  onClose: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(holiday?.name ?? '')
  const [start, setStart] = useState(holiday?.start_date ?? '')
  const [end, setEnd] = useState(holiday?.end_date ?? '')
  const [busy, setBusy] = useState(false)

  return (
    <Modal open onClose={onClose} title={holiday ? 'Каникулы' : 'Новые каникулы'} size="sm">
      <div className="space-y-3">
        <div>
          <span className="mb-1 block text-[12.5px] text-ink-2">Название</span>
          <input
            className="cf-input w-full"
            placeholder="Осенние каникулы"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-[12.5px] text-ink-2">С</span>
            <input type="date" className="cf-input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <span className="mb-1 block text-[12.5px] text-ink-2">По</span>
            <input type="date" className="cf-input w-full" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button
            className="cf-btn-brand px-4"
            disabled={busy || !name.trim() || !start || !end || end < start}
            onClick={async () => {
              if (!school.schoolId) return
              setBusy(true)
              try {
                if (holiday) {
                  await db.updateHoliday(holiday.id, { name: name.trim(), start_date: start, end_date: end })
                } else {
                  await db.createHoliday(school.schoolId, name.trim(), start, end)
                }
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
