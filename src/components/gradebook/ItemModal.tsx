import { useEffect, useMemo, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { cx, toDateInput, uid } from '@/lib/utils'
import { trimNumber } from '@/lib/grading'
import type { GradeCriterion, GradeItem } from '@/lib/types'
import type { GradebookApi } from '@/hooks/useGradebook'

/** Создание и редактирование колонки журнала (работы) */
export function ItemModal({
  gb,
  open,
  item,
  lessonId = null,
  onClose,
}: {
  gb: GradebookApi
  open: boolean
  item: GradeItem | null
  /** Занятие, из которого создают работу */
  lessonId?: string | null
  onClose: () => void
}) {
  const toast = useToast()
  const { assignments } = useApp()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState<string>('')
  const [periodId, setPeriodId] = useState<string>('')
  const [scaleId, setScaleId] = useState<string>('')
  const [maxScore, setMaxScore] = useState('5')
  const [weight, setWeight] = useState('1')
  const [assignmentId, setAssignmentId] = useState<string>('')
  const [lesson, setLesson] = useState<string>('')
  const [busy, setBusy] = useState(false)
  /** Черновик критериев: у новых работ id временный, при сохранении создаются заново */
  const [criteria, setCriteria] = useState<DraftCriterion[]>([])

  const criteriaTotal = useMemo(
    () => criteria.reduce((sum, c) => sum + (Number(c.max_score.replace(',', '.')) || 0), 0),
    [criteria],
  )

  const scale = useMemo(
    () => gb.scales.find((s) => s.id === scaleId) ?? gb.defaultScale,
    [gb.scales, gb.defaultScale, scaleId],
  )

  useEffect(() => {
    if (!open) return
    if (item) {
      setTitle(item.title)
      setDate(item.date.slice(0, 10))
      setCategoryId(item.category_id ?? '')
      setPeriodId(item.period_id ?? '')
      setScaleId(item.scale_id ?? '')
      setMaxScore(trimNumber(item.max_score))
      setWeight(trimNumber(item.weight))
      setAssignmentId(item.assignment_id ?? '')
      setLesson(item.lesson_id ?? '')
      setCriteria(
        gb.criteria
          .filter((c) => c.item_id === item.id)
          .sort((a, b) => a.position - b.position)
          .map(toDraft),
      )
    } else {
      setTitle('')
      setDate(new Date().toISOString().slice(0, 10))
      setCategoryId(gb.categories[0]?.id ?? '')
      setPeriodId(gb.period?.id ?? '')
      setScaleId('')
      setMaxScore(trimNumber(gb.defaultScale.max_value))
      setWeight('1')
      setAssignmentId('')
      setLesson(lessonId ?? '')
      setCriteria([])
    }
  }, [open, item, lessonId, gb.categories, gb.period, gb.defaultScale, gb.criteria])

  // Сменили шкалу — подставляем её максимум, если пользователь его не трогал
  useEffect(() => {
    if (!open || item || criteria.length) return
    setMaxScore(trimNumber(scale.max_value))
  }, [scale, open, item, criteria.length])

  // Есть критерии — максимум работы равен сумме их баллов
  useEffect(() => {
    if (!open || !criteria.length) return
    setMaxScore(trimNumber(criteriaTotal))
  }, [criteriaTotal, criteria.length, open])

  async function save() {
    if (!gb.spaceId) return
    if (!title.trim()) {
      toast.error('Укажите название работы')
      return
    }
    setBusy(true)
    try {
      const payload = {
        title: title.trim(),
        date,
        period_id: periodId || null,
        category_id: categoryId || null,
        lesson_id: lesson || null,
        assignment_id: assignmentId || null,
        max_score: Number(maxScore.replace(',', '.')) || scale.max_value,
        weight: Number(weight.replace(',', '.')) || 1,
        scale_id: scaleId || null,
      }
      const saved = item
        ? await db.updateGradeItem(item.id, payload)
        : await db.createGradeItem({ space_id: gb.spaceId, ...payload })

      await syncCriteria(saved.id)
      await gb.refresh()
      toast.success(item ? 'Работа обновлена' : 'Работа добавлена в журнал')
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  /** Приводит критерии работы к тому, что видно в форме */
  async function syncCriteria(itemId: string) {
    if (!gb.spaceId) return
    const existing = gb.criteria.filter((c) => c.item_id === itemId)
    const keep = new Set(criteria.filter((c) => !c.isNew).map((c) => c.id))

    for (const gone of existing.filter((c) => !keep.has(c.id))) {
      await db.deleteCriterion(gone.id)
    }
    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i]
      const max = Number(c.max_score.replace(',', '.')) || 1
      if (c.isNew) {
        await db.createCriterion({
          space_id: gb.spaceId,
          item_id: itemId,
          title: c.title.trim() || `Критерий ${i + 1}`,
          description: null,
          max_score: max,
          position: i,
        })
      } else {
        const before = existing.find((x) => x.id === c.id)
        if (!before || before.title !== c.title || before.max_score !== max || before.position !== i) {
          await db.updateCriterion(c.id, {
            title: c.title.trim() || `Критерий ${i + 1}`,
            max_score: max,
            position: i,
          })
        }
      }
    }
  }

  const linkable = assignments.filter((a) => a.space_id === gb.spaceId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Работа в журнале' : 'Новая работа'}
      subtitle="Колонка журнала: контрольная, домашняя, устный ответ, проект"
      footer={
        <>
          <button className="cf-btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand" onClick={save} disabled={busy}>
            {item ? 'Сохранить' : 'Добавить'}
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
            placeholder="Контрольная по теме «Квадратные уравнения»"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Дата">
            <input
              type="date"
              className="cf-input w-full"
              value={toDateInput(date) || date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Период">
            <select className="cf-input w-full" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">По дате</option>
              {gb.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Тип работы и вес"
          hint="Вес типа умножается на вес работы при расчёте среднего балла; типы настраиваются в «Настройках»"
        >
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
                {c.code ? `${c.code} · ${c.name}` : c.name} · ×{trimNumber(c.weight)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Шкала">
            <select className="cf-input w-full" value={scaleId} onChange={(e) => setScaleId(e.target.value)}>
              <option value="">{gb.defaultScale.name} (по умолчанию)</option>
              {gb.scales
                .filter((s) => !s.is_default)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Максимум">
            <input
              className="cf-input w-full"
              inputMode="decimal"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </Field>
          <Field label="Вес работы">
            <input
              className="cf-input w-full"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Field>
        </div>

        {!!gb.periodLessons.length && (
          <Field label="Занятие" hint="Работа появится в карточке урока в разделе «Уроки»">
            <select className="cf-input w-full" value={lesson} onChange={(e) => setLesson(e.target.value)}>
              <option value="">Без привязки к занятию</option>
              {gb.periodLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.date.slice(0, 10)} · {l.title}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field
          label="Критерии оценивания"
          hint={
            criteria.length
              ? `Максимум работы = сумма критериев: ${trimNumber(criteriaTotal)} балл(ов). В журнале клетка откроет разбор по критериям.`
              : 'Необязательно. Добавьте свои критерии — работа будет оцениваться по каждому отдельно, а в журнал попадёт сумма.'
          }
        >
          <div className="space-y-2">
            {criteria.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                <GripVertical size={15} className="shrink-0 text-ink-3" />
                <input
                  className="cf-input min-w-0 flex-1"
                  value={c.title}
                  placeholder={`Критерий ${i + 1} — например, «Аргументация»`}
                  onChange={(e) =>
                    setCriteria((cs) =>
                      cs.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className="cf-input w-[86px] text-center"
                  inputMode="decimal"
                  value={c.max_score}
                  title="Максимальный балл за критерий"
                  onChange={(e) =>
                    setCriteria((cs) =>
                      cs.map((x) => (x.id === c.id ? { ...x, max_score: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  className="cf-icon-btn shrink-0"
                  aria-label="Удалить критерий"
                  onClick={() => setCriteria((cs) => cs.filter((x) => x.id !== c.id))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
                onClick={() =>
                  setCriteria((cs) => [
                    ...cs,
                    { id: uid('new'), title: '', max_score: '1', isNew: true },
                  ])
                }
              >
                <Plus size={14} /> Критерий
              </button>
              {!criteria.length && (
                <button
                  type="button"
                  className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
                  onClick={() => setCriteria(PRESET_CRITERIA.map(draftFromPreset))}
                >
                  Взять типовой набор
                </button>
              )}
            </div>
          </div>
        </Field>

        {!!linkable.length && (
          <Field
            label="Связать с заданием"
            hint="Оценка за сданную работу автоматически попадёт в эту колонку журнала"
          >
            <select
              className="cf-input w-full"
              value={assignmentId}
              onChange={(e) => {
                setAssignmentId(e.target.value)
                const a = linkable.find((x) => x.id === e.target.value)
                if (a && !title.trim()) setTitle(a.title)
              }}
            >
              <option value="">Без связи</option>
              {linkable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </Field>
        )}
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
  // Не <label>: внутри бывает несколько контролов, и обёртка ломала бы
  // доступные имена вложенных кнопок.
  return (
    <div className="block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-ink-3">{hint}</span>}
    </div>
  )
}


/* --------------------------- критерии: черновик --------------------------- */

interface DraftCriterion {
  id: string
  title: string
  max_score: string
  isNew?: boolean
}

function toDraft(c: GradeCriterion): DraftCriterion {
  return { id: c.id, title: c.title, max_score: trimNumber(c.max_score) }
}

/** Типовой набор критериев — точка старта, учитель меняет под себя */
const PRESET_CRITERIA: Array<{ title: string; max: number }> = [
  { title: 'Знание материала', max: 2 },
  { title: 'Правильность решения', max: 3 },
  { title: 'Аргументация и логика', max: 2 },
  { title: 'Оформление', max: 1 },
]

function draftFromPreset(p: { title: string; max: number }): DraftCriterion {
  return { id: uid('new'), title: p.title, max_score: String(p.max), isNew: true }
}
