import { useMemo, useState } from 'react'
import type { GradeItem } from '@/lib/types'
import { CalendarDays, MessageSquare, Target, TrendingUp } from 'lucide-react'
import { Avatar, EmptyState, ProgressBar } from '@/components/ui/primitives'
import {
  ATTENDANCE_META,
  aggregateFor,
  attendanceStats,
  colorForGrade,
  gradeLabel,
  gradePalette,
  percentOf,
  sortedLevels,
  trimNumber,
} from '@/lib/grading'
import { formatDate, plural } from '@/lib/utils'
import { CellEditor } from './GradeGrid'
import type { GradebookApi } from '@/hooks/useGradebook'

/** Дневник ученика: оценки по дням, средний балл, прогноз и посещаемость. */
export function DiaryView({ gb, studentId }: { gb: GradebookApi; studentId: string }) {
  const { periodItems: items, grades, categories, scaleFor, defaultScale } = gb
  const student = gb.students.find((s) => s.id === studentId)

  const agg = useMemo(
    () => aggregateFor(studentId, { items, grades, categories, scaleFor }),
    [studentId, items, grades, categories, scaleFor],
  )

  const myGrades = useMemo(() => {
    return items
      .map((item) => ({ item, grade: grades.find((g) => g.item_id === item.id && g.student_id === studentId) }))
      .filter((r) => !!r.grade)
      .sort((a, b) => b.item.date.localeCompare(a.item.date))
  }, [items, grades, studentId])

  const attendance = useMemo(
    () => gb.attendance.filter((a) => a.student_id === studentId),
    [gb.attendance, studentId],
  )
  const att = attendanceStats(attendance)

  // Прогноз: цель — следующий уровень вверх от текущего
  const levels = sortedLevels(defaultScale)
  const currentIndex = agg.level ? levels.findIndex((l) => l.id === agg.level?.id) : levels.length - 1
  const target = currentIndex > 0 ? levels[currentIndex - 1] : levels[0]
  const [targetId, setTargetId] = useState<string | null>(null)
  /** Правка оценки прямо из дневника — доступна тем, кто ведёт журнал */
  const [editing, setEditing] = useState<{ item: GradeItem; x: number; y: number } | null>(null)
  const chosenTarget = levels.find((l) => l.id === targetId) ?? target

  const ungraded = items.filter(
    (item) => !grades.some((g) => g.item_id === item.id && g.student_id === studentId),
  )
  const forecast = useMemo(() => {
    if (!chosenTarget || !ungraded.length || agg.percent === null) return null
    const w = (i: (typeof items)[number]) =>
      Math.max(0, i.weight) * Math.max(0, categories.find((c) => c.id === i.category_id)?.weight ?? 1)
    const earned = items.filter((i) => !ungraded.includes(i)).reduce((s, i) => s + w(i), 0)
    const remaining = ungraded.reduce((s, i) => s + w(i), 0)
    if (!remaining) return null
    const need =
      (chosenTarget.min_percent * (earned + remaining) - agg.percent * earned) / remaining
    return { need, remaining: ungraded.length }
  }, [chosenTarget, ungraded, agg.percent, items, categories])

  if (!student) {
    return <EmptyState title="Ученик не найден" art="tasks" />
  }

  return (
    <div className="space-y-5">
      {/* Итоги */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Средний балл"
          value={
            agg.average === null
              ? '—'
              : `${trimNumber(Math.round(agg.average * 100) / 100)} из ${trimNumber(gb.defaultScale.max_value)}`
          }
          sub={agg.percent !== null ? `${Math.round(agg.percent)}% · по ${agg.counted} работам` : 'Нет оценок'}
          bar={agg.percent ?? 0}
        />
        <div className="cf-card flex flex-col justify-between p-4">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Итоговая отметка</span>
          <div className="mt-2 flex items-center gap-2">
            {agg.level ? (
              <span
                className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-[14px] px-3 text-[19px] font-bold"
                style={{
                  background: gradePalette[agg.level.color].bg,
                  color: gradePalette[agg.level.color].fg,
                }}
              >
                {agg.level.label}
              </span>
            ) : (
              <span className="text-[19px] font-bold text-ink-3">—</span>
            )}
            <span className="text-[12.5px] text-ink-3">
              по {agg.counted} {agg.counted === 1 ? 'работе' : 'работам'}
            </span>
          </div>
        </div>
        <StatCard
          label="Посещаемость"
          value={att.total ? `${Math.round(att.rate)}%` : '—'}
          sub={
            att.total
              ? `Пропусков: ${att.absent}${att.excused ? ` · по уважительной: ${att.excused}` : ''}`
              : 'Нет отметок'
          }
          bar={att.rate}
        />
        <StatCard
          label="Не оценено"
          value={String(ungraded.length)}
          sub={ungraded.length ? 'Работы ждут оценки' : 'Все работы оценены'}
          bar={items.length ? ((items.length - ungraded.length) / items.length) * 100 : 0}
        />
      </div>

      {/* Прогноз */}
      {forecast && chosenTarget && (
        <div className="cf-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13.5px] font-semibold">
              <Target size={16} className="text-brand" />
              Что нужно, чтобы выйти на «{chosenTarget.label}»
            </span>
            <select
              className="cf-input py-1.5 text-[12.5px]"
              value={chosenTarget.id}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  Цель: {l.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-[13.5px] text-ink-2">
            {forecast.need <= 0 ? (
              <>Отметка уже достигнута — достаточно не снижать текущий результат.</>
            ) : forecast.need > 100 ? (
              <>
                В этом периоде цель недостижима: даже максимум на оставшихся {forecast.remaining} работах
                не выведет на «{chosenTarget.label}».
              </>
            ) : (
              <>
                Нужно в среднем <b>{Math.ceil(forecast.need)}%</b> на оставшихся {forecast.remaining}{' '}
                {forecast.remaining === 1 ? 'работе' : 'работах'}.
              </>
            )}
          </p>
        </div>
      )}

      {/* Лента оценок */}
      <section className="cf-card overflow-hidden p-0">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Avatar name={student.name} src={student.avatar} size={26} />
          <span className="font-semibold">{student.name}</span>
          <span className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3">
            <TrendingUp size={13} /> {plural(myGrades.length, 'оценка', 'оценки', 'оценок')}
          </span>
        </header>

        {!myGrades.length ? (
          <div className="px-4 py-10">
            <EmptyState
              title="Оценок пока нет"
              description="Как только учитель выставит отметку, она появится здесь."
              art="star"
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {myGrades.map(({ item, grade }) => {
              if (!grade) return null
              const scale = scaleFor(item)
              const color = colorForGrade(grade, item, scale)
              const cat = categories.find((c) => c.id === item.category_id)
              return (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  {gb.canEdit ? (
                    <button
                      onClick={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setEditing({ item, x: r.left, y: r.bottom + 4 })
                      }}
                      title="Изменить оценку или добавить комментарий"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-[15px] font-bold transition hover:brightness-95"
                      style={{ background: gradePalette[color].bg, color: gradePalette[color].fg }}
                    >
                      {gradeLabel(grade, item, scale)}
                    </button>
                  ) : (
                    <span
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] text-[15px] font-bold"
                      style={{ background: gradePalette[color].bg, color: gradePalette[color].fg }}
                    >
                      {gradeLabel(grade, item, scale)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{item.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays size={12} /> {formatDate(item.date)}
                      </span>
                      {(() => {
                        const lesson = gb.lessons.find((l) => l.id === item.lesson_id)
                        return lesson ? <span>· {lesson.title}</span> : null
                      })()}
                      {cat && (
                        <span
                          className="cf-pill px-2 py-[2px] text-[11px]"
                          style={{
                            background: `var(--cf-${cat.color}-bg)`,
                            color: `var(--cf-${cat.color}-acc)`,
                            borderColor: `color-mix(in srgb, var(--cf-${cat.color}-acc) 26%, transparent)`,
                          }}
                        >
                          {cat.name}
                        </span>
                      )}
                      {grade.score !== null && (
                        <span>
                          {trimNumber(grade.score)} из {trimNumber(item.max_score)} ·{' '}
                          {Math.round(percentOf(grade.score, item.max_score, scale))}%
                        </span>
                      )}
                    </p>
                    {(() => {
                      const parts = gb.criteria
                        .filter((c) => c.item_id === item.id)
                        .sort((a, b) => a.position - b.position)
                      if (!parts.length) return null
                      return (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {parts.map((c) => {
                            const cs = gb.criterionScores.find(
                              (x) => x.criterion_id === c.id && x.student_id === studentId,
                            )
                            return (
                              <li
                                key={c.id}
                                className="cf-pill border-line bg-canvas px-2 py-[2px] text-[11.5px] text-ink-2"
                                title={c.title}
                              >
                                {c.title}:{' '}
                                <b className="ml-0.5 text-ink">
                                  {cs?.score !== null && cs?.score !== undefined
                                    ? trimNumber(cs.score)
                                    : '—'}
                                </b>
                                <span className="text-ink-3">/{trimNumber(c.max_score)}</span>
                              </li>
                            )
                          })}
                        </ul>
                      )
                    })()}
                    {grade.comment && (
                      <p className="mt-1 flex items-start gap-1.5 text-[12.5px] text-ink-2">
                        <MessageSquare size={12} className="mt-[3px] shrink-0" />
                        {grade.comment}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {editing && (
        <CellEditor
          gb={gb}
          item={editing.item}
          studentId={studentId}
          x={editing.x}
          y={editing.y}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Посещаемость */}
      {!!attendance.length && (
        <section className="cf-card p-4">
          <h3 className="text-[14px] font-semibold">Посещаемость</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...attendance]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 60)
              .map((a) => {
                const meta = ATTENDANCE_META[a.status]
                return (
                  <span
                    key={a.id}
                    title={`${formatDate(a.date)} — ${meta.label}${a.note ? ` · ${a.note}` : ''}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] text-[11px] font-bold"
                    style={{ background: gradePalette[meta.color].bg, color: gradePalette[meta.color].fg }}
                  >
                    {meta.short}
                  </span>
                )
              })}
          </div>
        </section>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  bar,
}: {
  label: string
  value: string
  sub: string
  bar: number
}) {
  return (
    <div className="cf-card p-4">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{label}</span>
      <p className="mt-1.5 text-[24px] font-bold leading-none tracking-[-0.02em]">{value}</p>
      <p className="mt-1.5 text-[12.5px] text-ink-3">{sub}</p>
      <div className="mt-3">
        <ProgressBar value={bar} color="blue" />
      </div>
    </div>
  )
}
