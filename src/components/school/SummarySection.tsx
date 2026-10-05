import { useCallback, useEffect, useMemo, useState } from 'react'
import { Table2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { EmptyState, RowSkeleton, Segmented } from '@/components/ui/primitives'
import { trimNumber } from '@/lib/grading'
import { cx } from '@/lib/utils'
import type { SchoolApi } from '@/hooks/useSchool'
import type { GradeSummary } from '@/lib/types'

/**
 * Свод оценок класса: по четвертям и за год.
 *
 * Годовая считается как среднее четвертных, а не как среднее всех оценок —
 * так её считают в школе, и расхождение с журналом объяснять не придётся.
 * Клетка без оценок остаётся пустой: ноль здесь означал бы «двойка».
 */
export function SummarySection({ school }: { school: SchoolApi }) {
  const toast = useToast()
  const [classId, setClassId] = useState('')
  const [yearId, setYearId] = useState('')
  const [mode, setMode] = useState<'subject' | 'overall'>('overall')
  const [subject, setSubject] = useState('')
  const [data, setData] = useState<GradeSummary | null>(null)
  const [loading, setLoading] = useState(false)

  // первый класс и текущий год подставляем сами: так экран сразу не пустой
  useEffect(() => {
    if (!classId && school.classes.length) setClassId(school.classes[0].id)
    if (!yearId && school.years.length) setYearId(school.years[school.years.length - 1].id)
  }, [school.classes, school.years, classId, yearId])

  const load = useCallback(async () => {
    if (!school.schoolId || !classId) return
    setLoading(true)
    try {
      const summary = await db.gradeSummary({
        school_id: school.schoolId,
        class_id: classId,
        year_id: yearId || null,
      })
      setData(summary)
      setSubject((s) => (s && summary.subjects.includes(s) ? s : (summary.subjects[0] ?? '')))
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }, [school.schoolId, classId, yearId, toast])

  useEffect(() => {
    void load()
  }, [load])

  /** Среднее четвертных: пустые четверти в счёт не идут */
  const yearOf = (values: Array<number | null>) => {
    const real = values.filter((v): v is number => v !== null)
    return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null
  }

  const rows = useMemo(() => {
    if (!data) return []
    return data.people.map((person) => {
      const byTerm = data.terms.map((term) => {
        const cells = data.cells.filter(
          (c) =>
            c.person_id === person.id &&
            c.term_id === term.id &&
            (mode === 'overall' || c.subject_name === subject),
        )
        const real = cells.map((c) => c.average).filter((v): v is number => v !== null)
        return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null
      })
      return { person, byTerm, year: yearOf(byTerm) }
    })
  }, [data, mode, subject])

  if (!school.classes.length) {
    return (
      <EmptyState
        title="Сначала классы"
        description="Свод строится по классу: заведите параллель и класс, и сюда попадут их ученики."
      />
    )
  }

  return (
    <section className="space-y-4">
      <div className="cf-card flex flex-wrap items-center gap-2 p-3">
        <select className="cf-input w-40" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {school.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {school.classLabel(c.id)}
            </option>
          ))}
        </select>

        <select className="cf-input w-40" value={yearId} onChange={(e) => setYearId(e.target.value)}>
          {school.years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>

        <Segmented
          value={mode}
          onChange={(v) => setMode(v as 'subject' | 'overall')}
          options={[
            { value: 'overall', label: 'Все предметы' },
            { value: 'subject', label: 'Один предмет' },
          ]}
        />

        {mode === 'subject' && (
          <select
            className="cf-input w-48"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!data?.subjects.length}
          >
            {data?.subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <RowSkeleton count={6} />
      ) : !data || !data.terms.length ? (
        <EmptyState
          title="Нет учебного года"
          description="Свод считается по четвертям. Заведите учебный год в разделе «Периоды» — четверти создадутся сразу."
        />
      ) : !data.people.length ? (
        <EmptyState title="В классе нет учеников" description="Добавьте их в разделе «Ученики»." />
      ) : (
        <div className="cf-card cf-no-scrollbar overflow-x-auto p-0">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.06em] text-ink-3">
                <th className="px-4 py-2.5 font-semibold">Ученик</th>
                {data.terms.map((t) => (
                  <th key={t.id} className="w-[88px] px-2 py-2.5 text-center font-semibold">
                    {t.name.replace(' четверть', '')}
                  </th>
                ))}
                <th className="w-[88px] px-2 py-2.5 text-center font-semibold">Год</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ person, byTerm, year }) => (
                <tr key={person.id} className="border-t border-line">
                  <td className="px-4 py-2.5">{person.name}</td>
                  {byTerm.map((v, i) => (
                    <td key={i} className="px-2 py-2.5 text-center tabular-nums">
                      {v === null ? <span className="text-ink-3">—</span> : trimNumber(v)}
                    </td>
                  ))}
                  <td className={cx('px-2 py-2.5 text-center font-semibold tabular-nums')}>
                    {year === null ? <span className="text-ink-3">—</span> : trimNumber(year)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[12px] text-ink-3">
        <Table2 size={13} className="mt-[2px] shrink-0" />
        Оценка попадает в четверть по дате работы, а не по дате выставления. Годовая — среднее
        четвертных; четверть без оценок в расчёт не идёт.
      </p>
    </section>
  )
}
