import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useCreate } from '@/context/CreateContext'
import { dueLabel, normalize, plural } from '@/lib/utils'
import { AssignmentCard } from '@/components/assignments/AssignmentCard'
import { CardSkeletonGrid, EmptyState, Segmented } from '@/components/ui/primitives'

type Filter = 'all' | 'upcoming' | 'done' | 'late'

/**
 * По чему раскладывать список.
 *
 * Два среза нужны обоим: ученику важно, что сдавать первым (дедлайн), а
 * учителю — что он выдал последним (дата выдачи).
 */
type Slice = 'due' | 'assigned'

export function AssignmentsPage() {
  const { assignments, loading, canManage, showAssignments, query, space } = useApp()
  const create = useCreate()
  const [filter, setFilter] = useState<Filter>('all')
  const [slice, setSlice] = useState<Slice>('due')

  const visible = useMemo(() => {
    const q = normalize(query)
    return assignments.filter((a) => {
      if (q && !normalize(`${a.title} ${a.description ?? ''}`).includes(q)) return false
      const due = dueLabel(a.due_date)
      const submitted = Boolean(a.mySubmission && a.mySubmission.status !== 'assigned')
      switch (filter) {
        case 'upcoming':
          return due.tone === 'soon'
        case 'late':
          return due.tone === 'late' && !submitted
        case 'done':
          return canManage ? a.submissions.some((s) => s.status !== 'assigned') : submitted
        default:
          return true
      }
    })
  }, [assignments, query, filter, canManage])

  const sorted = useMemo(() => {
    const rows = [...visible]
    if (slice === 'assigned') {
      // по дате выдачи: свежее сверху
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    // по сроку сдачи: ближайшее сверху, бессрочные в конец
    return rows.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })
  }, [visible, slice])

  if (!showAssignments) {
    return (
      <div className="mx-auto max-w-[1400px] px-5 py-6 lg:px-8">
        <EmptyState
          art="search"
          title="Задания скрыты"
          description="Преподаватель временно закрыл этот раздел в настройках пространства."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-5 py-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Задания</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {space?.name} · {plural(visible.length, 'задание', 'задания', 'заданий')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={slice}
            onChange={setSlice}
            size="sm"
            options={[
              { value: 'due', label: 'По сроку' },
              { value: 'assigned', label: 'По выдаче' },
            ]}
          />
          <Segmented
            value={filter}
            onChange={setFilter}
            size="sm"
            options={[
              { value: 'all', label: 'Все' },
              { value: 'upcoming', label: 'Скоро' },
              { value: 'late', label: 'Просрочено' },
              { value: 'done', label: canManage ? 'Есть сдачи' : 'Сдано' },
            ]}
          />
          {canManage && (
            <button className="cf-btn-brand" onClick={create.newAssignment}>
              <Plus size={17} strokeWidth={2.6} /> Задание
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <CardSkeletonGrid count={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          art="calendar"
          title={filter === 'all' ? 'Заданий пока нет' : 'Ничего не подходит под фильтр'}
          description={
            canManage
              ? 'Создайте задание с дедлайном и прикрепите к нему материалы — ученики увидят его в календаре.'
              : 'Как только преподаватель добавит задание, оно появится здесь и в календаре.'
          }
          action={
            canManage ? (
              <button className="cf-btn-brand" onClick={create.newAssignment}>
                Создать задание
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((a, i) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              index={i}
              isTeacher={canManage}
              onOpen={() => create.openAssignment(a)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
