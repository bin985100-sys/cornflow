import { useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { ColorPicker, EmptyState } from '@/components/ui/primitives'
import { cardPalette, cx } from '@/lib/utils'
import type { SchoolApi } from '@/hooks/useSchool'
import type { CardColor, SubjectView } from '@/lib/types'

/**
 * Предметы. У предмета три вещи: название, классы, где его можно проводить,
 * и типы оценивания. Типы переносятся в журнал курса при назначении предмета
 * группе — учителю не нужно заводить их заново.
 */
export function SubjectsSection({ school }: { school: SchoolApi }) {
  const [creating, setCreating] = useState(false)

  return (
    <section className="space-y-4">
      {school.isAdmin && (
        <div className="cf-card flex flex-wrap items-center gap-2 p-3">
          <span className="text-[13px] text-ink-2">Предметов: {school.subjects.length}</span>
          <button className="cf-btn-brand ml-auto px-4" onClick={() => setCreating(true)}>
            <Plus size={15} /> Новый предмет
          </button>
        </div>
      )}

      {school.subjects.length === 0 ? (
        <EmptyState
          title="Предметов пока нет"
          description="Предмет — это название, список классов и типы оценивания, которые на нём разрешены."
        />
      ) : (
        <div className="space-y-3">
          {school.subjects.map((subject) => (
            <SubjectCard key={subject.id} subject={subject} school={school} />
          ))}
        </div>
      )}

      {creating && <SubjectModal school={school} onClose={() => setCreating(false)} />}
    </section>
  )
}

function SubjectCard({ subject, school }: { subject: SubjectView; school: SchoolApi }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const palette = cardPalette[subject.color]

  return (
    <div className="cf-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <span className="h-3.5 w-3.5 rounded-full" style={{ background: palette.accent }} />
        <h3 className="text-[15px] font-semibold">{subject.name}</h3>
        {subject.code && (
          <span className="cf-pill border-brand/25 bg-brand-soft px-2 py-[2px] text-[11px] text-brand">
            {subject.code}
          </span>
        )}
        {school.isAdmin && (
          <div className="ml-auto flex items-center gap-1.5">
            <button className="cf-btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => setEditing(true)}>
              Изменить
            </button>
            <button className="cf-icon-btn" onClick={() => setConfirm(true)} title="Удалить">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Классы</p>
          {subject.class_ids.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">Не ограничен — предмет можно вести в любом классе</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {subject.class_ids.map((id) => (
                <span key={id} className="cf-pill px-2.5 py-[3px] text-[11.5px] font-semibold">
                  {school.classLabel(id)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Типы оценивания</p>
          {subject.assessment_types.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">Не заданы — журнал получит набор по умолчанию</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {subject.assessment_types.map((t) => (
                <span
                  key={t.id}
                  className="cf-pill px-2.5 py-[3px] text-[11.5px] font-semibold"
                  style={{ background: cardPalette[t.color].bg, color: cardPalette[t.color].accent }}
                  title={`Вес ${t.weight}${t.counts_toward_grade ? '' : ' · не идёт в средний балл'}`}
                >
                  {t.code || t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && <SubjectModal school={school} subject={subject} onClose={() => setEditing(false)} />}

      <ConfirmDialog
        open={confirm}
        title={`Удалить предмет «${subject.name}»?`}
        description="Удалятся типы оценивания предмета и его назначения группам. Уже созданные курсы останутся."
        confirmLabel="Удалить"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false)
          try {
            await db.deleteSubject(subject.id)
            await school.refresh()
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </div>
  )
}

function SubjectModal({
  school,
  subject,
  onClose,
}: {
  school: SchoolApi
  subject?: SubjectView
  onClose: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(subject?.name ?? '')
  const [code, setCode] = useState(subject?.code ?? '')
  const [color, setColor] = useState<CardColor>(subject?.color ?? 'blue')
  const [classIds, setClassIds] = useState<string[]>(subject?.class_ids ?? [])
  const [busy, setBusy] = useState(false)

  function toggleClass(id: string) {
    setClassIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  }

  function toggleParallel(parallelId: string) {
    const ids = school.classesByParallel(parallelId).map((c) => c.id)
    const all = ids.every((id) => classIds.includes(id))
    setClassIds((list) => (all ? list.filter((x) => !ids.includes(x)) : [...new Set([...list, ...ids])]))
  }

  async function save() {
    if (!school.schoolId || !name.trim()) return
    setBusy(true)
    try {
      if (subject) {
        await db.updateSubject(subject.id, { name, code: code || null, color, class_ids: classIds })
      } else {
        await db.createSubject({
          school_id: school.schoolId,
          name,
          code: code || null,
          color,
          class_ids: classIds,
        })
      }
      await school.refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={subject ? 'Предмет' : 'Новый предмет'} size="lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <div>
            <span className="mb-1 block text-[12.5px] text-ink-2">Название</span>
            <input
              className="cf-input w-full"
              placeholder="Алгебра"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <span className="mb-1 block text-[12.5px] text-ink-2">Код</span>
            <input
              className="cf-input w-full"
              placeholder="ALG"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-[12.5px] text-ink-2">Цвет</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div>
          <span className="mb-1.5 block text-[12.5px] text-ink-2">
            В каких классах можно проводить
          </span>
          {school.parallels.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">Сначала заведите параллели и классы.</p>
          ) : (
            <div className="space-y-2">
              {school.parallels.map((parallel) => (
                <div key={parallel.id} className="flex flex-wrap items-center gap-1.5">
                  <button
                    className="cf-pill px-2.5 py-[3px] text-[11.5px] font-semibold text-ink-2"
                    onClick={() => toggleParallel(parallel.id)}
                    title="Выбрать всю параллель"
                  >
                    {parallel.name}
                  </button>
                  {school.classesByParallel(parallel.id).map((klass) => {
                    const on = classIds.includes(klass.id)
                    return (
                      <button
                        key={klass.id}
                        onClick={() => toggleClass(klass.id)}
                        className={cx(
                          'cf-pill px-2.5 py-[3px] text-[11.5px] font-semibold transition-colors',
                          on ? 'border-brand/30 bg-brand-soft text-brand' : 'text-ink-3',
                        )}
                      >
                        {on && <Check size={12} className="mr-1 inline" />}
                        {parallel.name}
                        {klass.name}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[12px] text-ink-3">
            Ничего не выбрано — предмет доступен во всех классах.
          </p>
        </div>

        {subject && <AssessmentTypes subject={subject} school={school} />}

        <div className="flex justify-end gap-2">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand px-4" disabled={busy || !name.trim()} onClick={() => void save()}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* --------------------------- типы оценивания ------------------------------ */

function AssessmentTypes({ subject, school }: { subject: SubjectView; school: SchoolApi }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [weight, setWeight] = useState('1')

  async function add() {
    if (!name.trim()) return
    try {
      await db.addAssessmentType(subject.id, {
        name: name.trim(),
        code: code.trim() || null,
        weight: Number(weight) || 1,
        color: 'blue',
        counts_toward_grade: true,
        position: subject.assessment_types.length,
      })
      setName('')
      setCode('')
      setWeight('1')
      await school.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div className="rounded-[18px] border border-line p-3">
      <p className="text-[12.5px] font-semibold text-ink-2">Типы оценивания</p>
      <p className="mt-0.5 text-[12px] text-ink-3">
        Эти типы получит журнал курса, когда предмет назначат группе. Вес умножается на вес
        конкретной работы при подсчёте среднего балла.
      </p>

      <div className="mt-2 space-y-1.5">
        {subject.assessment_types.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="font-semibold">{t.name}</span>
            {t.code && <span className="cf-pill px-2 py-[1px] text-[11px]">{t.code}</span>}
            <span className="text-ink-3">вес {t.weight}</span>
            <label className="flex items-center gap-1 text-ink-3">
              <input
                type="checkbox"
                checked={t.counts_toward_grade}
                onChange={async (e) => {
                  await db.updateAssessmentType(t.id, { counts_toward_grade: e.target.checked })
                  await school.refresh()
                }}
              />
              в среднем балле
            </label>
            <button
              className="ml-auto cf-icon-btn"
              title="Удалить"
              onClick={async () => {
                await db.deleteAssessmentType(t.id)
                await school.refresh()
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          className="cf-input h-9 flex-1 min-w-[140px] py-0 text-[12.5px]"
          placeholder="Суммативная работа"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="cf-input h-9 w-20 py-0 text-[12.5px]"
          placeholder="SA"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          className="cf-input h-9 w-16 py-0 text-[12.5px]"
          placeholder="вес"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
        <button className="cf-btn-ghost px-3 text-[12.5px]" disabled={!name.trim()} onClick={() => void add()}>
          <Plus size={14} /> Тип
        </button>
      </div>
    </div>
  )
}
