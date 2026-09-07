import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Eye, Users } from 'lucide-react'
import { db } from '@/lib/db'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import type { Progress, User } from '@/lib/types'
import { cx, plural } from '@/lib/utils'
import { Avatar, EmptyState, ProgressBar, RowSkeleton } from '@/components/ui/primitives'

type Row = Progress & { user: Pick<User, 'id' | 'name' | 'avatar'> | null }

/** Экран учителя: кто открыл материалы и кто сдал задания. */
export function ProgressPage() {
  const { space, materials, assignments } = useApp()
  const toast = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!space) return
    let alive = true
    setLoading(true)
    db.listSpaceProgress(space.id)
      .then((r) => alive && setRows(r as Row[]))
      .catch((e) => toast.error(e))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [space, materials, toast])

  const students = useMemo(
    () => (space?.members ?? []).filter((m) => m.role === 'student'),
    [space],
  )

  const perStudent = useMemo(() => {
    return students.map((s) => {
      const own = rows.filter((r) => r.user_id === s.id)
      const viewed = own.length
      const studied = own.filter((r) => r.status === 'studied').length
      const submitted = assignments.filter((a) =>
        a.submissions.some((x) => x.student_id === s.id && x.status !== 'assigned'),
      ).length
      return { student: s, viewed, studied, submitted }
    })
  }, [students, rows, assignments])

  if (!space) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <EmptyState title="Нет активного пространства" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-5 py-6 lg:px-8">
      <header>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Прогресс учеников</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {space.name} · {plural(students.length, 'ученик', 'ученика', 'учеников')} ·{' '}
          {plural(materials.length, 'материал', 'материала', 'материалов')}
        </p>
      </header>

      {loading ? (
        <RowSkeleton count={4} />
      ) : students.length === 0 ? (
        <EmptyState
          title="В пространстве пока нет учеников"
          description="Поделитесь кодом приглашения — он есть в разделе «Пригласить» в левом меню."
        />
      ) : (
        <div className="cf-card divide-y divide-line overflow-hidden">
          {perStudent.map(({ student, viewed, studied, submitted }) => {
            const percent = materials.length ? Math.round((studied / materials.length) * 100) : 0
            return (
              <div key={student.id} className="flex flex-wrap items-center gap-4 px-4 py-4">
                <Avatar name={student.name} src={student.avatar} size={38} />
                <div className="min-w-[160px] flex-1">
                  <p className="text-[14px] font-medium text-ink">{student.name}</p>
                  <p className="text-[12px] text-ink-3">
                    {student.permission === 'edit' ? 'Редактирование' : 'Просмотр'}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <Stat icon={Eye} value={viewed} label="открыл" tone="blue" />
                  <Stat icon={CheckCircle2} value={studied} label="изучил" tone="green" />
                  <Stat icon={Users} value={submitted} label="сдал" tone="purple" />
                </div>

                <div className="w-full sm:w-[180px]">
                  <div className="mb-1 flex justify-between text-[11.5px] text-ink-3">
                    <span>Изучено</span>
                    <span>{percent}%</span>
                  </div>
                  <ProgressBar value={percent} color="green" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Сдачи по заданиям */}
      {assignments.length > 0 && (
        <section>
          <h2 className="mb-3 text-[17px]">Сдачи по заданиям</h2>
          <div className="cf-card divide-y divide-line overflow-hidden">
            {assignments.map((a) => {
              const submitted = a.submissions.filter((s) => s.status !== 'assigned').length
              const percent = students.length ? Math.round((submitted / students.length) * 100) : 0
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-[13.5px] font-medium text-ink">{a.title}</p>
                    <p className="text-[11.5px] text-ink-3">
                      Сдали {submitted} из {students.length}
                    </p>
                  </div>
                  <div className="w-full sm:w-[220px]">
                    <ProgressBar value={percent} color={percent >= 70 ? 'green' : percent >= 30 ? 'yellow' : 'red'} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Eye
  value: number
  label: string
  tone: 'blue' | 'green' | 'purple'
}) {
  return (
    <div className={cx('flex items-center gap-1.5')}>
      <Icon size={15} style={{ color: `var(--cf-${tone}-acc)` }} />
      <span className="text-[14px] font-semibold text-ink">{value}</span>
      <span className="text-[12px] text-ink-3">{label}</span>
    </div>
  )
}
