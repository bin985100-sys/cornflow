import { useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { cx, dueLabel, formatDate, plural } from '@/lib/utils'
import { EmptyState, EventChip, ProgressBar, RowSkeleton, Segmented } from '@/components/ui/primitives'

type Filter = 'open' | 'done' | 'all'

export function TasksPage() {
  const { tasks, loading, refresh, space, query } = useApp()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [filter, setFilter] = useState<Filter>('open')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q)) return false
      if (filter === 'open') return !t.done
      if (filter === 'done') return t.done
      return true
    })
  }, [tasks, filter, query])

  const doneCount = tasks.filter((t) => t.done).length
  const percent = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await db.createTask({
        title: title.trim(),
        due_date: due ? new Date(`${due}T12:00`).toISOString() : null,
        space_id: space?.id ?? null,
      })
      setTitle('')
      setDue('')
      await refresh()
    } catch (e2) {
      toast.error(e2)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-5 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Задачи</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Личный список дел · выполнено {doneCount} из {tasks.length}
          </p>
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: 'open', label: 'Активные' },
            { value: 'done', label: 'Выполненные' },
            { value: 'all', label: 'Все' },
          ]}
        />
      </header>

      {tasks.length > 0 && <ProgressBar value={percent} color="green" />}

      <form
        onSubmit={add}
        className="flex flex-wrap items-center gap-2 rounded-pill border border-line bg-surface p-2 shadow-card transition duration-200 focus-within:border-brand focus-within:shadow-[0_0_0_4px_rgb(var(--cf-brand)/0.1)]"
      >
        <input
          className="min-w-[180px] flex-1 bg-transparent px-3 py-2 text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Что нужно сделать?"
        />
        <label className="flex items-center gap-1.5 rounded-pill border border-line bg-canvas px-3 py-1.5 text-[12.5px] text-ink-3 transition duration-200 hover:border-brand/30">
          <CalendarDays size={14} />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="bg-transparent text-[12.5px] focus:outline-none"
          />
        </label>
        <button className="cf-btn-brand h-10 w-10 px-0" disabled={!title.trim()} aria-label="Добавить задачу">
          <Plus size={17} strokeWidth={2.6} />
        </button>
      </form>

      {loading ? (
        <RowSkeleton count={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          art="tasks"
          title={filter === 'done' ? 'Выполненных задач нет' : 'Список пуст'}
          description="Добавьте задачу выше — например, «дорешать задачи 4.12–4.20»."
        />
      ) : (
        <ul className="cf-card divide-y divide-line overflow-hidden">
          {visible.map((t) => {
            const due2 = dueLabel(t.due_date)
            return (
              <li
                key={t.id}
                className="group flex animate-fade-in items-center gap-3 px-4 py-3 transition duration-200 hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={async () => {
                    try {
                      await db.updateTask(t.id, { done: !t.done })
                      await refresh()
                    } catch (e) {
                      toast.error(e)
                    }
                  }}
                  className="h-[18px] w-[18px] shrink-0 accent-[rgb(var(--cf-brand))]"
                />
                <span
                  className={cx(
                    'min-w-0 flex-1 text-[14px]',
                    t.done ? 'text-ink-3 line-through' : 'text-ink',
                  )}
                >
                  {t.title}
                </span>
                {t.due_date && !t.done && (
                  <EventChip
                    icon={CalendarDays}
                    color={due2.tone === 'late' ? 'red' : due2.tone === 'soon' ? 'orange' : 'blue'}
                  >
                    {formatDate(t.due_date)}
                  </EventChip>
                )}
                <button
                  onClick={async () => {
                    try {
                      await db.deleteTask(t.id)
                      await refresh()
                    } catch (e) {
                      toast.error(e)
                    }
                  }}
                  className="shrink-0 rounded-full p-1.5 text-ink-3 opacity-0 transition hover:bg-black/5 hover:text-[color:var(--cf-red-acc)] group-hover:opacity-100"
                  aria-label="Удалить задачу"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {tasks.length > 0 && (
        <p className="text-center text-[12.5px] text-ink-3">
          {plural(tasks.filter((t) => !t.done).length, 'активная задача', 'активные задачи', 'активных задач')}
        </p>
      )}
    </div>
  )
}
