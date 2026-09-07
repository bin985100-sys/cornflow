import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '@/lib/db'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { currentPeriod, presetByKey } from '@/lib/grading'
import type { GradeItem, GradePeriod, GradeScale, GradebookSnapshot } from '@/lib/types'

const EMPTY: GradebookSnapshot = {
  scales: [],
  periods: [],
  categories: [],
  items: [],
  grades: [],
  criteria: [],
  criterionScores: [],
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
  const seeded = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!spaceId) {
      setData(EMPTY)
      setLoading(false)
      return
    }
    try {
      // Первый заход в журнал пространства создаёт шкалу, категории и периоды.
      const needSeed = canEdit && !seeded.current.has(spaceId)
      const snap = needSeed ? await db.ensureGradebook(spaceId) : await db.loadGradebook(spaceId)
      if (needSeed) seeded.current.add(spaceId)
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
    defaultScale,
    scaleFor,
    refresh: load,
  }
}
