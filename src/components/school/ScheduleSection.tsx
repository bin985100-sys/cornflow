import { useMemo, useState } from 'react'
import { Clock, Plus, Trash2, Wand2, X } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/primitives'
import { WEEKDAY_FULL, WEEKDAY_SHORT } from '@/lib/schedule'
import { cx } from '@/lib/utils'
import type { SchoolApi } from '@/hooks/useSchool'
import type { BellSlot, ScheduleEntry, TeachingAssignment } from '@/lib/types'

const DAYS = [1, 2, 3, 4, 5, 6]

/**
 * Сетка звонков и расстановка курсов по ячейкам.
 *
 * Одна сетка на школу и одна расстановка: из них собирается и расписание
 * ученика, и расписание учителя. Два отдельных расписания неизбежно
 * разъехались бы.
 */
export function ScheduleSection({ school }: { school: SchoolApi }) {
  const toast = useToast()
  const [bells, setBells] = useState(false)
  const [cell, setCell] = useState<{ weekday: number; slot: BellSlot } | null>(null)
  const termId = school.currentTerm?.id ?? null

  const entries = useMemo(
    () => school.schedule.filter((e) => (e.term_id ?? null) === termId),
    [school.schedule, termId],
  )

  if (school.bells.length === 0) {
    return (
      <section className="space-y-4">
        <EmptyState
          title="Сначала сетка звонков"
          description="Расписание ставится в ячейки «день × номер урока», а номера и время берутся из сетки звонков. Готовая сетка — восемь уроков по 45 минут."
        />
        {school.isAdmin && (
          <div className="flex justify-center gap-2">
            <button
              className="cf-btn-brand px-4"
              onClick={async () => {
                if (!school.schoolId) return
                try {
                  await db.createBellPreset(school.schoolId)
                  await school.refresh()
                } catch (e) {
                  toast.error(e)
                }
              }}
            >
              <Wand2 size={15} /> Готовая сетка
            </button>
            <button className="cf-btn-ghost px-4" onClick={() => setBells(true)}>
              <Clock size={15} /> Завести вручную
            </button>
          </div>
        )}
        {bells && <BellsModal school={school} onClose={() => setBells(false)} />}
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="cf-card flex flex-wrap items-center gap-2 p-3">
        <span className="text-[13px] text-ink-2">
          {school.currentTerm ? `Период: ${school.currentTerm.name}` : 'Период не выбран — расписание общее'}
        </span>
        <span className="text-[12.5px] text-ink-3">· уроков в сетке: {school.bells.length}</span>
        {school.isAdmin && (
          <button className="cf-btn-ghost ml-auto px-3 text-[12.5px]" onClick={() => setBells(true)}>
            <Clock size={14} /> Сетка звонков
          </button>
        )}
      </div>

      <div className="cf-no-scrollbar overflow-x-auto">
        <table className="w-full min-w-[840px] table-fixed border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-[96px] text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                Урок
              </th>
              {DAYS.map((d) => (
                <th
                  key={d}
                  className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"
                >
                  {WEEKDAY_SHORT[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {school.bells.map((slot) => (
              <tr key={slot.id}>
                <td className="align-top">
                  <div className="rounded-[12px] bg-surface-2 px-2 py-1.5">
                    <span className="block text-[12.5px] font-semibold">{slot.position + 1} урок</span>
                    <span className="block font-mono text-[11px] text-ink-3">
                      {slot.starts_at}–{slot.ends_at}
                    </span>
                  </div>
                </td>
                {DAYS.map((d) => {
                  const here = entries.filter((e) => e.weekday === d && e.slot_id === slot.id)
                  return (
                    <td key={d} className="align-top">
                      <button
                        disabled={!school.isAdmin}
                        onClick={() => setCell({ weekday: d, slot })}
                        className={cx(
                          'min-h-[52px] w-full rounded-[12px] border border-line p-1.5 text-left transition-colors',
                          school.isAdmin && 'hover:border-brand/40 hover:bg-surface-2',
                        )}
                      >
                        {here.length === 0 ? (
                          <span className="text-[11.5px] text-ink-3">{school.isAdmin ? '+' : '—'}</span>
                        ) : (
                          here.map((e) => <Chip key={e.id} entry={e} school={school} />)
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-ink-3">
        Один курс можно поставить в несколько ячеек. Накладки — когда учитель или кабинет заняты —
        подсвечиваются, но не запрещаются: иногда их ставят сознательно.
      </p>

      {bells && <BellsModal school={school} onClose={() => setBells(false)} />}
      {cell && (
        <CellModal
          school={school}
          weekday={cell.weekday}
          slot={cell.slot}
          termId={termId}
          onClose={() => setCell(null)}
        />
      )}
    </section>
  )
}

function Chip({ entry, school }: { entry: ScheduleEntry; school: SchoolApi }) {
  const a = school.assignments.find((x) => x.id === entry.assignment_id)
  const subject = school.subjects.find((s) => s.id === a?.subject_id)
  const group = school.groups.find((g) => g.id === a?.group_id)
  return (
    <span className="mb-0.5 block truncate rounded-[9px] bg-brand-soft px-1.5 py-1 text-[11.5px] font-medium text-brand">
      {subject?.name ?? 'предмет'}
      <span className="block truncate font-normal opacity-80">
        {group?.name}
        {entry.room ? ` · ${entry.room}` : ''}
      </span>
    </span>
  )
}

/* ------------------------------ сетка звонков ----------------------------- */

function BellsModal({ school, onClose }: { school: SchoolApi; onClose: () => void }) {
  const toast = useToast()
  const [from, setFrom] = useState('08:30')
  const [to, setTo] = useState('09:15')

  async function add() {
    if (!school.schoolId) return
    try {
      await db.createBellSlot({
        school_id: school.schoolId,
        position: school.bells.length,
        starts_at: from,
        ends_at: to,
      })
      await school.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <Modal open onClose={onClose} title="Сетка звонков">
      <div className="space-y-3">
        <p className="text-[12.5px] text-ink-3">
          Номера уроков и время. Расписание ставится в эти ячейки, а ученик видит, во сколько ему
          приходить.
        </p>

        <ul className="space-y-1">
          {school.bells.map((slot) => (
            <li
              key={slot.id}
              className="flex items-center gap-2 rounded-[14px] border border-line px-3 py-2"
            >
              <span className="w-[62px] shrink-0 text-[12.5px] font-semibold">{slot.position + 1} урок</span>
              <input
                type="time"
                className="cf-input h-8 w-[110px] py-0 text-[12.5px]"
                defaultValue={slot.starts_at}
                onBlur={async (e) => {
                  try {
                    await db.updateBellSlot(slot.id, { starts_at: e.target.value })
                    await school.refresh()
                  } catch (err) {
                    toast.error(err)
                  }
                }}
              />
              <input
                type="time"
                className="cf-input h-8 w-[110px] py-0 text-[12.5px]"
                defaultValue={slot.ends_at}
                onBlur={async (e) => {
                  try {
                    await db.updateBellSlot(slot.id, { ends_at: e.target.value })
                    await school.refresh()
                  } catch (err) {
                    toast.error(err)
                  }
                }}
              />
              <button
                className="ml-auto text-ink-3 transition-colors hover:text-red-500"
                title="Убрать урок из сетки вместе с его ячейками"
                onClick={async () => {
                  try {
                    await db.deleteBellSlot(slot.id)
                    await school.refresh()
                  } catch (e) {
                    toast.error(e)
                  }
                }}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="time"
            className="cf-input w-[120px]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            type="time"
            className="cf-input w-[120px]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <button className="cf-btn-ghost px-3 text-[12.5px]" onClick={() => void add()}>
            <Plus size={14} /> Урок
          </button>
        </div>

        <div className="flex justify-end pt-1">
          <button className="cf-btn-brand px-4" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* -------------------------------- ячейка ---------------------------------- */

function CellModal({
  school,
  weekday,
  slot,
  termId,
  onClose,
}: {
  school: SchoolApi
  weekday: number
  slot: BellSlot
  termId: string | null
  onClose: () => void
}) {
  const toast = useToast()
  const [assignmentId, setAssignmentId] = useState('')
  const [room, setRoom] = useState('')
  const [confirm, setConfirm] = useState<ScheduleEntry | null>(null)

  const here = school.schedule.filter(
    (e) => e.weekday === weekday && e.slot_id === slot.id && (e.term_id ?? null) === termId,
  )

  // занятость в этой же ячейке: учитель не разорвётся, кабинет не раздвоится
  const busyTeachers = useMemo(() => {
    const names = new Map<string, string>()
    for (const e of here) {
      const a = school.assignments.find((x) => x.id === e.assignment_id)
      for (const t of a?.teacher_ids ?? []) {
        const p = school.people.find((x) => x.id === t)
        if (p) names.set(t, school.fullName(p))
      }
    }
    return names
  }, [here, school])

  function label(a: TeachingAssignment) {
    const subject = school.subjects.find((s) => s.id === a.subject_id)
    const group = school.groups.find((g) => g.id === a.group_id)
    return `${subject?.name ?? 'предмет'} · ${group?.name ?? ''}`
  }

  const clash = useMemo(() => {
    const a = school.assignments.find((x) => x.id === assignmentId)
    if (!a) return null
    const hit = (a.teacher_ids ?? []).find((t) => busyTeachers.has(t))
    return hit ? busyTeachers.get(hit)! : null
  }, [assignmentId, busyTeachers, school.assignments])

  async function place() {
    if (!school.schoolId || !assignmentId) return
    try {
      await db.placeLesson({
        school_id: school.schoolId,
        assignment_id: assignmentId,
        term_id: termId,
        weekday,
        slot_id: slot.id,
        room: room.trim() || null,
      })
      setAssignmentId('')
      setRoom('')
      await school.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${WEEKDAY_FULL[weekday]}, ${slot.position + 1} урок`}
      subtitle={`${slot.starts_at}–${slot.ends_at}`}
    >
      <div className="space-y-3">
        {here.length > 0 && (
          <ul className="space-y-1">
            {here.map((e) => {
              const a = school.assignments.find((x) => x.id === e.assignment_id)
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-[14px] border border-line px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {a ? label(a) : 'курс удалён'}
                    {e.room && <span className="text-ink-3"> · {e.room}</span>}
                  </span>
                  {school.isAdmin && (
                    <button
                      className="text-ink-3 transition-colors hover:text-red-500"
                      onClick={() => setConfirm(e)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {school.isAdmin && (
          <>
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-ink-2">Курс</span>
              <select
                className="cf-input w-full"
                value={assignmentId}
                onChange={(e) => setAssignmentId(e.target.value)}
              >
                <option value="">выберите курс</option>
                {school.assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {label(a)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[12.5px] text-ink-2">Кабинет</span>
              <input
                className="cf-input w-full"
                placeholder="214"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              />
            </label>

            {clash && (
              <p className="rounded-[14px] bg-canvas px-3 py-2 text-[12.5px] text-amber-600">
                В этой ячейке уже занят {clash}. Поставить всё равно можно — но проверьте, так ли
                задумано.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button className="cf-btn-ghost px-4" onClick={onClose}>
                Закрыть
              </button>
              <button className="cf-btn-brand px-4" disabled={!assignmentId} onClick={() => void place()}>
                <Plus size={15} /> Поставить
              </button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Убрать из расписания?"
        description="Ячейка освободится. Журнал и оценки курса останутся на месте."
        confirmLabel="Убрать"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          try {
            await db.removePlacement(confirm.id)
            await school.refresh()
          } catch (e) {
            toast.error(e)
          } finally {
            setConfirm(null)
          }
        }}
      />
    </Modal>
  )
}
