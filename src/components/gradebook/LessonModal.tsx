import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { cx } from '@/lib/utils'
import type { Lesson } from '@/lib/types'
import type { GradebookApi } from '@/hooks/useGradebook'

/** Создание и редактирование занятия. Тип, статус и важность — из справочников. */
export function LessonModal({
  gb,
  open,
  lesson,
  onClose,
}: {
  gb: GradebookApi
  open: boolean
  lesson: Lesson | null
  onClose: () => void
}) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [startsAt, setStartsAt] = useState('')
  const [duration, setDuration] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [statusId, setStatusId] = useState('')
  const [priorityId, setPriorityId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [homework, setHomework] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (lesson) {
      setTitle(lesson.title)
      setTopic(lesson.topic ?? '')
      setDate(lesson.date.slice(0, 10))
      setStartsAt(lesson.starts_at ?? '')
      setDuration(lesson.duration_min ? String(lesson.duration_min) : '')
      setCategoryId(lesson.category_id ?? '')
      setStatusId(lesson.status_id ?? '')
      setPriorityId(lesson.priority_id ?? '')
      setPeriodId(lesson.period_id ?? '')
      setHomework(lesson.homework ?? '')
      setNotes(lesson.notes ?? '')
    } else {
      setTitle('')
      setTopic('')
      setDate(new Date().toISOString().slice(0, 10))
      setStartsAt('')
      setDuration('')
      setCategoryId('')
      setStatusId(gb.lessonStatuses.find((x) => x.is_default)?.id ?? '')
      setPriorityId('')
      setPeriodId(gb.period?.id ?? '')
      setHomework('')
      setNotes('')
    }
  }, [open, lesson, gb.lessonStatuses, gb.period])

  // Сменили тип занятия — подставляем его важность, если своя не выбрана
  useEffect(() => {
    if (!open || lesson || !categoryId) return
    const cat = gb.categories.find((c) => c.id === categoryId)
    if (cat?.default_priority_id) setPriorityId(cat.default_priority_id)
  }, [categoryId, open, lesson, gb.categories])

  async function save() {
    if (!gb.spaceId) return
    if (!title.trim()) {
      toast.error('Укажите название занятия')
      return
    }
    setBusy(true)
    try {
      const payload = {
        title: title.trim(),
        topic: topic.trim() || null,
        date,
        starts_at: startsAt || null,
        duration_min: duration ? Number(duration) : null,
        category_id: categoryId || null,
        status_id: statusId || null,
        priority_id: priorityId || null,
        period_id: periodId || null,
        homework: homework.trim() || null,
        notes: notes.trim() || null,
      }
      if (lesson) await db.updateLesson(lesson.id, payload)
      else await db.createLesson({ space_id: gb.spaceId, ...payload })
      await gb.refresh()
      toast.success(lesson ? 'Занятие обновлено' : 'Занятие добавлено')
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
      title={lesson ? 'Занятие' : 'Новое занятие'}
      subtitle="К занятию прикрепляются задания и работы журнала"
      footer={
        <>
          <button className="cf-btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand" onClick={save} disabled={busy}>
            {lesson ? 'Сохранить' : 'Добавить'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Название">
          <input
            className="cf-input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Урок 12 · Квадратные уравнения"
            autoFocus
          />
        </Field>

        <Field label="Тема занятия">
          <input
            className="cf-input w-full"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Что разбираем"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Дата">
            <input
              type="date"
              className="cf-input w-full"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Начало">
            <input
              type="time"
              className="cf-input w-full"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="Длительность, мин">
            <input
              className="cf-input w-full"
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="45"
            />
          </Field>
        </div>

        <Field label="Тип занятия" hint="Список типов настраивается в разделе «Настройки»">
          <div className="flex flex-wrap gap-2">
            {gb.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id === categoryId ? '' : c.id)}
                className={cx(
                  'cf-pill px-3 py-1.5 text-[12.5px] transition',
                  categoryId === c.id ? 'ring-2' : 'opacity-80 hover:opacity-100',
                )}
                style={{
                  background: `var(--cf-${c.color}-bg)`,
                  color: `var(--cf-${c.color}-acc)`,
                  borderColor: `color-mix(in srgb, var(--cf-${c.color}-acc) 30%, transparent)`,
                  ...(categoryId === c.id
                    ? ({ '--tw-ring-color': `var(--cf-${c.color}-acc)` } as React.CSSProperties)
                    : {}),
                }}
              >
                {c.code ? `${c.code} · ${c.name}` : c.name}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Статус">
            <select
              className="cf-input w-full"
              value={statusId}
              onChange={(e) => setStatusId(e.target.value)}
            >
              <option value="">Не задан</option>
              {gb.lessonStatuses.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Важность">
            <select
              className="cf-input w-full"
              value={priorityId}
              onChange={(e) => setPriorityId(e.target.value)}
            >
              <option value="">Не задана</option>
              {gb.lessonPriorities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Период">
            <select
              className="cf-input w-full"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              <option value="">По дате</option>
              {gb.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Домашнее задание" hint="Ученики увидят его в дневнике под занятием">
          <textarea
            className="cf-input min-h-[70px] w-full resize-y"
            value={homework}
            onChange={(e) => setHomework(e.target.value)}
            placeholder="Что сделать к следующему занятию"
          />
        </Field>

        <Field label="Заметка учителя" hint="Видна только тем, кто может редактировать пространство">
          <textarea
            className="cf-input min-h-[60px] w-full resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-ink-3">{hint}</span>}
    </div>
  )
}
