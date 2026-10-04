import type { Submission, SubmissionState } from '@/lib/types'

/**
 * Четыре состояния сдачи плюс возврат на доработку.
 *
 * «Просрочен» — не колонка в базе, а вывод из дедлайна: иначе его пришлось бы
 * переписывать по расписанию каждую ночь, и он всё равно отставал бы.
 */
export function submissionState(
  submission: Pick<Submission, 'status' | 'submitted_at'>,
  due: string | null | undefined,
  now = new Date(),
): SubmissionState {
  if (submission.status === 'graded') return 'graded'
  if (submission.status === 'returned') return 'returned'
  if (submission.status === 'submitted') return 'submitted'
  // не сдано: смотрим на срок
  if (due && new Date(due).getTime() < now.getTime()) return 'overdue'
  return 'assigned'
}

export const STATE_LABEL: Record<SubmissionState, string> = {
  assigned: 'Не сдан',
  overdue: 'Просрочен',
  submitted: 'Сдан',
  returned: 'На доработке',
  graded: 'Закрыт',
}

/** Подсказка под статусом — чтобы не объяснять словами каждый раз */
export const STATE_HINT: Record<SubmissionState, string> = {
  assigned: 'Срок ещё не вышел',
  overdue: 'Срок вышел, работы нет',
  submitted: 'Ждёт проверки',
  returned: 'Учитель вернул на доработку',
  graded: 'Проверен и оценён',
}

/** Цвет статуса: один и тот же во всех списках, чтобы глаз не переучивался */
export const STATE_TONE: Record<SubmissionState, string> = {
  assigned: 'text-ink-3',
  overdue: 'text-red-500',
  submitted: 'text-blue-500',
  returned: 'text-amber-500',
  graded: 'text-emerald-600',
}
