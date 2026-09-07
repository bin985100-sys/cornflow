import { useMemo, useState } from 'react'
import { CalendarCheck2, ChevronLeft, ChevronRight, Download, Users } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { Avatar, EmptyState } from '@/components/ui/primitives'
import { ATTENDANCE_META, attendanceStats, downloadCsv, gradePalette, toCsv } from '@/lib/grading'
import { cx, formatDate } from '@/lib/utils'
import type { AttendanceStatus } from '@/lib/types'
import type { GradebookApi } from '@/hooks/useGradebook'

const ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused']

/** Отметка посещаемости: один день целиком + сводка за период. */
export function AttendanceBoard({ gb }: { gb: GradebookApi }) {
  const toast = useToast()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const { students, canEdit } = gb

  const dayRows = useMemo(
    () => gb.attendance.filter((a) => a.date === date),
    [gb.attendance, date],
  )

  const periodDates = useMemo(() => {
    const set = new Set(gb.attendance.map((a) => a.date))
    return [...set].sort().reverse()
  }, [gb.attendance])

  async function mark(studentId: string, status: AttendanceStatus) {
    if (!gb.spaceId) return
    try {
      const existing = dayRows.find((a) => a.student_id === studentId)
      if (existing && existing.status === status) await db.clearAttendance(gb.spaceId, studentId, date)
      else await db.setAttendance(gb.spaceId, studentId, date, status)
      await gb.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  async function markAllPresent() {
    if (!gb.spaceId) return
    try {
      for (const s of students) {
        if (!dayRows.some((a) => a.student_id === s.id)) {
          await db.setAttendance(gb.spaceId, s.id, date, 'present')
        }
      }
      await gb.refresh()
      toast.success('Все отмечены присутствующими')
    } catch (e) {
      toast.error(e)
    }
  }

  function exportCsv() {
    const header = ['Ученик', ...periodDates.map(formatDate), 'Посещаемость %']
    const rows: Array<Array<string | number | null>> = [header]
    for (const s of students) {
      const own = gb.attendance.filter((a) => a.student_id === s.id)
      rows.push([
        s.name,
        ...periodDates.map((d) => {
          const row = own.find((a) => a.date === d)
          return row ? ATTENDANCE_META[row.status].short : ''
        }),
        Math.round(attendanceStats(own).rate),
      ])
    }
    downloadCsv('cornflow-посещаемость.csv', toCsv(rows))
  }

  function shiftDay(delta: number) {
    const d = new Date(`${date}T12:00`)
    d.setDate(d.getDate() + delta)
    setDate(d.toISOString().slice(0, 10))
  }

  if (!students.length) {
    return <EmptyState title="Нет учеников" description="Пригласите учеников по коду пространства." art="tasks" />
  }

  return (
    <div className="space-y-5">
      <div className="cf-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button className="cf-icon-btn" onClick={() => shiftDay(-1)} aria-label="Предыдущий день">
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              className="cf-input py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button className="cf-icon-btn" onClick={() => shiftDay(1)} aria-label="Следующий день">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="cf-btn-ghost" onClick={exportCsv} disabled={!periodDates.length}>
              <Download size={15} /> CSV
            </button>
            {canEdit && (
              <button className="cf-btn-brand" onClick={markAllPresent}>
                <CalendarCheck2 size={15} /> Все на месте
              </button>
            )}
          </div>
        </div>

        <ul className="mt-4 divide-y divide-line">
          {students.map((s) => {
            const row = dayRows.find((a) => a.student_id === s.id)
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar name={s.name} src={s.avatar} size={28} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{s.name}</span>
                <div className="flex items-center gap-1.5">
                  {ORDER.map((status) => {
                    const meta = ATTENDANCE_META[status]
                    const on = row?.status === status
                    return (
                      <button
                        key={status}
                        disabled={!canEdit}
                        onClick={() => mark(s.id, status)}
                        title={meta.label}
                        className={cx(
                          'inline-flex h-8 min-w-[34px] items-center justify-center rounded-[11px] border px-2 text-[12px] font-bold transition',
                          on ? 'scale-105' : 'border-line bg-surface text-ink-3 hover:bg-surface-2',
                          !canEdit && 'cursor-default opacity-70',
                        )}
                        style={
                          on
                            ? {
                                background: gradePalette[meta.color].bg,
                                color: gradePalette[meta.color].fg,
                                borderColor: `color-mix(in srgb, ${gradePalette[meta.color].fg} 34%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        {meta.short}
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <section className="cf-card p-4">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
          <Users size={15} /> Сводка за всё время
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-3">
                <th className="py-2 font-medium">Ученик</th>
                <th className="py-2 text-center font-medium">Был</th>
                <th className="py-2 text-center font-medium">Опоздал</th>
                <th className="py-2 text-center font-medium">Не был</th>
                <th className="py-2 text-center font-medium">Уваж.</th>
                <th className="py-2 text-right font-medium">Посещаемость</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {students.map((s) => {
                const st = attendanceStats(gb.attendance.filter((a) => a.student_id === s.id))
                return (
                  <tr key={s.id}>
                    <td className="py-2 font-medium">{s.name}</td>
                    <td className="py-2 text-center">{st.present}</td>
                    <td className="py-2 text-center">{st.late}</td>
                    <td className="py-2 text-center">{st.absent}</td>
                    <td className="py-2 text-center">{st.excused}</td>
                    <td className="py-2 text-right font-semibold">
                      {st.total ? `${Math.round(st.rate)}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
