/* =========================================================================
   Логика оценивания: пресеты шкал, определение уровня, средние и итоги.
   Работает одинаково в mock- и в Supabase-режиме — чистые функции.
   ========================================================================= */

import type {
  Attendance,
  AttendanceStatus,
  Grade,
  GradeCategory,
  GradeColor,
  GradeItem,
  GradeLevel,
  GradePeriod,
  GradeScale,
} from './types'
import { uid } from './utils'

/* ------------------------------- палитра --------------------------------- */

export const gradePalette: Record<GradeColor, { bg: string; fg: string; label: string }> = {
  green: { bg: '#E6F4EC', fg: '#1F9D57', label: 'Зелёный' },
  lime: { bg: '#EDF6E3', fg: '#4C9A2A', label: 'Салатовый' },
  yellow: { bg: '#FEF9E7', fg: '#C98A12', label: 'Жёлтый' },
  orange: { bg: '#FEEFE0', fg: '#EA7B1B', label: 'Оранжевый' },
  red: { bg: '#FDECEC', fg: '#E5484D', label: 'Красный' },
  blue: { bg: '#EAF1FD', fg: '#2356FD', label: 'Синий' },
  grey: { bg: '#F1F1EE', fg: '#6B6F76', label: 'Серый' },
}

export const GRADE_COLORS = Object.keys(gradePalette) as GradeColor[]

/* -------------------------------- пресеты -------------------------------- */

function level(label: string, min_percent: number, value: number, color: GradeColor): GradeLevel {
  return { id: uid('lvl'), label, min_percent, value, color }
}

export interface ScalePreset {
  key: string
  name: string
  hint: string
  build: () => Omit<GradeScale, 'id' | 'space_id' | 'created_at' | 'is_default'>
}

export const SCALE_PRESETS: ScalePreset[] = [
  {
    key: 'eight',
    name: '8-балльная',
    hint: '1 — 8, с критериями за работу',
    build: () => ({
      name: '8-балльная',
      kind: 'points',
      min_value: 1,
      max_value: 8,
      passing_percent: 36,
      levels: [
        level('8', 93, 8, 'green'),
        level('7', 79, 7, 'green'),
        level('6', 64, 6, 'lime'),
        level('5', 50, 5, 'lime'),
        level('4', 36, 4, 'yellow'),
        level('3', 21, 3, 'orange'),
        level('2', 7, 2, 'red'),
        level('1', 0, 1, 'red'),
      ],
    }),
  },
  {
    key: 'five',
    name: '5-балльная',
    hint: '2 — 5, классическая школьная',
    build: () => ({
      name: '5-балльная',
      kind: 'points',
      min_value: 1,
      max_value: 5,
      passing_percent: 50,
      levels: [
        level('5', 90, 5, 'green'),
        level('4', 70, 4, 'lime'),
        level('3', 50, 3, 'yellow'),
        level('2', 0, 2, 'red'),
      ],
    }),
  },
  {
    key: 'ten',
    name: '10-балльная',
    hint: '1 — 10',
    build: () => ({
      name: '10-балльная',
      kind: 'points',
      min_value: 1,
      max_value: 10,
      passing_percent: 40,
      levels: [
        level('9–10', 90, 10, 'green'),
        level('7–8', 70, 8, 'lime'),
        level('5–6', 50, 6, 'yellow'),
        level('3–4', 30, 4, 'orange'),
        level('1–2', 0, 2, 'red'),
      ],
    }),
  },
  {
    key: 'twelve',
    name: '12-балльная',
    hint: '1 — 12',
    build: () => ({
      name: '12-балльная',
      kind: 'points',
      min_value: 1,
      max_value: 12,
      passing_percent: 34,
      levels: [
        level('10–12 · высокий', 83, 11, 'green'),
        level('7–9 · достаточный', 58, 8, 'lime'),
        level('4–6 · средний', 34, 5, 'yellow'),
        level('1–3 · начальный', 0, 2, 'red'),
      ],
    }),
  },
  {
    key: 'hundred',
    name: '100-балльная',
    hint: 'Проценты и баллы за работу',
    build: () => ({
      name: '100-балльная',
      kind: 'points',
      min_value: 0,
      max_value: 100,
      passing_percent: 60,
      levels: [
        level('Отлично', 90, 95, 'green'),
        level('Хорошо', 75, 82, 'lime'),
        level('Удовлетворительно', 60, 67, 'yellow'),
        level('Неудовлетворительно', 0, 40, 'red'),
      ],
    }),
  },
  {
    key: 'letters',
    name: 'Буквенная A–F',
    hint: 'GPA 4.0, выбор уровня',
    build: () => ({
      name: 'Буквенная A–F',
      kind: 'levels',
      min_value: 0,
      max_value: 100,
      passing_percent: 60,
      levels: [
        level('A', 90, 4, 'green'),
        level('B', 80, 3, 'lime'),
        level('C', 70, 2, 'yellow'),
        level('D', 60, 1, 'orange'),
        level('F', 0, 0, 'red'),
      ],
    }),
  },
  {
    key: 'passfail',
    name: 'Зачёт / незачёт',
    hint: 'Две отметки без баллов',
    build: () => ({
      name: 'Зачёт / незачёт',
      kind: 'levels',
      min_value: 0,
      max_value: 1,
      passing_percent: 100,
      levels: [level('Зачёт', 100, 1, 'green'), level('Незачёт', 0, 0, 'red')],
    }),
  },
  {
    key: 'custom',
    name: 'Произвольная',
    hint: 'Свои уровни, пороги и цвета',
    build: () => ({
      name: 'Моя шкала',
      kind: 'points',
      min_value: 0,
      max_value: 20,
      passing_percent: 50,
      levels: [
        level('Отлично', 85, 20, 'green'),
        level('Хорошо', 65, 15, 'lime'),
        level('Норма', 50, 10, 'yellow'),
        level('Слабо', 0, 5, 'red'),
      ],
    }),
  },
]

export function presetByKey(key: string): ScalePreset {
  return SCALE_PRESETS.find((p) => p.key === key) ?? SCALE_PRESETS[0]
}

/** Категории работ по умолчанию для нового пространства */
export const DEFAULT_CATEGORIES: Array<Pick<GradeCategory, 'name' | 'weight' | 'color'>> = [
  { name: 'Контрольная', weight: 3, color: 'red' },
  { name: 'Самостоятельная', weight: 2, color: 'yellow' },
  { name: 'Домашняя работа', weight: 1, color: 'green' },
  { name: 'Устный ответ', weight: 1, color: 'blue' },
  { name: 'Проект', weight: 3, color: 'purple' },
]

/* ------------------------------ вычисления -------------------------------- */

export function sortedLevels(scale: GradeScale): GradeLevel[] {
  return [...scale.levels].sort((a, b) => b.min_percent - a.min_percent)
}

/** Процент выполнения работы: балл относительно максимума работы */
export function percentOf(score: number, maxScore: number, scale: GradeScale): number {
  const min = scale.kind === 'points' ? scale.min_value : 0
  const span = Math.max(1e-9, maxScore - min)
  return clamp(((score - min) / span) * 100, 0, 100)
}

export function levelFor(percent: number, scale: GradeScale): GradeLevel | null {
  const levels = sortedLevels(scale)
  for (const l of levels) if (percent >= l.min_percent - 1e-9) return l
  return levels[levels.length - 1] ?? null
}

export function levelForGrade(
  grade: Pick<Grade, 'score' | 'flag'>,
  item: Pick<GradeItem, 'max_score'>,
  scale: GradeScale,
): GradeLevel | null {
  if (grade.score === null || grade.flag === 'absent' || grade.flag === 'excused') return null
  return levelFor(percentOf(grade.score, item.max_score, scale), scale)
}

export function colorForGrade(
  grade: Pick<Grade, 'score' | 'flag'>,
  item: Pick<GradeItem, 'max_score'>,
  scale: GradeScale,
): GradeColor {
  if (grade.flag === 'absent') return 'grey'
  if (grade.flag === 'excused') return 'blue'
  const l = levelForGrade(grade, item, scale)
  return l?.color ?? 'grey'
}

/** Подпись оценки в клетке журнала */
export function gradeLabel(
  grade: Pick<Grade, 'score' | 'flag'>,
  item: Pick<GradeItem, 'max_score'>,
  scale: GradeScale,
): string {
  if (grade.flag === 'absent') return 'н'
  if (grade.flag === 'excused') return 'осв'
  if (grade.flag === 'pending') return '·'
  if (grade.score === null) return ''
  if (scale.kind === 'levels') {
    return levelForGrade(grade, item, scale)?.label ?? String(grade.score)
  }
  return trimNumber(grade.score)
}

export function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/* ------------------------------ агрегаты ---------------------------------- */

export interface Aggregate {
  /** Средний процент по всем учтённым работам с весами */
  percent: number | null
  /** Средний балл в единицах шкалы (для 5-балльной — 4.36) */
  average: number | null
  /** Итоговая отметка по шкале */
  level: GradeLevel | null
  counted: number
  missing: number
  absent: number
}

const EMPTY_AGGREGATE: Aggregate = {
  percent: null,
  average: null,
  level: null,
  counted: 0,
  missing: 0,
  absent: 0,
}

export interface AggregateContext {
  items: GradeItem[]
  grades: Grade[]
  categories: GradeCategory[]
  scaleFor: (item: GradeItem) => GradeScale
}

/** Итог ученика по набору работ: взвешенное среднее в процентах + отметка */
export function aggregateFor(studentId: string, ctx: AggregateContext): Aggregate {
  const byCategory = new Map<string, GradeCategory>(ctx.categories.map((c) => [c.id, c]))
  let weighted = 0
  let weightSum = 0
  let counted = 0
  let missing = 0
  let absent = 0
  let scaleForTotal: GradeScale | null = null

  for (const item of ctx.items) {
    const grade = ctx.grades.find((g) => g.item_id === item.id && g.student_id === studentId)
    const scale = ctx.scaleFor(item)
    if (!scaleForTotal) scaleForTotal = scale
    if (!grade || grade.flag === 'excused') continue
    if (grade.flag === 'absent') {
      absent += 1
      continue
    }
    if (grade.score === null) {
      missing += 1
      continue
    }
    const catWeight = item.category_id ? byCategory.get(item.category_id)?.weight ?? 1 : 1
    const w = Math.max(0, catWeight) * Math.max(0, item.weight)
    if (w <= 0) continue
    weighted += percentOf(grade.score, item.max_score, scale) * w
    weightSum += w
    counted += 1
  }

  if (!weightSum || !scaleForTotal) return { ...EMPTY_AGGREGATE, missing, absent }

  const percent = weighted / weightSum
  const lvl = levelFor(percent, scaleForTotal)
  const average =
    scaleForTotal.kind === 'points'
      ? scaleForTotal.min_value + (percent / 100) * (scaleForTotal.max_value - scaleForTotal.min_value)
      : lvl?.value ?? null

  return { percent, average, level: lvl, counted, missing, absent }
}

/** Средний процент по работе среди всех учеников — для аналитики */
export function itemAverage(item: GradeItem, grades: Grade[], scale: GradeScale): number | null {
  const values = grades
    .filter((g) => g.item_id === item.id && g.score !== null && g.flag === 'none')
    .map((g) => percentOf(g.score as number, item.max_score, scale))
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Прогноз: какой средний процент нужен на оставшихся работах,
 * чтобы выйти на желаемый уровень.
 */
export function forecastNeeded(
  current: Aggregate,
  targetPercent: number,
  remainingWeight: number,
  earnedWeight: number,
): number | null {
  if (remainingWeight <= 0) return null
  const currentPercent = current.percent ?? 0
  const need =
    (targetPercent * (earnedWeight + remainingWeight) - currentPercent * earnedWeight) / remainingWeight
  return need
}

export function totalWeight(items: GradeItem[], categories: GradeCategory[]): number {
  const byCategory = new Map(categories.map((c) => [c.id, c.weight]))
  return items.reduce(
    (sum, i) => sum + Math.max(0, i.weight) * Math.max(0, i.category_id ? byCategory.get(i.category_id) ?? 1 : 1),
    0,
  )
}

/* ---------------------------- посещаемость -------------------------------- */

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; short: string; color: GradeColor }
> = {
  present: { label: 'Присутствовал', short: '•', color: 'green' },
  late: { label: 'Опоздал', short: 'о', color: 'yellow' },
  absent: { label: 'Отсутствовал', short: 'н', color: 'red' },
  excused: { label: 'Уважительная причина', short: 'у', color: 'blue' },
}

export interface AttendanceStats {
  total: number
  present: number
  late: number
  absent: number
  excused: number
  rate: number
}

export function attendanceStats(rows: Attendance[]): AttendanceStats {
  const total = rows.length
  const by = (s: AttendanceStatus) => rows.filter((r) => r.status === s).length
  const present = by('present')
  const late = by('late')
  const excused = by('excused')
  const absent = by('absent')
  const rate = total ? ((present + late) / total) * 100 : 0
  return { total, present, late, absent, excused, rate }
}

/* ------------------------------- периоды ---------------------------------- */

export function currentPeriod(periods: GradePeriod[], today = new Date()): GradePeriod | null {
  const iso = today.toISOString().slice(0, 10)
  return (
    periods.find((p) => p.is_current) ??
    periods.find((p) => p.start_date <= iso && iso <= p.end_date) ??
    periods[0] ??
    null
  )
}

/** Учебный год из четырёх четвертей — стартовый набор периодов */
export function defaultPeriods(year = new Date().getFullYear()): Array<
  Pick<GradePeriod, 'name' | 'start_date' | 'end_date' | 'is_current'>
> {
  const y = new Date().getMonth() >= 7 ? year : year - 1
  const iso = new Date().toISOString().slice(0, 10)
  const raw = [
    { name: 'I четверть', start_date: `${y}-09-01`, end_date: `${y}-10-31` },
    { name: 'II четверть', start_date: `${y}-11-08`, end_date: `${y}-12-28` },
    { name: 'III четверть', start_date: `${y + 1}-01-11`, end_date: `${y + 1}-03-20` },
    { name: 'IV четверть', start_date: `${y + 1}-03-30`, end_date: `${y + 1}-05-31` },
  ]
  return raw.map((p) => ({ ...p, is_current: p.start_date <= iso && iso <= p.end_date }))
}

/* --------------------------------- CSV ------------------------------------ */

export function toCsv(rows: Array<Array<string | number | null>>): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(esc).join(';')).join('\r\n')
}

export function downloadCsv(filename: string, csv: string) {
  // BOM — чтобы Excel корректно открыл кириллицу
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
