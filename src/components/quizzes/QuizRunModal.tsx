import { useEffect, useState } from 'react'
import { Check, Loader2, Trophy } from 'lucide-react'
import { db } from '@/lib/db'
import type { QuizForStudent, QuizResult, QuizView } from '@/lib/types'
import { cx, formatDateFull, plural } from '@/lib/utils'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { ProgressBar } from '@/components/ui/primitives'

/** Прохождение теста учеником: вопросы без правильных ответов, балл считает база. */
export function QuizRunModal({
  quiz,
  open,
  onClose,
  onFinished,
}: {
  quiz: QuizView | null
  open: boolean
  onClose: () => void
  onFinished: () => void
}) {
  const toast = useToast()
  const [data, setData] = useState<QuizForStudent | null>(null)
  const [loading, setLoading] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<QuizResult | null>(null)

  useEffect(() => {
    if (!open || !quiz) return
    setResult(null)
    setAnswers({})
    setLoading(true)
    db.getQuizForStudent(quiz.id)
      .then(setData)
      .catch((e) => toast.error(e))
      .finally(() => setLoading(false))
  }, [open, quiz, toast])

  if (!quiz) return null

  function pick(qid: string, oid: string, multiple: boolean) {
    setAnswers((prev) => {
      const cur = prev[qid] ?? []
      if (!multiple) return { ...prev, [qid]: [oid] }
      return { ...prev, [qid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] }
    })
  }

  const answered = data ? data.questions.filter((q) => (answers[q.id] ?? []).length > 0).length : 0
  const total = data?.questions.length ?? 0
  const attemptsLeft = data ? data.attempts_allowed - data.attempts_used : 0

  async function submit() {
    if (!data) return
    if (answered < total && !window.confirm(`Отвечено ${answered} из ${total}. Отправить как есть?`)) return
    setBusy(true)
    try {
      const res = await db.submitQuiz(quiz!.id, answers)
      setResult(res)
      onFinished()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={quiz.title}
      subtitle={
        quiz.due_date ? `Пройти до ${formatDateFull(quiz.due_date)}` : 'Без ограничения по сроку'
      }
      footer={
        result ? (
          <button className="cf-btn-brand" onClick={onClose}>
            Готово
          </button>
        ) : (
          <>
            <button className="cf-btn-ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="cf-btn-brand" onClick={submit} disabled={busy || !data || attemptsLeft <= 0}>
              {busy && <Loader2 size={15} className="animate-spin" />}
              Отправить ответы
            </button>
          </>
        )
      }
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-ink-3" size={22} />
        </div>
      ) : result ? (
        <div className="animate-pop py-6 text-center">
          <span
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'var(--cf-green-bg)', color: 'var(--cf-green-acc)' }}
          >
            <Trophy size={28} />
          </span>
          <p className="mt-4 text-[30px] font-extrabold text-ink">
            {result.score} / {result.max_score}
          </p>
          <p className="mt-1 text-[14px] text-ink-2">
            {result.max_score > 0 && `${Math.round((result.score / result.max_score) * 100)}% правильных`}
            {result.is_late && ' · сдано после срока'}
          </p>
          <div className="mx-auto mt-5 max-w-xs">
            <ProgressBar
              value={result.max_score ? (result.score / result.max_score) * 100 : 0}
              color={result.score === result.max_score ? 'green' : 'blue'}
            />
          </div>
          <p className="mt-4 text-[13px] text-ink-3">
            {result.attempts_left > 0
              ? `Осталось ${plural(result.attempts_left, 'попытка', 'попытки', 'попыток')}`
              : 'Попытки закончились — результат ушёл преподавателю'}
          </p>
        </div>
      ) : !data ? null : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-card border border-line bg-surface-2/40 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">
                Отвечено {answered} из {total}
              </p>
              <div className="mt-1.5">
                <ProgressBar value={total ? (answered / total) * 100 : 0} />
              </div>
            </div>
            <span className="shrink-0 rounded-pill border border-line px-2.5 py-1 text-[12px] text-ink-2">
              {attemptsLeft > 0
                ? `${plural(attemptsLeft, 'попытка', 'попытки', 'попыток')} осталось`
                : 'попытки закончились'}
            </span>
          </div>

          {data.description && <p className="text-[14px] leading-relaxed text-ink-2">{data.description}</p>}

          {data.questions.map((q, i) => (
            <div key={q.id} className="animate-fade-up rounded-card border border-line p-4">
              <p className="flex items-start gap-2 text-[14.5px] font-medium text-ink">
                <span className="text-ink-3">{i + 1}.</span>
                <span className="flex-1">{q.text}</span>
                <span className="shrink-0 text-[12px] text-ink-3">
                  {plural(q.points, 'балл', 'балла', 'баллов')}
                </span>
              </p>
              {q.multiple && (
                <p className="mt-1 text-[12px] text-ink-3">Можно выбрать несколько вариантов</p>
              )}
              <div className="mt-3 space-y-1.5">
                {q.options.map((o) => {
                  const chosen = (answers[q.id] ?? []).includes(o.id)
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => pick(q.id, o.id, q.multiple)}
                      className={cx(
                        'flex w-full items-center gap-2.5 rounded-pill border px-3 py-2.5 text-left text-[13.5px] transition duration-200',
                        chosen
                          ? 'border-brand bg-brand-soft text-ink'
                          : 'border-line text-ink-2 hover:border-brand/40 hover:bg-surface-2',
                      )}
                    >
                      <span
                        className={cx(
                          'flex h-5 w-5 shrink-0 items-center justify-center border',
                          q.multiple ? 'rounded-[6px]' : 'rounded-full',
                          chosen ? 'border-transparent bg-brand text-white' : 'border-line',
                        )}
                      >
                        {chosen && <Check size={12} className="animate-check-pop" />}
                      </span>
                      {o.text}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
