import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, GraduationCap } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useGradebook } from '@/hooks/useGradebook'
import { aggregateFor, colorForGrade, gradeLabel, gradePalette, trimNumber } from '@/lib/grading'
import { formatDate } from '@/lib/utils'

/** Компактная карточка журнала для дашборда. */
export function GradebookWidget() {
  const gb = useGradebook()
  const { user } = useAuth()

  const myId = user?.id ?? ''
  const agg = useMemo(
    () =>
      aggregateFor(myId, {
        items: gb.periodItems,
        grades: gb.grades,
        categories: gb.categories,
        scaleFor: gb.scaleFor,
      }),
    [myId, gb.periodItems, gb.grades, gb.categories, gb.scaleFor],
  )

  const latest = useMemo(() => {
    return gb.periodItems
      .map((item) => ({
        item,
        grade: gb.grades.find((g) => g.item_id === item.id && g.student_id === myId),
      }))
      .filter((r) => !!r.grade)
      .sort((a, b) => b.item.date.localeCompare(a.item.date))
      .slice(0, 5)
  }, [gb.periodItems, gb.grades, myId])

  const classAverage = useMemo(() => {
    const values = gb.students
      .map(
        (s) =>
          aggregateFor(s.id, {
            items: gb.periodItems,
            grades: gb.grades,
            categories: gb.categories,
            scaleFor: gb.scaleFor,
          }).percent,
      )
      .filter((v): v is number => v !== null)
    if (!values.length) return null
    return values.reduce((a, b) => a + b, 0) / values.length
  }, [gb.students, gb.periodItems, gb.grades, gb.categories, gb.scaleFor])

  const missing = useMemo(() => {
    let n = 0
    for (const item of gb.periodItems) {
      for (const s of gb.students) {
        if (!gb.grades.some((g) => g.item_id === item.id && g.student_id === s.id)) n += 1
      }
    }
    return n
  }, [gb.periodItems, gb.students, gb.grades])

  if (gb.loading || !gb.spaceId) return null
  if (!gb.periodItems.length) return null

  return (
    <section className="cf-card animate-fade-up p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold">
          <GraduationCap size={17} className="text-brand" />
          {gb.canEdit ? 'Журнал' : 'Мои оценки'}
          {gb.period && <span className="text-[12.5px] font-normal text-ink-3">· {gb.period.name}</span>}
        </h2>
        <Link to="/app/gradebook" className="cf-btn-ghost px-3 py-1.5 text-[12.5px]">
          Открыть <ArrowRight size={14} />
        </Link>
      </header>

      {gb.canEdit ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Работ в периоде" value={String(gb.periodItems.length)} />
          <Metric label="Учеников" value={String(gb.students.length)} />
          <Metric
            label="Средний балл класса"
            value={classAverage === null ? '—' : trimNumber(Math.round(classAverage * 100) / 100)}
          />
          <Metric label="Не выставлено" value={String(missing)} accent={missing > 0} />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Средний балл</p>
            <p className="mt-1 text-[26px] font-bold leading-none">
              {agg.average === null ? '—' : trimNumber(Math.round(agg.average * 100) / 100)}
              <span className="ml-1.5 text-[14px] font-medium text-ink-3">
                из {trimNumber(gb.defaultScale.max_value)}
              </span>
            </p>
          </div>
          {agg.level && (
            <span
              className="inline-flex h-11 min-w-[46px] items-center justify-center rounded-[14px] px-3 text-[18px] font-bold"
              style={{
                background: gradePalette[agg.level.color].bg,
                color: gradePalette[agg.level.color].fg,
              }}
            >
              {agg.level.label}
            </span>
          )}
          <div className="ml-auto">
            <p className="mb-1 text-right text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
              Последние оценки
            </p>
            <div className="flex flex-wrap justify-end gap-1.5">
            {latest.map(({ item, grade }) => {
              if (!grade) return null
              const scale = gb.scaleFor(item)
              const color = colorForGrade(grade, item, scale)
              return (
                <span
                  key={item.id}
                  title={`${item.title} · ${formatDate(item.date)}`}
                  className="inline-flex h-9 min-w-[36px] items-center justify-center rounded-[11px] px-2 text-[14px] font-bold"
                  style={{ background: gradePalette[color].bg, color: gradePalette[color].fg }}
                >
                  {gradeLabel(grade, item, scale)}
                </span>
              )
            })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[16px] border border-line bg-canvas/60 p-3">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p
        className="mt-1 text-[22px] font-bold leading-none"
        style={accent ? { color: 'var(--cf-red-acc)' } : undefined}
      >
        {value}
      </p>
    </div>
  )
}
