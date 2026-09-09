import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/db'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import {
  aggregateFor,
  attendanceStats,
  currentPeriod,
  levelFor,
  percentOf,
  type Aggregate,
  type AttendanceStats,
} from '@/lib/grading'
import type {
  Grade,
  GradeItem,
  GradePeriod,
  GradeScale,
  GradebookSnapshot,
  Lesson,
  SpaceView,
} from '@/lib/types'

const FALLBACK_SCALE: GradeScale = {
  id: 'fallback',
  space_id: '',
  name: '8-балльная',
  kind: 'points',
  min_value: 1,
  max_value: 8,
  levels: [],
  passing_percent: 50,
  is_default: true,
  created_at: '',
}

export interface SubjectDiary {
  space: SpaceView
  scale: GradeScale
  period: GradePeriod | null
  aggregate: Aggregate
  attendance: AttendanceStats
  /** мои оценки за выбранный отрезок, свежие первыми */
  grades: Array<{ item: GradeItem; grade: Grade }>
  /** уроки с домашним заданием, начиная с сегодняшнего дня */
  homework: Lesson[]
  /** работы без оценки — то, что ещё предстоит */
  pending: GradeItem[]
}

export interface SchoolDiaryApi {
  loading: boolean
  subjects: SubjectDiary[]
  /** «весь год» или текущий учебный период */
  wholeYear: boolean
  setWholeYear: (v: boolean) => void
  /** средний балл по всем предметам сразу */
  overall: { average: number | null; percent: number | null; scaleMax: number | null; subjects: number }
  refresh: () => Promise<void>
}

/**
 * Единый дневник ученика: оценки, домашка и посещаемость по всем предметам
 * сразу. Каждый предмет живёт в своём пространстве, поэтому журналы
 * подгружаются параллельно и сводятся в один экран.
 */
export function useSchoolDiary(): SchoolDiaryApi {
  const { spaces } = useApp()
  const { user } = useAuth()
  const [snapshots, setSnapshots] = useState<Array<{ space: SpaceView; snap: GradebookSnapshot }>>([])
  const [loading, setLoading] = useState(true)
  const [wholeYear, setWholeYear] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const results = await Promise.all(
      spaces.map(async (space) => {
        try {
          return { space, snap: await db.loadGradebook(space.id) }
        } catch {
          return null
        }
      }),
    )
    // предмет ученика — то пространство, где он числится учеником журнала
    setSnapshots(
      results
        .filter((r): r is { space: SpaceView; snap: GradebookSnapshot } => Boolean(r))
        .filter((r) => r.snap.students.some((s) => s.id === user.id)),
    )
    setLoading(false)
  }, [spaces, user])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    let timer: number | undefined
    const off = db.subscribe((e) => {
      if (e.table !== 'gradebook' && e.table !== 'submissions') return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void load(), 200)
    })
    return () => {
      window.clearTimeout(timer)
      off()
    }
  }, [load])

  const subjects = useMemo<SubjectDiary[]>(() => {
    if (!user) return []
    const today = new Date().toISOString().slice(0, 10)

    return snapshots
      .map(({ space, snap }) => {
        const scale = snap.scales.find((s) => s.is_default) ?? snap.scales[0] ?? FALLBACK_SCALE
        const period = wholeYear ? null : currentPeriod(snap.periods)
        const inPeriod = <T extends { period_id: string | null; date: string }>(row: T) =>
          !period ||
          row.period_id === period.id ||
          (!row.period_id && row.date >= period.start_date && row.date <= period.end_date)

        const items = snap.items.filter(inPeriod)
        const scaleFor = (item: GradeItem) => snap.scales.find((s) => s.id === item.scale_id) ?? scale

        const aggregate = aggregateFor(user.id, {
          items,
          grades: snap.grades,
          categories: snap.categories,
          scaleFor,
        })

        const grades = items
          .map((item) => ({
            item,
            grade: snap.grades.find((g) => g.item_id === item.id && g.student_id === user.id),
          }))
          .filter((r): r is { item: GradeItem; grade: Grade } => Boolean(r.grade))
          .sort((a, b) => b.item.date.localeCompare(a.item.date))

        return {
          space,
          scale,
          period,
          aggregate,
          attendance: attendanceStats(snap.attendance.filter((a) => a.student_id === user.id)),
          grades,
          homework: snap.lessons
            .filter((l) => l.homework && l.date >= today)
            .sort((a, b) => a.date.localeCompare(b.date)),
          pending: items.filter(
            (item) => !snap.grades.some((g) => g.item_id === item.id && g.student_id === user.id),
          ),
        }
      })
      .sort((a, b) => a.space.name.localeCompare(b.space.name, 'ru'))
  }, [snapshots, user, wholeYear])

  const overall = useMemo(() => {
    const scored = subjects.filter((s) => s.aggregate.percent !== null)
    if (!scored.length) return { average: null, percent: null, scaleMax: null, subjects: 0 }

    const percent = scored.reduce((sum, s) => sum + (s.aggregate.percent ?? 0), 0) / scored.length
    // средний балл в единицах шкалы имеет смысл, только если шкала у всех одна
    const maxima = new Set(scored.map((s) => s.scale.max_value))
    const scaleMax = maxima.size === 1 ? scored[0].scale.max_value : null
    const average =
      scaleMax === null
        ? null
        : scored.reduce((sum, s) => sum + (s.aggregate.average ?? 0), 0) / scored.length

    return { average, percent, scaleMax, subjects: scored.length }
  }, [subjects])

  return { loading, subjects, wholeYear, setWholeYear, overall, refresh: load }
}

/** Итоговая отметка по среднему проценту — для сводки по всем предметам */
export function overallLevel(percent: number | null, scale: GradeScale | null) {
  if (percent === null || !scale) return null
  return levelFor(percent, scale)
}

export { percentOf }
