import { useMemo, useState } from 'react'
import { BookMarked, Copy, ListTree, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { useCurricula, type CurriculaApi } from '@/hooks/useCurricula'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { CardSkeletonGrid, EmptyState } from '@/components/ui/primitives'
import { cardPalette, plural } from '@/lib/utils'
import type { CurriculumLesson, CurriculumView } from '@/lib/types'

/**
 * Календарно-тематическое планирование.
 *
 * План — свой у каждого учителя: темы, внутри тем уроки, у урока тип, теория
 * и задание. Чужой план можно взять за основу — копией, а не ссылкой, иначе
 * правки одного поедут у всех.
 *
 * План курса заводится сам при первом занятии, так что начинать с пустого
 * экрана обычно не приходится.
 */
export function CurriculumPage() {
  const api = useCurricula()
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  if (api.loading) return <CardSkeletonGrid count={3} />

  if (!api.schoolId) {
    return (
      <EmptyState
        title="Планы живут внутри школы"
        description="КТП ведут учителя школы. Если вы работаете в обычном пространстве, планирование не понадобится."
      />
    )
  }

  const current = api.all.find((c) => c.id === open) ?? null

  return (
    <div className="animate-fade-up space-y-5">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">Планы</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Темы и уроки по предмету. План курса заводится сам при первом занятии — здесь его
            остаётся разложить по темам.
          </p>
        </div>
        <button className="cf-btn-brand px-4" onClick={() => setCreating(true)}>
          <Plus size={15} /> Новый план
        </button>
      </header>

      <Group title="Мои планы" plans={api.mine} api={api} onOpen={setOpen} />
      <Group title="Планы коллег" plans={api.others} api={api} onOpen={setOpen} borrow />

      {api.all.length === 0 && (
        <EmptyState
          title="Планов пока нет"
          description="Заведите план сами или просто начните вести занятия: план курса появится автоматически, а занятия будут попадать в него по порядку."
        />
      )}

      {creating && <PlanModal api={api} onClose={() => setCreating(false)} />}
      {current && <PlanEditor plan={current} api={api} onClose={() => setOpen(null)} />}
    </div>
  )
}

function Group({
  title,
  plans,
  api,
  onOpen,
  borrow,
}: {
  title: string
  plans: CurriculumView[]
  api: CurriculaApi
  onOpen: (id: string) => void
  borrow?: boolean
}) {
  const toast = useToast()
  if (!plans.length) return null

  async function copy(plan: CurriculumView) {
    try {
      const id = await db.copyCurriculum(plan.id, api.personId, `${plan.name} (мой вариант)`)
      await api.refresh()
      onOpen(id)
      toast.success('Копия готова — правьте как свою')
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h2>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const lessons = plan.topics.reduce((n, t) => n + t.lessons.length, 0) + plan.loose.length
          return (
            <li key={plan.id} className="cf-card flex flex-col gap-2 p-3.5">
              <div className="flex items-start gap-2">
                <BookMarked size={16} className="mt-0.5 shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{plan.name}</p>
                  <p className="truncate text-[12px] text-ink-3">{api.subjectName(plan.subject_id)}</p>
                </div>
                {plan.is_auto && (
                  <span
                    className="cf-pill shrink-0 px-2 py-[2px] text-[10.5px] text-ink-3"
                    title="Создан автоматически при первом занятии курса"
                  >
                    авто
                  </span>
                )}
              </div>

              <p className="text-[12px] text-ink-3">
                {plural(plan.topics.length, 'тема', 'темы', 'тем')} ·{' '}
                {plural(lessons, 'урок', 'урока', 'уроков')}
              </p>

              <div className="mt-auto flex gap-1.5 pt-1">
                <button className="cf-btn-ghost px-3 text-[12.5px]" onClick={() => onOpen(plan.id)}>
                  <ListTree size={14} /> {borrow ? 'Посмотреть' : 'Открыть'}
                </button>
                {borrow && (
                  <button
                    className="cf-btn-ghost px-3 text-[12.5px]"
                    title="Копия: правки не затронут оригинал"
                    onClick={() => void copy(plan)}
                  >
                    <Copy size={14} /> За основу
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ------------------------------ редактор --------------------------------- */

function PlanEditor({
  plan,
  api,
  onClose,
}: {
  plan: CurriculumView
  api: CurriculaApi
  onClose: () => void
}) {
  const toast = useToast()
  const editable = api.canEdit(plan)
  const [topicName, setTopicName] = useState('')
  const [lesson, setLesson] = useState<{ topicId: string | null; row: CurriculumLesson | null } | null>(null)
  const [confirmPlan, setConfirmPlan] = useState(false)

  const total = useMemo(
    () => plan.topics.reduce((n, t) => n + t.lessons.length, 0) + plan.loose.length,
    [plan],
  )

  async function addTopic() {
    if (!topicName.trim()) return
    try {
      await db.createTopic(plan.id, topicName)
      setTopicName('')
      await api.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  async function removeTopic(id: string) {
    try {
      await db.deleteTopic(id)
      await api.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  async function removeLesson(id: string) {
    try {
      await db.deletePlanLesson(id)
      await api.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <Modal open onClose={onClose} title={plan.name} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
          <span>{api.subjectName(plan.subject_id)}</span>
          <span>·</span>
          <span>{plural(total, 'урок', 'урока', 'уроков')}</span>
          {!editable && (
            <span className="cf-pill ml-auto px-2.5 py-[2px] text-[11.5px]">
              Чужой план — только чтение
            </span>
          )}
          {editable && (
            <button
              className="cf-btn-ghost ml-auto px-3 text-[12.5px] text-red-500"
              onClick={() => setConfirmPlan(true)}
            >
              <Trash2 size={14} /> Удалить план
            </button>
          )}
        </div>

        {editable && (
          <div className="flex gap-2">
            <input
              className="cf-input flex-1"
              placeholder="Новая тема, например «Квадратные уравнения»"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addTopic()}
            />
            <button className="cf-btn-brand px-4" disabled={!topicName.trim()} onClick={() => void addTopic()}>
              <Plus size={15} /> Тема
            </button>
          </div>
        )}

        <div className="space-y-3">
          {plan.topics.map((topic) => (
            <section key={topic.id} className="rounded-[18px] border border-line p-3">
              <header className="mb-2 flex items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{topic.name}</h3>
                <span className="text-[11.5px] text-ink-3">
                  {topic.hours ? `${topic.hours} ч · ` : ''}
                  {plural(topic.lessons.length, 'урок', 'урока', 'уроков')}
                </span>
                {editable && (
                  <button
                    className="text-ink-3 transition-colors hover:text-red-500"
                    title="Удалить тему — её уроки останутся вне тем"
                    onClick={() => void removeTopic(topic.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </header>

              <LessonList
                lessons={topic.lessons}
                api={api}
                editable={editable}
                onEdit={(row) => setLesson({ topicId: topic.id, row })}
                onRemove={removeLesson}
              />

              {editable && (
                <button
                  className="cf-btn-ghost mt-2 px-3 text-[12.5px]"
                  onClick={() => setLesson({ topicId: topic.id, row: null })}
                >
                  <Plus size={14} /> Урок
                </button>
              )}
            </section>
          ))}

          {(plan.loose.length > 0 || plan.topics.length === 0) && (
            <section className="rounded-[18px] border border-dashed border-line p-3">
              <header className="mb-2 flex items-center gap-2">
                <h3 className="flex-1 text-[13.5px] font-semibold text-ink-2">Вне тем</h3>
                <span className="text-[11.5px] text-ink-3">
                  {plural(plan.loose.length, 'урок', 'урока', 'уроков')}
                </span>
              </header>
              <p className="mb-2 text-[12px] text-ink-3">
                Сюда попадают занятия, которые вы провели до того, как разложили план по темам.
              </p>
              <LessonList
                lessons={plan.loose}
                api={api}
                editable={editable}
                onEdit={(row) => setLesson({ topicId: null, row })}
                onRemove={removeLesson}
              />
              {editable && (
                <button
                  className="cf-btn-ghost mt-2 px-3 text-[12.5px]"
                  onClick={() => setLesson({ topicId: null, row: null })}
                >
                  <Plus size={14} /> Урок
                </button>
              )}
            </section>
          )}
        </div>
      </div>

      {lesson && (
        <LessonPlanModal
          plan={plan}
          api={api}
          topicId={lesson.topicId}
          row={lesson.row}
          onClose={() => setLesson(null)}
        />
      )}

      <ConfirmDialog
        open={confirmPlan}
        title="Удалить план?"
        description="Темы и уроки плана исчезнут. Проведённые занятия и оценки останутся на месте."
        confirmLabel="Удалить"
        danger
        onClose={() => setConfirmPlan(false)}
        onConfirm={async () => {
          try {
            await db.deleteCurriculum(plan.id)
            await api.refresh()
            onClose()
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </Modal>
  )
}

function LessonList({
  lessons,
  api,
  editable,
  onEdit,
  onRemove,
}: {
  lessons: CurriculumLesson[]
  api: CurriculaApi
  editable: boolean
  onEdit: (row: CurriculumLesson) => void
  onRemove: (id: string) => void
}) {
  if (!lessons.length) return <p className="text-[12px] text-ink-3">Уроков пока нет</p>
  return (
    <ol className="space-y-1">
      {lessons.map((row, i) => {
        const kind = api.kinds.find((k) => k.id === row.kind_id)
        return (
          <li
            key={row.id}
            className="flex items-start gap-2 rounded-[14px] px-2 py-1.5 transition-colors hover:bg-surface-2"
          >
            <span className="mt-[2px] w-5 shrink-0 text-right font-mono text-[11.5px] text-ink-3">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <span className="truncate">{row.title}</span>
                {kind && (
                  <span
                    className="cf-pill shrink-0 px-2 py-[1px] text-[10.5px]"
                    style={{ color: cardPalette[kind.color].accent }}
                  >
                    {kind.name}
                  </span>
                )}
              </p>
              {(row.theory || row.task) && (
                <p className="truncate text-[12px] text-ink-3">{row.theory || row.task}</p>
              )}
            </div>
            {editable && (
              <div className="flex shrink-0 gap-1">
                <button className="text-ink-3 transition-colors hover:text-ink" onClick={() => onEdit(row)}>
                  <Pencil size={13} />
                </button>
                <button
                  className="text-ink-3 transition-colors hover:text-red-500"
                  onClick={() => onRemove(row.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------- модалки --------------------------------- */

function PlanModal({ api, onClose }: { api: CurriculaApi; onClose: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!api.schoolId || !name.trim()) return
    setBusy(true)
    try {
      await db.createCurriculum({
        school_id: api.schoolId,
        subject_id: subjectId || null,
        owner_id: api.personId,
        name,
      })
      await api.refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Новый план">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Название</span>
          <input
            className="cf-input w-full"
            placeholder="Алгебра, 7 класс"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Предмет</span>
          <select className="cf-input w-full" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">без предмета</option>
            {api.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <p className="flex items-start gap-1.5 text-[12px] text-ink-3">
          <Sparkles size={13} className="mt-[2px] shrink-0" />
          План остаётся вашим: коллеги увидят его и смогут взять за основу, но править будете только вы.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand px-4" disabled={busy || !name.trim()} onClick={() => void save()}>
            Создать
          </button>
        </div>
      </div>
    </Modal>
  )
}

function LessonPlanModal({
  plan,
  api,
  topicId,
  row,
  onClose,
}: {
  plan: CurriculumView
  api: CurriculaApi
  topicId: string | null
  row: CurriculumLesson | null
  onClose: () => void
}) {
  const toast = useToast()
  const [title, setTitle] = useState(row?.title ?? '')
  const [kindId, setKindId] = useState(row?.kind_id ?? '')
  const [theory, setTheory] = useState(row?.theory ?? '')
  const [task, setTask] = useState(row?.task ?? '')
  const [where, setWhere] = useState(row?.topic_id ?? topicId ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!title.trim()) return
    setBusy(true)
    try {
      const patch = {
        title: title.trim(),
        kind_id: kindId || null,
        theory: theory.trim() || null,
        task: task.trim() || null,
        topic_id: where || null,
      }
      if (row) await db.updatePlanLesson(row.id, patch)
      else await db.createPlanLesson({ curriculum_id: plan.id, ...patch })
      await api.refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={row ? 'Урок плана' : 'Новый урок'}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Тема урока</span>
          <input
            className="cf-input w-full"
            placeholder="Дискриминант"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-ink-2">Тип урока</span>
            <select className="cf-input w-full" value={kindId} onChange={(e) => setKindId(e.target.value)}>
              <option value="">без типа</option>
              {api.kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[12.5px] text-ink-2">Тема плана</span>
            <select className="cf-input w-full" value={where} onChange={(e) => setWhere(e.target.value)}>
              <option value="">вне тем</option>
              {plan.topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Теория</span>
          <textarea
            className="cf-input min-h-[70px] w-full resize-y"
            placeholder="Что объясняется на уроке"
            value={theory}
            onChange={(e) => setTheory(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Задание</span>
          <textarea
            className="cf-input min-h-[60px] w-full resize-y"
            placeholder="Что делают на уроке"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand px-4" disabled={busy || !title.trim()} onClick={() => void save()}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}
