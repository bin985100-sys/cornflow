import type { ScheduleDay, ScheduleLesson, SchoolHoliday } from '@/lib/types'

export const WEEKDAY_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const WEEKDAY_FULL = [
  '',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
]

/** Понедельник недели, в которую попадает дата */
export function mondayOf(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : new Date(date)
  // getDay(): 0 — воскресенье, поэтому его сдвигаем на шесть дней назад
  const shift = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - shift)
  return d.toISOString().slice(0, 10)
}

/**
 * С какой недели открывать расписание.
 *
 * В воскресенье текущая неделя уже закончилась — показывать её незачем, и
 * человек всё равно смотрит, что завтра. Поэтому воскресенье открывает
 * следующую неделю, а не ту, что доживает последний день.
 */
export function openingMonday(today = new Date()): string {
  const d = new Date(today)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return mondayOf(d)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Неделя расписания: шесть учебных дней с уроками и пометкой каникул.
 *
 * Каникулы не хранятся в расписании, а вырезаются здесь: их даты двигают, и
 * перестраивать из-за этого расстановку никто не станет.
 */
export function buildWeek(
  mondayIso: string,
  lessons: ScheduleLesson[],
  holidays: SchoolHoliday[],
): ScheduleDay[] {
  const days: ScheduleDay[] = []
  for (let i = 0; i < 6; i++) {
    const date = addDays(mondayIso, i)
    const holiday = holidays.find((h) => h.start_date <= date && h.end_date >= date)
    days.push({
      date,
      weekday: i + 1,
      holiday: holiday?.name ?? null,
      lessons: holiday
        ? []
        : lessons
            .filter((l) => l.weekday === i + 1)
            .sort((a, b) => a.slot.position - b.slot.position),
    })
  }
  return days
}
