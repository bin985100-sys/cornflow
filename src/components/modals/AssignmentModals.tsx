import { useEffect, useState } from 'react'
import { Check, Loader2, Paperclip, Send, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import type { AssignmentView, MaterialView } from '@/lib/types'
import { MATERIAL_ICON } from '@/lib/icons'
import { cardPalette, cx, formatDateFull, toDateInput } from '@/lib/utils'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { CommentThread } from '@/components/comments/CommentThread'
import { Avatar } from '@/components/ui/primitives'
import { AssignmentChips } from '@/components/assignments/AssignmentCard'

/* --------------------------- Создание / правка ---------------------------- */

export function AssignmentModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: AssignmentView | null
}) {
  const { space, materials, refresh } = useApp()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('18:00')
  const [attachments, setAttachments] = useState<string[]>([])
  const [allowLate, setAllowLate] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(editing?.title ?? '')
    setDescription(editing?.description ?? '')
    setDate(toDateInput(editing?.due_date))
    setTime(
      editing?.due_date
        ? new Date(editing.due_date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        : '18:00',
    )
    setAttachments(editing?.attachments ?? [])
    setAllowLate(editing?.allow_late ?? true)
  }, [open, editing])

  async function save() {
    if (!space || !title.trim()) return
    setBusy(true)
    try {
      const due = date ? new Date(`${date}T${time || '00:00'}`).toISOString() : null
      if (editing) {
        await db.updateAssignment(editing.id, {
          title: title.trim(),
          description: description.trim() || null,
          due_date: due,
          allow_late: allowLate,
          attachments,
        })
        toast.success('Задание обновлено')
      } else {
        await db.createAssignment({
          space_id: space.id,
          title: title.trim(),
          description: description.trim() || null,
          due_date: due,
          allow_late: allowLate,
          attachments,
        })
        toast.success('Задание создано')
      }
      await refresh()
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
      title={editing ? 'Редактировать задание' : 'Новое задание'}
      subtitle={space?.name}
      footer={
        <>
          {editing && (
            <button
              className="mr-auto flex items-center gap-1.5 text-[13px] font-medium transition hover:underline"
              style={{ color: 'var(--cf-red-acc)' }}
              onClick={async () => {
                if (!window.confirm('Удалить задание?')) return
                try {
                  await db.deleteAssignment(editing.id)
                  await refresh()
                  toast.success('Задание удалено')
                  onClose()
                } catch (e) {
                  toast.error(e)
                }
              }}
            >
              <Trash2 size={14} /> Удалить
            </button>
          )}
          <button className="cf-btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand" onClick={save} disabled={busy || !title.trim()}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {editing ? 'Сохранить' : 'Создать'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Название</span>
          <input
            className="cf-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Домашнее задание №7"
            autoFocus
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Описание</span>
          <textarea
            className="cf-input min-h-[110px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Что нужно сделать, как оформить, критерии оценки"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Дата сдачи</span>
            <input type="date" className="cf-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Время</span>
            <input type="time" className="cf-input" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>

        <label
          className={cx(
            'flex items-start gap-3 rounded-soft border p-3.5 transition',
            date ? 'border-line' : 'border-line opacity-55',
          )}
        >
          <input
            type="checkbox"
            className="mt-[3px] h-4 w-4 accent-brand"
            checked={!allowLate}
            disabled={!date}
            onChange={(e) => setAllowLate(!e.target.checked)}
          />
          <span>
            <span className="block text-[13.5px] font-medium text-ink">Не принимать работы после срока</span>
            <span className="block text-[12px] leading-snug text-ink-3">
              {date
                ? 'После указанной даты кнопка сдачи у учеников перестанет работать. Иначе работа примется с пометкой «с опозданием».'
                : 'Доступно, когда задана дата сдачи'}
            </span>
          </span>
        </label>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">
            Прикрепить материалы <span className="text-ink-3">({attachments.length})</span>
          </span>
          <MaterialPicker materials={materials} selected={attachments} onChange={setAttachments} />
        </div>
      </div>
    </Modal>
  )
}

export function MaterialPicker({
  materials,
  selected,
  onChange,
  emptyHint = 'В пространстве пока нет материалов',
}: {
  materials: MaterialView[]
  selected: string[]
  onChange: (ids: string[]) => void
  emptyHint?: string
}) {
  if (!materials.length) {
    return <p className="rounded-soft border border-dashed border-line px-3 py-4 text-center text-[13px] text-ink-3">{emptyHint}</p>
  }
  return (
    <div className="max-h-56 space-y-1 overflow-y-auto rounded-soft border border-line bg-surface-2/40 p-1.5">
      {materials.map((m) => {
        const Icon = MATERIAL_ICON[m.type]
        const active = selected.includes(m.id)
        return (
          <button
            key={m.id}
            type="button"
            onClick={() =>
              onChange(active ? selected.filter((x) => x !== m.id) : [...selected, m.id])
            }
            className={cx(
              'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition',
              active ? 'bg-brand-soft' : 'hover:bg-surface',
            )}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
              style={{ background: cardPalette[m.color].bg, color: cardPalette[m.color].accent }}
            >
              <Icon size={14} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{m.title}</span>
            {active && <Check size={15} className="shrink-0 text-brand" />}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ Просмотр / сдача -------------------------- */

export function AssignmentDetail({
  assignment,
  open,
  onClose,
  onEdit,
  onOpenMaterial,
}: {
  assignment: AssignmentView | null
  open: boolean
  onClose: () => void
  onEdit: (a: AssignmentView) => void
  onOpenMaterial: (m: MaterialView) => void
}) {
  const { canManage, materials, refresh } = useApp()
  const toast = useToast()
  const [comment, setComment] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !assignment) return
    setComment(assignment.mySubmission?.comment ?? '')
    setAttachments(assignment.mySubmission?.attachments ?? [])
  }, [open, assignment])

  if (!assignment) return null

  const overdue = Boolean(assignment.due_date && new Date() > new Date(assignment.due_date))
  const closed = overdue && !assignment.allow_late
  const mine = assignment.mySubmission

  async function submit() {
    if (!assignment) return
    setBusy(true)
    try {
      await db.submitAssignment(assignment.id, { comment, attachments })
      await refresh()
      toast.success('Работа отправлена')
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
      title={assignment.title}
      subtitle={assignment.due_date ? `Сдать до ${formatDateFull(assignment.due_date)}` : 'Без срока сдачи'}
      footer={
        <>
          <button className="cf-btn-ghost" onClick={onClose}>
            Закрыть
          </button>
          {canManage && (
            <button className="cf-btn-ghost" onClick={() => onEdit(assignment)}>
              Редактировать
            </button>
          )}
          {!canManage && (
            <button
              className="cf-btn-brand"
              onClick={submit}
              disabled={busy || closed}
              title={closed ? 'Приём работ закрыт: срок сдачи истёк' : undefined}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {closed
                ? 'Приём закрыт'
                : mine?.status === 'submitted'
                  ? 'Обновить работу'
                  : 'Сдать работу'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <AssignmentChips assignment={assignment} />

        {assignment.description && (
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{assignment.description}</p>
        )}

        {assignment.attachedMaterials.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <Paperclip size={14} /> Материалы задания
            </h4>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {assignment.attachedMaterials.map((m) => {
                const Icon = MATERIAL_ICON[m.type]
                const full = materials.find((x) => x.id === m.id)
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => full && onOpenMaterial(full)}
                      className="flex w-full items-center gap-3 bg-surface px-3.5 py-2.5 text-left transition hover:bg-surface-2"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                        style={{ background: cardPalette[m.color].bg, color: cardPalette[m.color].accent }}
                      >
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{m.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Ученик: форма сдачи */}
        {!canManage && (
          <section className="rounded-card border border-line bg-surface-2/40 p-4">
            <h4 className="mb-2.5 text-[13px] font-semibold text-ink">Моя работа</h4>
            {mine?.is_late && (
              <p className="mb-3 text-[13px]" style={{ color: 'var(--cf-red-acc)' }}>
                Работа сдана после срока
              </p>
            )}
            {closed && !mine?.submitted_at && (
              <p className="mb-3 text-[13px]" style={{ color: 'var(--cf-red-acc)' }}>
                Срок сдачи истёк, преподаватель закрыл приём работ
              </p>
            )}
            {mine?.grade != null && (
              <p className="mb-3 text-[13px]" style={{ color: 'var(--cf-green-acc)' }}>
                Оценка: <b>{mine.grade}</b>
              </p>
            )}
            <textarea
              className="cf-input min-h-[80px] resize-y"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Комментарий к работе"
            />
            <p className="mb-1.5 mt-3 text-[13px] font-medium text-ink-2">Прикрепить свои материалы</p>
            <MaterialPicker
              materials={materials}
              selected={attachments}
              onChange={setAttachments}
              emptyHint="Загрузите материалы в библиотеку, чтобы приложить их к работе"
            />
          </section>
        )}

        <div className="border-t border-line pt-5">
          <CommentThread assignmentId={assignment.id} />
        </div>

        {/* Учитель: список сдач */}
        {canManage && (
          <section>
            <h4 className="mb-2 text-[13px] font-semibold text-ink">
              Сдачи ({assignment.submissions.filter((s) => s.status !== 'assigned').length})
            </h4>
            {assignment.submissions.length === 0 ? (
              <p className="rounded-soft border border-dashed border-line px-3 py-5 text-center text-[13px] text-ink-3">
                Пока никто не сдал работу
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                {assignment.submissions.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 bg-surface px-3.5 py-3">
                    <Avatar name={s.student?.name ?? '?'} src={s.student?.avatar} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-ink">{s.student?.name ?? 'Ученик'}</p>
                      <p className="text-[11.5px] text-ink-3">
                        {s.submitted_at ? `Сдано ${formatDateFull(s.submitted_at)}` : 'Не сдано'}
                        {s.is_late && (
                          <span className="ml-1.5 font-medium" style={{ color: 'var(--cf-red-acc)' }}>
                            с опозданием
                          </span>
                        )}
                      </p>
                      {s.comment && <p className="mt-1.5 text-[13px] text-ink-2">{s.comment}</p>}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      defaultValue={s.grade ?? ''}
                      placeholder="—"
                      className="w-14 shrink-0 rounded-soft border border-line bg-surface px-2 py-1.5 text-center text-[13px]"
                      onBlur={async (e) => {
                        const val = e.target.value === '' ? null : Number(e.target.value)
                        try {
                          await db.gradeSubmission(s.id, val)
                          await refresh()
                        } catch (err) {
                          toast.error(err)
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Modal>
  )
}
