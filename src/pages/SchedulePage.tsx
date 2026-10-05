import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Palmtree } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { CardSkeletonGrid, EmptyState } from '@/components/ui/primitives'
import { WEEKDAY_FULL, addDays, openingMonday } from '@/lib/schedule'
import { cx, formatDate } from '@/lib/utils'
import type { ScheduleDay } from '@/lib/types'

/**
 * Расписание на неделю — одно и то же для ученика и учителя.
 *
 * Ученик видит свои группы, учитель — свои курсы; собирается это из одной
 * сетки, которую ставит администратор. Каникулы вырезаны: в такой день
 * показано, какие именно, а не пустота без объяснения.
 */
export function SchedulePage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [monday, setMonday] = useState(() => openingMonday())
  const [days, setDays] = useState<ScheduleDay[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDays(await db.myWeek(monday))
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }, [monday, toast])

  useEffect(() => {
    void load()
  }, [load])

  const total = days.reduce((n, d) => n + d.lessons.length, 0)

  return (
    <div className="animate-fade-up space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">Расписание</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {formatDate(monday)} — {formatDate(addDays(monday, 5))}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className="cf-icon-btn" onClick={() => setMonday(addDays(monday, -7))} title="Прошлая неделя">
            <ChevronLeft size={16} />
          </button>
          <button
            className="cf-btn-ghost px-3 text-[12.5px]"
            onClick={() => setMonday(openingMonday())}
          >
            Эта неделя
          </button>
          <button className="cf-icon-btn" onClick={() => setMonday(addDays(monday, 7))} title="Следующая неделя">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      {loading ? (
        <CardSkeletonGrid count={3} />
      ) : total === 0 && days.every((d) => !d.holiday) ? (
        <EmptyState
          title="На эту неделю уроков нет"
          description="Расписание ставит администратор школы: сетка звонков и курсы по ячейкам. Как только он его заполнит, оно появится здесь."
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {days.map((day) => (
            <section
              key={day.date}
              className={cx(
                'cf-card p-3.5',
                day.date === today && 'border-brand/35 ring-2 ring-brand/15',
              )}
            >
              <header className="mb-2 flex items-baseline gap-2">
                <h2 className="text-[14px] font-semibold">{WEEKDAY_FULL[day.weekday]}</h2>
                <span className="text-[12px] text-ink-3">{formatDate(day.date)}</span>
                {day.date === today && (
                  <span className="cf-pill ml-auto px-2 py-[2px] text-[10.5px] text-brand">сегодня</span>
                )}
              </header>

              {day.holiday ? (
                <p className="flex items-center gap-1.5 rounded-[14px] bg-canvas px-3 py-2 text-[12.5px] text-ink-2">
                  <Palmtree size={13} className="shrink-0 text-ink-3" />
                  {day.holiday}
                </p>
              ) : day.lessons.length === 0 ? (
                <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                  <CalendarDays size={13} /> Уроков нет
                </p>
              ) : (
                <ol className="space-y-1">
                  {day.lessons.map((lesson) => (
                    <li key={lesson.entry_id}>
                      <button
                        disabled={!lesson.space_id}
                        onClick={() => {
                          if (!lesson.space_id) return
                          // журнал читает активное пространство из этого ключа
                          localStorage.setItem('cornflow.space', lesson.space_id)
                          navigate('/app/gradebook')
                        }}
                        className={cx(
                          'flex w-full items-start gap-2 rounded-[14px] px-2 py-1.5 text-left transition-colors',
                          lesson.space_id && 'hover:bg-surface-2',
                        )}
                      >
                        <span className="w-[46px] shrink-0 font-mono text-[11.5px] text-ink-3">
                          {lesson.slot.starts_at}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {lesson.subject_name}
                          </span>
                          <span className="block truncate text-[11.5px] text-ink-3">
                            {lesson.group_name}
                            {lesson.teachers ? ` · ${lesson.teachers}` : ''}
                          </span>
                        </span>
                        {lesson.room && (
                          <span className="flex shrink-0 items-center gap-0.5 text-[11.5px] text-ink-3">
                            <MapPin size={11} />
                            {lesson.room}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
