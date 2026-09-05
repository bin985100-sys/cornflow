import { useEffect, useState } from 'react'
import { Check, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import type { QuizView } from '@/lib/types'
import { cx, toDateInput } from '@/lib/utils'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'

interface DraftOption {
  text: string
  is_correct: boolean
}
interface DraftQuestion {
  text: string
  multiple: boolean
  points: number
  options: DraftOption[]
}

const emptyQuestion = (): DraftQuestion => ({
  text: '',
  multiple: false,
  points: 1,
  options: [
    { text: '', is_correct: true },
    { text: '', is_correct: false },
  ],
})

/** Конструктор теста: вопросы, варианты и отметка правильных ответов. */
export function QuizEditorModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editing: QuizView | null
  onSaved: () => void
}) {
  const { space } = useApp()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [attempts, setAttempts] = useState(1)
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(editing?.title ?? '')
    setDescription(editing?.description ?? '')
    setDate(toDateInput(editing?.due_date))
    setAttempts(editing?.attempts_allowed ?? 1)
    if (!editing) {
      setQuestions([emptyQuestion()])
      return
    }
    setLoading(true)
    db.listQuizEditor(editing.id)
      .then((rows) =>
        setQuestions(
          rows.length
            ? rows.map((q) => ({
                text: q.text,
                multiple: q.multiple,
                points: q.points,
                options: q.options.map((o) => ({ text: o.text, is_correct: Boolean(o.is_correct) })),
              }))
            : [emptyQuestion()],
        ),
      )
      .catch((e) => toast.error(e))
      .finally(() => setLoading(false))
  }, [open, editing, toast])

  function patchQuestion(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...patch } : q)))
  }

  function patchOption(qi: number, oi: number, patch: Partial<DraftOption>) {
    setQuestions((qs) =>
      qs.map((q, k) =>
        k === qi ? { ...q, options: q.options.map((o, n) => (n === oi ? { ...o, ...patch } : o)) } : q,
      ),
    )
  }

  function toggleCorrect(qi: number, oi: number) {
    setQuestions((qs) =>
      qs.map((q, k) => {
        if (k !== qi) return q
        return {
          ...q,
          options: q.options.map((o, n) =>
            q.multiple
              ? n === oi
                ? { ...o, is_correct: !o.is_correct }
                : o
              : { ...o, is_correct: n === oi },
          ),
        }
      }),
    )
  }

  const problems: string[] = []
  if (!title.trim()) problems.push('название теста')
  questions.forEach((q, i) => {
    if (!q.text.trim()) problems.push(`текст вопроса ${i + 1}`)
    const filled = q.options.filter((o) => o.text.trim())
    if (filled.length < 2) problems.push(`минимум два варианта в вопросе ${i + 1}`)
    if (!filled.some((o) => o.is_correct)) problems.push(`правильный ответ в вопросе ${i + 1}`)
  })

  async function save(publish: boolean) {
    if (!space || problems.length) return
    setBusy(true)
    try {
      const quiz = editing
        ? await db.updateQuiz(editing.id, {
            title: title.trim(),
            description: description.trim() || null,
            due_date: date ? new Date(`${date}T23:59`).toISOString() : null,
            attempts_allowed: attempts,
            published: publish || editing.published,
          })
        : await db.createQuiz({
            space_id: space.id,
            title: title.trim(),
            description: description.trim() || null,
            due_date: date ? new Date(`${date}T23:59`).toISOString() : null,
            attempts_allowed: attempts,
          })

      await db.saveQuizQuestions(
        quiz.id,
        questions.map((q) => ({
          text: q.text.trim(),
          multiple: q.multiple,
          points: q.points,
          options: q.options.filter((o) => o.text.trim()),
        })),
      )
      if (publish && !editing?.published) await db.updateQuiz(quiz.id, { published: true })

      toast.success(publish ? 'Тест опубликован — ученики его видят' : 'Черновик сохранён')
      onSaved()
      onClose()
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
      title={editing ? 'Редактировать тест' : 'Новый тест'}
      subtitle={space?.name}
      footer={
        <>
          {editing && (
            <button
              className="mr-auto flex items-center gap-1.5 text-[13px] font-medium transition hover:underline"
              style={{ color: 'var(--cf-red-acc)' }}
              onClick={async () => {
                if (!window.confirm('Удалить тест вместе с результатами?')) return
                try {
                  await db.deleteQuiz(editing.id)
                  toast.success('Тест удалён')
                  onSaved()
                  onClose()
                } catch (e) {
                  toast.error(e)
                }
              }}
            >
              <Trash2 size={14} /> Удалить
            </button>
          )}
          <button className="cf-btn-ghost" onClick={() => save(false)} disabled={busy || problems.length > 0}>
            Сохранить черновик
          </button>
          <button className="cf-btn-brand" onClick={() => save(true)} disabled={busy || problems.length > 0}>
            {busy && <Loader2 size={15} className="animate-spin" />} Опубликовать
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-ink-3" size={22} />
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Название</span>
            <input
              className="cf-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Проверочная по теме «Дроби»"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Описание</span>
            <textarea
              className="cf-input min-h-[64px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Что проверяем, сколько времени займёт"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Срок сдачи</span>
              <input type="date" className="cf-input" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Сколько попыток</span>
              <input
                type="number"
                min={1}
                max={20}
                className="cf-input"
                value={attempts}
                onChange={(e) => setAttempts(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
            </label>
          </div>

          <div className="space-y-3">
            {questions.map((q, qi) => (
              <div key={qi} className="animate-fade-up rounded-card border border-line bg-surface-2/40 p-4">
                <div className="flex items-start gap-2">
                  <GripVertical size={16} className="mt-2.5 shrink-0 text-ink-3" />
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <input
                      className="cf-input"
                      value={q.text}
                      onChange={(e) => patchQuestion(qi, { text: e.target.value })}
                      placeholder={`Вопрос ${qi + 1}`}
                    />

                    <div className="space-y-1.5">
                      {q.options.map((o, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleCorrect(qi, oi)}
                            title="Отметить правильный ответ"
                            className={cx(
                              'flex h-7 w-7 shrink-0 items-center justify-center border transition duration-200',
                              q.multiple ? 'rounded-[8px]' : 'rounded-full',
                              o.is_correct
                                ? 'border-transparent bg-[color:var(--cf-green-acc)] text-white'
                                : 'border-line bg-surface text-transparent hover:border-brand/40',
                            )}
                          >
                            <Check size={14} className={o.is_correct ? 'animate-check-pop' : ''} />
                          </button>
                          <input
                            className="cf-input py-2"
                            value={o.text}
                            onChange={(e) => patchOption(qi, oi, { text: e.target.value })}
                            placeholder={`Вариант ${oi + 1}`}
                          />
                          {q.options.length > 2 && (
                            <button
                              type="button"
                              className="cf-icon-btn h-8 w-8 shrink-0"
                              onClick={() =>
                                patchQuestion(qi, { options: q.options.filter((_, n) => n !== oi) })
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-[12.5px] font-medium text-brand transition hover:underline"
                        onClick={() =>
                          patchQuestion(qi, { options: [...q.options, { text: '', is_correct: false }] })
                        }
                      >
                        + вариант
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-ink-2">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand"
                          checked={q.multiple}
                          onChange={(e) => {
                            const multiple = e.target.checked
                            patchQuestion(qi, {
                              multiple,
                              options: multiple
                                ? q.options
                                : q.options.map((o, n) => ({ ...o, is_correct: n === 0 ? o.is_correct : false })),
                            })
                          }}
                        />
                        Несколько правильных ответов
                      </label>
                      <label className="flex items-center gap-1.5">
                        Баллов
                        <input
                          type="number"
                          min={1}
                          max={100}
                          className="w-16 rounded-soft border border-line bg-surface px-2 py-1 text-center"
                          value={q.points}
                          onChange={(e) =>
                            patchQuestion(qi, { points: Math.max(1, Number(e.target.value) || 1) })
                          }
                        />
                      </label>
                      {questions.length > 1 && (
                        <button
                          type="button"
                          className="ml-auto text-[12.5px] transition hover:underline"
                          style={{ color: 'var(--cf-red-acc)' }}
                          onClick={() => setQuestions((qs) => qs.filter((_, k) => k !== qi))}
                        >
                          Удалить вопрос
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="cf-btn-ghost w-full"
              onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
            >
              <Plus size={15} /> Добавить вопрос
            </button>
          </div>

          {problems.length > 0 && (
            <p className="rounded-soft border border-dashed border-line px-3 py-2.5 text-[12.5px] text-ink-3">
              Чтобы сохранить, заполните: {problems.slice(0, 3).join(', ')}
              {problems.length > 3 && ` и ещё ${problems.length - 3}`}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
