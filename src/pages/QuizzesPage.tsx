import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ListChecks, Pencil, Play, Plus, Trophy, Users } from 'lucide-react'
import { db } from '@/lib/db'
import type { QuizView } from '@/lib/types'
import { cx, dueLabel, formatDateFull, normalize, plural } from '@/lib/utils'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { CardSkeletonGrid, EmptyState, EventChip, ProgressBar } from '@/components/ui/primitives'
import { QuizEditorModal } from '@/components/quizzes/QuizEditorModal'
import { QuizRunModal } from '@/components/quizzes/QuizRunModal'

/** Тесты с автопроверкой: преподаватель собирает, ученик проходит, балл считается сам. */
export function QuizzesPage() {
  const { space, canManage, query } = useApp()
  const toast = useToast()
  const [items, setItems] = useState<QuizView[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<QuizView | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [running, setRunning] = useState<QuizView | null>(null)

  const load = useCallback(async () => {
    if (!space) return
    try {
      setItems(await db.listQuizzes(space.id))
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }, [space, toast])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    const off = db.subscribe((e) => {
      if (e.table === 'quizzes' || e.table === 'quiz_attempts') void load()
    })
    return off
  }, [load])

  const visible = useMemo(() => {
    const q = normalize(query)
    return items.filter((x) => !q || normalize(`${x.title} ${x.description ?? ''}`).includes(q))
  }, [items, query])

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-5 py-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Тесты</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {space?.name} · {plural(visible.length, 'тест', 'теста', 'тестов')}
          </p>
        </div>
        {canManage && (
          <button
            className="cf-btn-brand"
            onClick={() => {
              setEditing(null)
              setEditorOpen(true)
            }}
          >
            <Plus size={17} strokeWidth={2.6} /> Тест
          </button>
        )}
      </div>

      {loading ? (
        <CardSkeletonGrid count={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          art="tasks"
          title="Тестов пока нет"
          description={
            canManage
              ? 'Соберите вопросы с вариантами ответов — баллы посчитаются сами, а вы увидите результат каждого ученика.'
              : 'Как только преподаватель опубликует тест, он появится здесь.'
          }
          action={
            canManage ? (
              <button
                className="cf-btn-brand"
                onClick={() => {
                  setEditing(null)
                  setEditorOpen(true)
                }}
              >
                Создать тест
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((q, i) => (
            <QuizCard
              key={q.id}
              quiz={q}
              index={i}
              canManage={canManage}
              onEdit={() => {
                setEditing(q)
                setEditorOpen(true)
              }}
              onRun={() => setRunning(q)}
            />
          ))}
        </div>
      )}

      <QuizEditorModal
        open={editorOpen}
        editing={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={load}
      />
      <QuizRunModal
        quiz={running}
        open={Boolean(running)}
        onClose={() => setRunning(null)}
        onFinished={load}
      />
    </div>
  )
}

function QuizCard({
  quiz,
  index,
  canManage,
  onEdit,
  onRun,
}: {
  quiz: QuizView
  index: number
  canManage: boolean
  onEdit: () => void
  onRun: () => void
}) {
  const due = dueLabel(quiz.due_date)
  const done = quiz.attempts.filter((a) => a.student_id).length
  const avg = quiz.attempts.length
    ? Math.round(
        (quiz.attempts.reduce((s, a) => s + (a.max_score ? a.score / a.max_score : 0), 0) /
          quiz.attempts.length) *
          100,
      )
    : 0
  const mine = quiz.myAttempt
  const attemptsLeft = quiz.attempts_allowed - quiz.attempts.filter((a) => a.student_id === mine?.student_id).length

  return (
    <article
      className="cf-hoverable flex animate-fade-up flex-col rounded-card border border-line bg-surface p-5 shadow-card"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: 'var(--cf-purple-bg)', color: 'var(--cf-purple-acc)' }}
        >
          <ListChecks size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold text-ink">{quiz.title}</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {plural(quiz.questions, 'вопрос', 'вопроса', 'вопросов')} ·{' '}
            {plural(quiz.points, 'балл', 'балла', 'баллов')}
          </p>
        </div>
        {!quiz.published && (
          <span className="shrink-0 rounded-pill border border-line px-2 py-0.5 text-[11px] text-ink-3">
            черновик
          </span>
        )}
      </div>

      {quiz.description && (
        <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{quiz.description}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {quiz.due_date && (
          <EventChip icon={CheckCircle2} color={due.tone === 'late' ? 'red' : due.tone === 'soon' ? 'orange' : 'blue'}>
            {due.text}
          </EventChip>
        )}
        <EventChip icon={Play} color="purple">
          {plural(quiz.attempts_allowed, 'попытка', 'попытки', 'попыток')}
        </EventChip>
      </div>

      {canManage ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <Users size={13} /> Прошли: {done} · средний результат {avg}%
          </p>
          <div className="mt-2">
            <ProgressBar value={avg} color={avg >= 70 ? 'green' : avg >= 40 ? 'yellow' : 'red'} />
          </div>
          <button className="cf-btn-ghost mt-3 w-full py-2 text-[13px]" onClick={onEdit}>
            <Pencil size={14} /> Редактировать
          </button>
        </div>
      ) : (
        <div className="mt-4 border-t border-line pt-3">
          {mine ? (
            <p className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: 'var(--cf-green-acc)' }}>
              <Trophy size={14} /> Ваш результат: {mine.score} из {mine.max_score}
              {mine.is_late && <span className="text-[color:var(--cf-red-acc)]">· с опозданием</span>}
            </p>
          ) : (
            <p className="text-[13px] text-ink-3">Тест ещё не пройден</p>
          )}
          <button
            className={cx('mt-3 w-full py-2 text-[13px]', attemptsLeft > 0 ? 'cf-btn-brand' : 'cf-btn-ghost')}
            onClick={onRun}
            disabled={attemptsLeft <= 0}
          >
            <Play size={14} /> {mine ? 'Пройти ещё раз' : 'Пройти тест'}
          </button>
          {quiz.due_date && (
            <p className="mt-2 text-center text-[11.5px] text-ink-3">до {formatDateFull(quiz.due_date)}</p>
          )}
        </div>
      )}
    </article>
  )
}
