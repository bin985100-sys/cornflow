import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, CornerUpLeft, Paperclip, Send, Undo2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Avatar, CardSkeletonGrid, EmptyState, Segmented } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/Modal'
import { STATE_HINT, STATE_LABEL, STATE_TONE } from '@/lib/submissions'
import { cx, formatDate, plural } from '@/lib/utils'
import type { GradeItem, SubmissionMessage, SubmissionReview, SubmissionState } from '@/lib/types'

const FILTERS: Array<{ value: SubmissionState | 'all'; label: string }> = [
  { value: 'submitted', label: 'Ждут проверки' },
  { value: 'returned', label: 'На доработке' },
  { value: 'overdue', label: 'Просрочены' },
  { value: 'graded', label: 'Закрыты' },
  { value: 'all', label: 'Все' },
]

/**
 * Проверка работ: все сданные работы по всем курсам учителя на одном экране.
 *
 * Оценка ставится отсюда и сразу уходит в журнал — иначе её переносят руками
 * и теряют. Если работа не годится, она не «не принимается», а возвращается
 * на доработку с пояснением, и ученик видит, что именно переделать.
 */
export function ReviewPage() {
  const toast = useToast()
  const [rows, setRows] = useState<SubmissionReview[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<SubmissionState | 'all'>('submitted')
  const [open, setOpen] = useState<SubmissionReview | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await db.listReviewQueue())
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.state === filter)),
    [rows, filter],
  )

  const counts = useMemo(() => {
    const map = new Map<SubmissionState, number>()
    for (const r of rows) map.set(r.state, (map.get(r.state) ?? 0) + 1)
    return map
  }, [rows])

  if (loading) return <CardSkeletonGrid count={4} />

  return (
    <div className="animate-fade-up space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">Проверка работ</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Все сданные работы по всем вашим курсам. Оценка отсюда сама уходит в журнал.
        </p>
      </header>

      <Segmented
        value={filter}
        onChange={(v) => setFilter(v as SubmissionState | 'all')}
        options={FILTERS.map((f) => ({
          value: f.value,
          label:
            f.value === 'all'
              ? `${f.label} · ${rows.length}`
              : `${f.label} · ${counts.get(f.value as SubmissionState) ?? 0}`,
        }))}
      />

      {shown.length === 0 ? (
        <EmptyState
          title="Здесь пусто"
          description={
            filter === 'submitted'
              ? 'Непроверенных работ нет. Как только ученик сдаст работу, она появится здесь.'
              : 'В этом состоянии работ нет.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((row) => (
            <li key={row.id}>
              <button
                onClick={() => setOpen(row)}
                className="flex w-full items-center gap-3 rounded-[18px] border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-2"
              >
                <Avatar name={row.student_name} src={row.student_avatar ?? undefined} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{row.assignment_title}</p>
                  <p className="truncate text-[12.5px] text-ink-3">
                    {row.student_name} · {row.space_name}
                    {row.submitted_at ? ` · сдал ${formatDate(row.submitted_at)}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={cx('block text-[12.5px] font-semibold', STATE_TONE[row.state])}>
                    {STATE_LABEL[row.state]}
                  </span>
                  {row.revision_count > 0 && (
                    <span className="block text-[11px] text-ink-3">
                      {plural(row.revision_count, 'возврат', 'возврата', 'возвратов')}
                    </span>
                  )}
                  {row.is_late && row.state !== 'overdue' && (
                    <span className="block text-[11px] text-amber-500">с опозданием</span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <ReviewModal
          row={open}
          onClose={() => setOpen(null)}
          onDone={async () => {
            setOpen(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------ одна работа ------------------------------ */

function ReviewModal({
  row,
  onClose,
  onDone,
}: {
  row: SubmissionReview
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const toast = useToast()
  const [grade, setGrade] = useState(row.grade != null ? String(row.grade) : '')
  const [comment, setComment] = useState(row.teacher_comment ?? '')
  const [itemId, setItemId] = useState(row.grade_item_id ?? '')
  const [items, setItems] = useState<GradeItem[]>([])
  const [busy, setBusy] = useState(false)
  const [returning, setReturning] = useState(false)

  // колонки журнала этого курса: туда уйдёт оценка
  useEffect(() => {
    let alive = true
    db.loadGradebook(row.space_id)
      .then((snap) => {
        if (!alive) return
        setItems(snap.items)
        // если колонка уже связана с заданием, предлагаем её
        if (!row.grade_item_id) {
          const linked = snap.items.find((i) => i.assignment_id === row.assignment_id)
          if (linked) setItemId(linked.id)
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [row.space_id, row.assignment_id, row.grade_item_id])

  async function close() {
    setBusy(true)
    try {
      await db.reviewSubmission(row.id, {
        grade: grade === '' ? null : Number(grade),
        comment: comment.trim() || null,
        grade_item_id: itemId || null,
      })
      toast.success(itemId ? 'Работа закрыта, оценка в журнале' : 'Работа закрыта')
      await onDone()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  async function sendBack() {
    if (!comment.trim()) {
      toast.error('Напишите, что переделать — без этого возврат бессмысленен')
      return
    }
    setBusy(true)
    try {
      await db.returnSubmission(row.id, comment.trim())
      toast.success('Работа вернулась ученику')
      await onDone()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
      setReturning(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={row.assignment_title} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
          <Avatar name={row.student_name} src={row.student_avatar ?? undefined} size={24} />
          <span className="font-medium text-ink-2">{row.student_name}</span>
          <span>·</span>
          <span>{row.space_name}</span>
          <span className={cx('ml-auto font-semibold', STATE_TONE[row.state])}>
            {STATE_LABEL[row.state]}
          </span>
        </div>

        <p className="text-[12px] text-ink-3">
          {STATE_HINT[row.state]}
          {row.assignment_due ? ` · срок ${formatDate(row.assignment_due)}` : ''}
        </p>

        {row.comment && (
          <p className="rounded-[14px] bg-canvas px-3 py-2 text-[13px] text-ink-2">
            <b className="font-semibold text-ink">Ученик написал. </b>
            {row.comment}
          </p>
        )}

        {row.attachments.length > 0 && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <Paperclip size={13} />
            {plural(row.attachments.length, 'файл', 'файла', 'файлов')} приложено
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-ink-2">Оценка</span>
            <input
              className="cf-input w-full"
              inputMode="decimal"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="5"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[12.5px] text-ink-2">Колонка журнала</span>
            <select className="cf-input w-full" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">не записывать в журнал</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Комментарий</span>
          <textarea
            className="cf-input min-h-[70px] w-full resize-y"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="За что оценка или что переделать"
          />
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="cf-btn-ghost px-4 text-amber-600"
            disabled={busy}
            onClick={() => (comment.trim() ? void sendBack() : setReturning(true))}
          >
            <Undo2 size={15} /> На доработку
          </button>
          <button className="cf-btn-brand px-4" disabled={busy} onClick={() => void close()}>
            <ClipboardCheck size={15} /> Закрыть работу
          </button>
        </div>

        <SubmissionChat submissionId={row.id} />
      </div>

      <Modal open={returning} onClose={() => setReturning(false)} title="Что переделать?">
        <div className="space-y-3">
          <p className="text-[13px] text-ink-2">
            Возврат без пояснения ученик прочитает как «не принято» и придёт спрашивать. Напишите
            одной строкой, что не так.
          </p>
          <textarea
            className="cf-input min-h-[80px] w-full resize-y"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Задача 3 решена верно, в задаче 5 перепутан знак — переделайте её"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button className="cf-btn-ghost px-4" onClick={() => setReturning(false)}>
              Отмена
            </button>
            <button
              className="cf-btn-brand px-4"
              disabled={busy || !comment.trim()}
              onClick={() => void sendBack()}
            >
              Вернуть
            </button>
          </div>
        </div>
      </Modal>
    </Modal>
  )
}

/* ------------------------------ чат работы ------------------------------- */

export function SubmissionChat({ submissionId }: { submissionId: string }) {
  const { user } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<SubmissionMessage[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setRows(await db.listSubmissionMessages(submissionId))
    } catch {
      /* чат — не главное на экране: молча */
    }
  }, [submissionId])

  useEffect(() => {
    void load()
  }, [load])

  async function send() {
    if (!body.trim()) return
    setBusy(true)
    try {
      await db.sendSubmissionMessage(submissionId, body)
      setBody('')
      await load()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-[18px] border border-line p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <CornerUpLeft size={13} className="text-ink-3" />
        <h3 className="text-[13px] font-semibold">Переписка по работе</h3>
      </header>

      {rows.length === 0 ? (
        <p className="mb-2 text-[12px] text-ink-3">
          Здесь можно уточнить детали, не создавая общий комментарий ко всему заданию.
        </p>
      ) : (
        <ol className="mb-2 max-h-[220px] space-y-1.5 overflow-y-auto">
          {rows.map((m) => {
            const mine = m.author_id === user?.id
            return (
              <li
                key={m.id}
                className={cx(
                  'max-w-[85%] rounded-[14px] px-3 py-1.5 text-[13px]',
                  mine ? 'ml-auto bg-brand-soft text-brand' : 'bg-surface-2 text-ink-2',
                )}
              >
                {m.body}
                <span className="mt-0.5 block text-[10.5px] opacity-70">{formatDate(m.created_at)}</span>
              </li>
            )
          })}
        </ol>
      )}

      <div className="flex gap-2">
        <input
          className="cf-input flex-1"
          placeholder="Написать сообщение"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
        />
        <button className="cf-btn-brand px-3" disabled={busy || !body.trim()} onClick={() => void send()}>
          <Send size={15} />
        </button>
      </div>
    </section>
  )
}
