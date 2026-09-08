import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/db'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { currentPeriod, presetByKey } from '@/lib/grading'
import type {
  GradeCategory,
  GradeItem,
  GradePeriod,
  GradeScale,
  GradebookSnapshot,
  Lesson,
  LessonPriority,
  LessonStatus,
} from '@/lib/types'

const EMPTY: GradebookSnapshot = {
  scales: [],
  periods: [],
  categories: [],
  items: [],
  grades: [],
  criteria: [],
  criterionScores: [],
  lessons: [],
  lessonStatuses: [],
  lessonPriorities: [],
  attendance: [],
  students: [],
}

export interface GradebookApi extends GradebookSnapshot {
  loading: boolean
  spaceId: string | null
  canEdit: boolean
  /** Выбранный период; null — «весь год» */
  period: GradePeriod | null
  periodId: string | null
  setPeriodId: (id: string | null) => void
  /** Работы выбранного периода */
  periodItems: GradeItem[]
  /** Занятия выбранного периода */
  periodLessons: Lesson[]
  statusOf: (lesson: Lesson) => LessonStatus | null
  priorityOf: (lesson: Lesson) => LessonPriority | null
  categoryOf: (row: { category_id: string | null }) => GradeCategory | null
  defaultScale: GradeScale
  scaleFor: (item: GradeItem) => GradeScale
  refresh: () => Promise<void>
}

const FALLBACK_SCALE: GradeScale = {
  ...presetByKey('eight').build(),
  id: 'fallback',
  space_id: '',
  is_default: true,
  created_at: '',
}

const PERIOD_KEY = 'cornflow.period'

/** Засев справочников журнала — один раз на пространство за сессию вкладки,
 *  общий для всех экземпляров хука. */
const seededSpaces = new Set<string>()

/** Загружает журнал активного пространства и держит его в актуальном состоянии. */
export function useGradebook(): GradebookApi {
  const { space, canEdit } = useApp()
  const { user } = useAuth()
  const [data, setData] = useState<GradebookSnapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [periodId, setPeriodIdState] = useState<string | null>(
    () => localStorage.getItem(PERIOD_KEY),
  )
  const spaceId = space?.id ?? null

  const load = useCallback(async () => {
    if (!spaceId) {
      setData(EMPTY)
      setLoading(false)
      return
    }
    try {
      // Первый заход в журнал пространства создаёт шкалу, категории и периоды.
      // Пространство помечаем ДО await: иначе перемонтирование хука или
      // realtime-обновление успевают запустить второй засев параллельно.
      const needSeed = canEdit && !seededSpaces.has(spaceId)
      if (needSeed) seededSpaces.add(spaceId)
      const snap = needSeed ? await db.ensureGradebook(spaceId) : await db.loadGradebook(spaceId)
      setData(snap)
    } catch {
      setData(EMPTY)
    } finally {
      setLoading(false)
    }
  }, [spaceId, canEdit])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  // realtime: журнал обновляется у всех участников пространства
  useEffect(() => {
    let timer: number | undefined
    const off = db.subscribe((e) => {
      if (e.table !== 'gradebook' && e.table !== 'submissions') return
      if (e.spaceId && spaceId && e.spaceId !== spaceId) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void load(), 150)
    })
    return () => {
      window.clearTimeout(timer)
      off()
    }
  }, [load, spaceId])

  const setPeriodId = useCallback((id: string | null) => {
    setPeriodIdState(id)
    if (id) localStorage.setItem(PERIOD_KEY, id)
    else localStorage.removeItem(PERIOD_KEY)
  }, [])

  const period = useMemo(() => {
    if (periodId === null) return null
    return data.periods.find((p) => p.id === periodId) ?? currentPeriod(data.periods)
  }, [data.periods, periodId])

  const periodItems = useMemo(() => {
    if (!period) return data.items
    return data.items.filter(
      (i) => i.period_id === period.id || (!i.period_id && i.date >= period.start_date && i.date <= period.end_date),
    )
  }, [data.items, period])

  const periodLessons = useMemo(() => {
    if (!period) return data.lessons
    return data.lessons.filter(
      (l) =>
        l.period_id === period.id ||
        (!l.period_id && l.date >= period.start_date && l.date <= period.end_date),
    )
  }, [data.lessons, period])

  const statusOf = useCallback(
    (lesson: Lesson) => data.lessonStatuses.find((x) => x.id === lesson.status_id) ?? null,
    [data.lessonStatuses],
  )
  const priorityOf = useCallback(
    (lesson: Lesson) => data.lessonPriorities.find((x) => x.id === lesson.priority_id) ?? null,
    [data.lessonPriorities],
  )
  const categoryOf = useCallback(
    (row: { category_id: string | null }) =>
      row.category_id ? data.categories.find((c) => c.id === row.category_id) ?? null : null,
    [data.categories],
  )

  const defaultScale = useMemo(
    () => data.scales.find((s) => s.is_default) ?? data.scales[0] ?? FALLBACK_SCALE,
    [data.scales],
  )

  const scaleFor = useCallback(
    (item: GradeItem) => data.scales.find((s) => s.id === item.scale_id) ?? defaultScale,
    [data.scales, defaultScale],
  )

  // Учитель видит строки журнала по ученикам пространства;
  // ученик — только себя, так же, как это ограничивает RLS.
  const students = useMemo(() => {
    if (!canEdit) return data.students.filter((s) => s.id === user?.id)
    const pupils = data.students.filter((s) => s.role === 'student')
    return pupils.length ? pupils : data.students.filter((s) => s.id !== user?.id)
  }, [data.students, canEdit, user?.id])

  return {
    ...data,
    students,
    loading,
    spaceId,
    canEdit,
    period,
    periodId: period?.id ?? null,
    setPeriodId,
    periodItems,
    periodLessons,
    statusOf,
    priorityOf,
    categoryOf,
    defaultScale,
    scaleFor,
    refresh: load,
  }
}
