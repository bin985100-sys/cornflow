import { useEffect, useState } from 'react'
import { Check, GraduationCap, Loader2, Paperclip, Send, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import type { AssignmentView, MaterialView } from '@/lib/types'
import { MATERIAL_ICON } from '@/lib/icons'
import { cardPalette, cx, formatDateFull, toDateInput } from '@/lib/utils'
import { useApp } from '@/context/AppContext'
import { useGradebook } from '@/hooks/useGradebook'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'
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
          attachments,
        })
        toast.success('Задание обновлено')
      } else {
        await db.createAssignment({
          space_id: space.id,
          title: title.trim(),
          description: description.trim() || null,
          due_date: due,
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
  const { canEdit, materials, refresh } = useApp()
  const { isTeacher } = useAuth()
  const toast = useToast()
  const gb = useGradebook()
  const [comment, setComment] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const linkedItem = assignment ? gb.items.find((i) => i.assignment_id === assignment.id) ?? null : null
  const maxGrade = gb.defaultScale.max_value

  /** Создаёт колонку журнала для задания и переносит уже выставленные оценки */
  async function pushToGradebook() {
    if (!assignment || !gb.spaceId) return
    setBusy(true)
    try {
      const item =
        linkedItem ??
        (await db.createGradeItem({
          space_id: gb.spaceId,
          title: assignment.title,
          date: (assignment.due_date ?? new Date().toISOString()).slice(0, 10),
          period_id: gb.period?.id ?? null,
          assignment_id: assignment.id,
          max_score: gb.defaultScale.max_value,
          weight: 1,
        }))
      for (const sub of assignment.submissions) {
        if (sub.grade !== null && sub.grade !== undefined) {
          await db.setGrade(item.id, sub.student_id, { score: sub.grade, flag: 'none' })
        }
      }
      await gb.refresh()
      toast.success(linkedItem ? 'Оценки перенесены в журнал' : 'Задание добавлено в журнал')
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open || !assignment) return
    setComment(assignment.mySubmission?.comment ?? '')
    setAttachments(assignment.mySubmission?.attachments ?? [])
  }, [open, assignment])

  if (!assignment) return null

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
          {canEdit && isTeacher && (
            <>
              <button className="cf-btn-ghost" onClick={pushToGradebook} disabled={busy}>
                <GraduationCap size={15} />
                {linkedItem ? 'Обновить в журнале' : 'В журнал'}
              </button>
              <button className="cf-btn-ghost" onClick={() => onEdit(assignment)}>
                Редактировать
              </button>
            </>
          )}
          {!isTeacher && (
            <button className="cf-btn-brand" onClick={submit} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {assignment.mySubmission?.status === 'submitted' ? 'Обновить работу' : 'Сдать работу'}
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
        {!isTeacher && (
          <section className="rounded-card border border-line bg-surface-2/40 p-4">
            <h4 className="mb-2.5 text-[13px] font-semibold text-ink">Моя работа</h4>
            {assignment.mySubmission?.grade != null && (
              <p className="mb-3 text-[13px]" style={{ color: 'var(--cf-green-acc)' }}>
                Оценка: <b>{assignment.mySubmission.grade}</b>
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

        {/* Учитель: список сдач */}
        {isTeacher && (
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
                      </p>
                      {s.comment && <p className="mt-1.5 text-[13px] text-ink-2">{s.comment}</p>}
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={maxGrade}
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
