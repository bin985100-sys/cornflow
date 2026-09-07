import { useMemo } from 'react'
import { Award, BarChart3, TrendingDown, TrendingUp } from 'lucide-react'
import { Avatar, EmptyState } from '@/components/ui/primitives'
import {
  aggregateFor,
  gradePalette,
  itemAverage,
  percentOf,
  sortedLevels,
  trimNumber,
} from '@/lib/grading'
import { formatDate } from '@/lib/utils'
import type { GradebookApi } from '@/hooks/useGradebook'

/** Аналитика класса: распределение отметок, динамика, сложные работы, рейтинг. */
export function AnalyticsView({ gb }: { gb: GradebookApi }) {
  const { students, periodItems: items, grades, categories, scaleFor, defaultScale } = gb

  const perStudent = useMemo(
    () =>
      students
        .map((s) => ({ student: s, agg: aggregateFor(s.id, { items, grades, categories, scaleFor }) }))
        .sort((a, b) => (b.agg.average ?? -1) - (a.agg.average ?? -1)),
    [students, items, grades, categories, scaleFor],
  )

  const distribution = useMemo(() => {
    const levels = sortedLevels(defaultScale)
    const counts = new Map<string, number>(levels.map((l) => [l.id, 0]))
    for (const row of perStudent) {
      if (row.agg.level) counts.set(row.agg.level.id, (counts.get(row.agg.level.id) ?? 0) + 1)
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    return levels.map((l) => ({ level: l, count: counts.get(l.id) ?? 0, total }))
  }, [perStudent, defaultScale])

  const byItem = useMemo(
    () =>
      items
        .map((item) => ({ item, avg: itemAverage(item, grades, scaleFor(item)) }))
        .filter((r) => r.avg !== null)
        .sort((a, b) => (a.avg as number) - (b.avg as number)),
    [items, grades, scaleFor],
  )

  const classAverage = useMemo(() => {
    const values = perStudent.map((p) => p.agg.average).filter((v): v is number => v !== null)
    if (!values.length) return null
    return values.reduce((a, b) => a + b, 0) / values.length
  }, [perStudent])

  const dynamics = useMemo(() => {
    // Средний процент по классу для каждой работы в хронологии
    return items
      .map((item) => ({ item, avg: itemAverage(item, grades, scaleFor(item)) }))
      .filter((r) => r.avg !== null) as Array<{ item: (typeof items)[number]; avg: number }>
  }, [items, grades, scaleFor])

  const byCategory = useMemo(() => {
    return categories
      .map((c) => {
        const own = items.filter((i) => i.category_id === c.id)
        const values = own
          .flatMap((i) =>
            grades
              .filter((g) => g.item_id === i.id && g.score !== null && g.flag === 'none')
              .map((g) => percentOf(g.score as number, i.max_score, scaleFor(i))),
          )
        return {
          category: c,
          avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
          count: values.length,
        }
      })
      .filter((r) => r.count > 0)
  }, [categories, items, grades, scaleFor])

  if (!items.length || !students.length) {
    return (
      <EmptyState
        title="Пока нечего анализировать"
        description="Добавьте работы в журнал и выставьте первые оценки — здесь появятся распределение, динамика и рейтинг."
        art="search"
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="cf-card p-4">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">
            Средний балл класса
          </span>
          <p className="mt-1.5 text-[26px] font-bold leading-none">
            {classAverage === null
              ? '—'
              : `${trimNumber(Math.round(classAverage * 100) / 100)} из ${trimNumber(defaultScale.max_value)}`}
          </p>
        </div>
        <div className="cf-card p-4">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Работ в периоде</span>
          <p className="mt-1.5 text-[26px] font-bold leading-none">{items.length}</p>
        </div>
        <div className="cf-card p-4">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Оценок выставлено</span>
          <p className="mt-1.5 text-[26px] font-bold leading-none">
            {grades.filter((g) => g.score !== null).length}
            <span className="ml-1 text-[14px] font-medium text-ink-3">
              из {items.length * students.length}
            </span>
          </p>
        </div>
      </div>

      {/* Распределение отметок */}
      <section className="cf-card p-4">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
          <BarChart3 size={15} /> Распределение итоговых отметок
        </h3>
        <div className="mt-4 space-y-2.5">
          {distribution.map(({ level, count, total }) => {
            const pct = total ? (count / total) * 100 : 0
            return (
              <div key={level.id} className="flex items-center gap-3">
                <span
                  className="inline-flex h-7 min-w-[38px] items-center justify-center rounded-[9px] px-2 text-[12.5px] font-bold"
                  style={{ background: gradePalette[level.color].bg, color: gradePalette[level.color].fg }}
                >
                  {level.label}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-surface-2">
                  <div
                    className="h-full rounded-pill transition-[width] duration-500"
                    style={{ width: `${pct}%`, background: gradePalette[level.color].fg }}
                  />
                </div>
                <span className="w-16 text-right text-[12.5px] text-ink-3">
                  {count} · {Math.round(pct)}%
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Динамика */}
      {dynamics.length > 1 && (
        <section className="cf-card p-4">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            <TrendingUp size={15} /> Динамика класса по работам
          </h3>
          <Sparkline points={dynamics.map((d) => d.avg)} labels={dynamics.map((d) => d.item.title)} />
          <div className="mt-2 flex justify-between text-[11.5px] text-ink-3">
            <span>{formatDate(dynamics[0].item.date)}</span>
            <span>{formatDate(dynamics[dynamics.length - 1].item.date)}</span>
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Рейтинг */}
        <section className="cf-card p-4">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            <Award size={15} /> Рейтинг по среднему баллу
          </h3>
          <ol className="mt-3 divide-y divide-line">
            {perStudent.map((row, i) => (
              <li key={row.student.id} className="flex items-center gap-3 py-2.5">
                <span className="w-5 text-center text-[12.5px] font-bold text-ink-3">{i + 1}</span>
                <Avatar name={row.student.name} src={row.student.avatar} size={26} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{row.student.name}</span>
                {row.agg.level && (
                  <span
                    className="cf-pill px-2 py-[2px] text-[11.5px] font-semibold"
                    style={{
                      background: gradePalette[row.agg.level.color].bg,
                      color: gradePalette[row.agg.level.color].fg,
                      borderColor: `color-mix(in srgb, ${gradePalette[row.agg.level.color].fg} 26%, transparent)`,
                    }}
                  >
                    {row.agg.level.label}
                  </span>
                )}
                <span className="w-12 text-right text-[13px] font-semibold">
                  {row.agg.average === null
                    ? '—'
                    : trimNumber(Math.round(row.agg.average * 100) / 100)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Сложные работы + категории */}
        <div className="space-y-5">
          <section className="cf-card p-4">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold">
              <TrendingDown size={15} /> Самые сложные работы
            </h3>
            <ul className="mt-3 divide-y divide-line">
              {byItem.slice(0, 6).map(({ item, avg }) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{item.title}</span>
                    <span className="text-[11.5px] text-ink-3">
                      {formatDate(item.date)} · макс {trimNumber(item.max_score)}
                    </span>
                  </span>
                  <span className="text-[13px] font-semibold">{Math.round(avg as number)}%</span>
                </li>
              ))}
            </ul>
          </section>

          {!!byCategory.length && (
            <section className="cf-card p-4">
              <h3 className="text-[14px] font-semibold">Средний результат по категориям</h3>
              <ul className="mt-3 space-y-2.5">
                {byCategory.map(({ category, avg, count }) => (
                  <li key={category.id} className="flex items-center gap-3">
                    <span
                      className="cf-pill px-2.5 py-[3px] text-[12px]"
                      style={{
                        background: `var(--cf-${category.color}-bg)`,
                        color: `var(--cf-${category.color}-acc)`,
                        borderColor: `color-mix(in srgb, var(--cf-${category.color}-acc) 26%, transparent)`,
                      }}
                    >
                      {category.name}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
                      <div
                        className="h-full rounded-pill"
                        style={{
                          width: `${avg ?? 0}%`,
                          background: `var(--cf-${category.color}-acc)`,
                        }}
                      />
                    </div>
                    <span className="w-20 text-right text-[12px] text-ink-3">
                      {Math.round(avg ?? 0)}% · {count}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

/** Минималистичный график динамики без внешних библиотек */
function Sparkline({ points, labels }: { points: number[]; labels: string[] }) {
  const w = 640
  const h = 120
  const pad = 8
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0
  const y = (v: number) => h - pad - (v / 100) * (h - pad * 2)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * step} ${y(p)}`).join(' ')
  const area = `${d} L ${pad + (points.length - 1) * step} ${h - pad} L ${pad} ${h - pad} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-[120px] w-full" preserveAspectRatio="none">
      {[25, 50, 75].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="rgb(var(--cf-line))" strokeWidth="1" />
      ))}
      <path d={area} fill="rgb(var(--cf-brand) / 0.10)" />
      <path d={d} fill="none" stroke="rgb(var(--cf-brand))" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={pad + i * step} cy={y(p)} r="3.5" fill="rgb(var(--cf-brand))">
          <title>{`${labels[i]}: ${Math.round(p)}%`}</title>
        </circle>
      ))}
    </svg>
  )
}
