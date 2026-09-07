import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useGradebook } from '@/hooks/useGradebook'
import { useAuth } from '@/context/AuthContext'
import { useCreate } from '@/context/CreateContext'
import type { CalendarEvent } from '@/lib/types'
import {
  MONTHS_NOM,
  WEEKDAYS_SHORT,
  cx,
  dueLabel,
  formatTime,
  monthGrid,
  sameDay,
  startOfDay,
  startOfWeek,
} from '@/lib/utils'
import { CalendarChip } from '@/components/assignments/AssignmentCard'
import { EmptyState, EventChip, Segmented } from '@/components/ui/primitives'

type Mode = 'month' | 'week'

export function CalendarPage() {
  const { allAssignments, tasks, spaces, loading } = useApp()
  const gb = useGradebook()
  const { isTeacher } = useAuth()
  const create = useCreate()
  const [cursor, setCursor] = useState(() => new Date())
  const [mode, setMode] = useState<Mode>('month')
  const [selected, setSelected] = useState<Date>(() => startOfDay(new Date()))

  const events = useMemo<CalendarEvent[]>(() => {
    const fromAssignments: CalendarEvent[] = allAssignments
      .filter((a) => a.due_date)
      .map((a) => ({
        id: `a_${a.id}`,
        title: a.title,
        date: a.due_date as string,
        kind: 'assignment',
        spaceId: a.space_id,
        color: spaces.find((s) => s.id === a.space_id)?.color ?? 'blue',
        ref: a,
      }))
    const fromTasks: CalendarEvent[] = tasks
      .filter((t) => t.due_date)
      .map((t) => ({
        id: `t_${t.id}`,
        title: t.title,
        date: t.due_date as string,
        kind: 'task',
        spaceId: t.space_id,
        color: 'green',
        done: t.done,
        ref: t,
      }))
    // Работы журнала — тоже события календаря
    const fromGrades: CalendarEvent[] = gb.items.map((i) => ({
      id: `g_${i.id}`,
      title: i.title,
      date: `${i.date.slice(0, 10)}T12:00:00.000Z`,
      kind: 'grade',
      spaceId: i.space_id,
      color: spaces.find((s) => s.id === i.space_id)?.color ?? 'purple',
      ref: i,
    }))
    return [...fromAssignments, ...fromTasks, ...fromGrades]
  }, [allAssignments, tasks, spaces, gb.items])

  const eventsOn = (day: Date) => events.filter((e) => sameDay(e.date, day))

  const days = useMemo(() => {
    if (mode === 'month') return monthGrid(cursor.getFullYear(), cursor.getMonth())
    const start = startOfWeek(cursor)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor, mode])

  const shift = (dir: number) => {
    const next = new Date(cursor)
    if (mode === 'month') next.setMonth(next.getMonth() + dir)
    else next.setDate(next.getDate() + dir * 7)
    setCursor(next)
  }

  const selectedEvents = eventsOn(selected)
  const today = startOfDay(new Date())

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-5 py-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">
            {MONTHS_NOM[cursor.getMonth()]} {cursor.getFullYear()}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Дедлайны заданий, работы журнала и личные задачи
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Segmented
            value={mode}
            onChange={setMode}
            size="sm"
            options={[
              { value: 'month', label: 'Месяц' },
              { value: 'week', label: 'Неделя' },
            ]}
          />
          <div className="flex items-center gap-1">
            <button className="cf-icon-btn" onClick={() => shift(-1)} aria-label="Назад">
              <ChevronLeft size={16} />
            </button>
            <button
              className="cf-btn-ghost px-3 py-2 text-[13px]"
              onClick={() => {
                setCursor(new Date())
                setSelected(startOfDay(new Date()))
              }}
            >
              Сегодня
            </button>
            <button className="cf-icon-btn" onClick={() => shift(1)} aria-label="Вперёд">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        {/* ------------------------------- сетка ------------------------------ */}
        <div className="cf-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-surface-2/50">
            {WEEKDAYS_SHORT.map((d) => (
              <div key={d} className="px-2 py-2.5 text-center text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
                {d}
              </div>
            ))}
          </div>

          <div className={cx('grid grid-cols-7', mode === 'month' ? 'grid-rows-6' : 'grid-rows-1')}>
            {days.map((day, i) => {
              const dayEvents = eventsOn(day)
              const inMonth = mode === 'week' || day.getMonth() === cursor.getMonth()
              const isToday = sameDay(day, today)
              const isSelected = sameDay(day, selected)
              return (
                <button
                  key={i}
                  onClick={() => setSelected(startOfDay(day))}
                  className={cx(
                    'flex min-h-[92px] flex-col gap-1 border-b border-r border-line p-1.5 text-left transition duration-200',
                    mode === 'week' && 'min-h-[220px]',
                    !inMonth && 'bg-canvas/60',
                    isSelected ? 'bg-brand-soft' : 'hover:bg-surface-2',
                    (i + 1) % 7 === 0 && 'border-r-0',
                    i >= days.length - 7 && 'border-b-0',
                  )}
                >
                  <span
                    className={cx(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold',
                      isToday ? 'bg-brand text-white' : inMonth ? 'text-ink' : 'text-ink-3',
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <div className="flex flex-col gap-1 overflow-hidden">
                    {dayEvents.slice(0, mode === 'week' ? 8 : 2).map((e) => (
                      <CalendarChip
                        key={e.id}
                        kind={e.kind}
                        tone={e.kind === 'task' && e.done ? 'ok' : dueLabel(e.date).tone}
                        label={e.title}
                        onClick={() => {
                          if (e.kind === 'assignment') create.openAssignment(e.ref as never)
                          else setSelected(startOfDay(day))
                        }}
                      />
                    ))}
                    {dayEvents.length > (mode === 'week' ? 8 : 2) && (
                      <span className="px-1 text-[11px] text-ink-3">
                        +{dayEvents.length - (mode === 'week' ? 8 : 2)} ещё
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ------------------------------ день -------------------------------- */}
        <aside className="space-y-3">
          <div className="cf-card p-4">
            <h2 className="text-[15px]">
              {selected.getDate()} {MONTHS_NOM[selected.getMonth()].toLowerCase()}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-3">
              {selectedEvents.length ? `Событий: ${selectedEvents.length}` : 'Событий нет'}
            </p>

            <div className="mt-3.5 space-y-2.5">
              {selectedEvents.length === 0 && !loading && (
                <p className="rounded-[18px] border border-dashed border-line px-3 py-6 text-center text-[13px] text-ink-3">
                  Свободный день
                </p>
              )}
              {selectedEvents.map((e) => (
                <button
                  key={e.id}
                  onClick={() => e.kind === 'assignment' && create.openAssignment(e.ref as never)}
                  className="w-full rounded-[18px] border border-line bg-surface p-3 text-left transition duration-200 hover:border-brand/30 hover:shadow-[0_2px_10px_-6px_rgba(16,24,40,.3)]"
                >
                  <p className="text-[13.5px] font-medium text-ink">{e.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <EventChip icon={CalendarDays} color="blue">
                      {e.kind === 'assignment' ? 'Дедлайн' : e.kind === 'grade' ? 'Работа в журнале' : 'Задача'}
                    </EventChip>
                    {e.kind !== 'grade' && (
                      <EventChip icon={Clock} color="purple">
                        {formatTime(e.date)}
                      </EventChip>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {isTeacher && (
            <button className="cf-btn-brand w-full" onClick={create.newAssignment}>
              <Plus size={16} /> Новое задание
            </button>
          )}

          {events.length === 0 && !loading && (
            <EmptyState
              art="calendar"
              title="Календарь пуст"
              description="Задания с дедлайнами и задачи с датой появятся здесь автоматически."
            />
          )}
        </aside>
      </div>
    </div>
  )
}
