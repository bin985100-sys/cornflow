import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ClipboardList,
  Clock,
  GraduationCap,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { db } from '@/lib/db'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { Menu } from '@/components/ui/Menu'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/primitives'
import { gradePalette, itemAverage, trimNumber } from '@/lib/grading'
import { cx, formatDate } from '@/lib/utils'
import type { GradeItem, Lesson } from '@/lib/types'
import type { GradebookApi } from '@/hooks/useGradebook'
import { LessonModal } from './LessonModal'

/**
 * Раздел «Уроки»: занятия по датам, у каждого свой тип, статус и важность,
 * к занятию прикреплены задания и работы журнала.
 */
export function LessonsBoard({
  gb,
  onEditItem,
  onCreateItemForLesson,
}: {
  gb: GradebookApi
  onEditItem: (item: GradeItem) => void
  onCreateItemForLesson: (lesson: Lesson) => void
}) {
  const toast = useToast()
  const { assignments } = useApp()
  const [modal, setModal] = useState<{ open: boolean; lesson: Lesson | null }>({
    open: false,
    lesson: null,
  })
  const [confirm, setConfirm] = useState<Lesson | null>(null)
  const { canEdit } = gb

  const byDate = useMemo(() => {
    const map = new Map<string, Lesson[]>()
    for (const l of [...gb.periodLessons].sort(
      (a, b) => b.date.localeCompare(a.date) || (a.starts_at ?? '').localeCompare(b.starts_at ?? ''),
    )) {
      const key = l.date.slice(0, 10)
      map.set(key, [...(map.get(key) ?? []), l])
    }
    return [...map.entries()]
  }, [gb.periodLessons])

  async function setStatus(lesson: Lesson, statusId: string) {
    try {
      await db.updateLesson(lesson.id, { status_id: statusId })
      await gb.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  if (!gb.periodLessons.length) {
    return (
      <>
        <EmptyState
          title="Занятий пока нет"
          description="Добавьте урок — к нему можно прикрепить задания и работы журнала, задать статус и важность, записать тему и домашнее задание."
          art="calendar"
          action={
            canEdit && (
              <button className="cf-btn-brand" onClick={() => setModal({ open: true, lesson: null })}>
                <Plus size={16} /> Добавить занятие
              </button>
            )
          }
        />
        <LessonModalHost gb={gb} modal={modal} setModal={setModal} />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-3">
          {gb.periodLessons.length} занятий{gb.period ? ` · ${gb.period.name}` : ''}
        </p>
        {canEdit && (
          <button className="cf-btn-brand" onClick={() => setModal({ open: true, lesson: null })}>
            <Plus size={16} /> Занятие
          </button>
        )}
      </div>

      <div className="space-y-5">
        {byDate.map(([date, lessons]) => (
          <section key={date}>
            <h3 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-ink-3">
              <CalendarDays size={13} /> {formatDate(date)}
            </h3>

            <div className="space-y-2.5">
              {lessons.map((lesson) => {
                const category = gb.categoryOf(lesson)
                const status = gb.statusOf(lesson)
                const priority = gb.priorityOf(lesson)
                const items = gb.items.filter((i) => i.lesson_id === lesson.id)
                const linked = assignments.filter((a) => a.lesson_id === lesson.id)

                return (
                  <article key={lesson.id} className="cf-card p-4">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {lesson.starts_at && (
                            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3">
                              <Clock size={12} /> {lesson.starts_at}
                              {lesson.duration_min ? ` · ${lesson.duration_min} мин` : ''}
                            </span>
                          )}
                          {category && (
                            <span
                              className="cf-pill px-2 py-[2px] text-[11.5px] font-semibold"
                              style={{
                                background: `var(--cf-${category.color}-bg)`,
                                color: `var(--cf-${category.color}-acc)`,
                                borderColor: `color-mix(in srgb, var(--cf-${category.color}-acc) 26%, transparent)`,
                              }}
                              title={
                                category.counts_toward_grade
                                  ? `Учитывается в среднем балле, вес ×${trimNumber(category.weight)}`
                                  : 'Не влияет на средний балл'
                              }
                            >
                              {category.code ?? category.name}
                            </span>
                          )}
                          {priority && (
                            <span
                              className="cf-pill px-2 py-[2px] text-[11.5px]"
                              style={{
                                background: `var(--cf-${priority.color}-bg)`,
                                color: `var(--cf-${priority.color}-acc)`,
                                borderColor: `color-mix(in srgb, var(--cf-${priority.color}-acc) 26%, transparent)`,
                              }}
                              title="Важность занятия"
                            >
                              {priority.name}
                            </span>
                          )}
                        </div>

                        <p className="mt-1.5 text-[15px] font-semibold">{lesson.title}</p>
                        {lesson.topic && (
                          <p className="mt-0.5 text-[13px] text-ink-2">{lesson.topic}</p>
                        )}
                      </div>

                      {/* статус — меняется в один клик */}
                      {canEdit ? (
                        <Menu
                          width={200}
                          trigger={({ toggle }) => (
                            <button
                              onClick={toggle}
                              className="cf-pill px-2.5 py-1 text-[12px] font-medium transition hover:brightness-95"
                              style={
                                status
                                  ? {
                                      background: `var(--cf-${status.color}-bg)`,
                                      color: `var(--cf-${status.color}-acc)`,
                                      borderColor: `color-mix(in srgb, var(--cf-${status.color}-acc) 30%, transparent)`,
                                    }
                                  : undefined
                              }
                            >
                              {status?.name ?? 'Статус'}
                            </button>
                          )}
                          items={gb.lessonStatuses.map((st) => ({
                            label: st.name,
                            checked: st.id === lesson.status_id,
                            onClick: () => void setStatus(lesson, st.id),
                          }))}
                        />
                      ) : (
                        status && (
                          <span
                            className="cf-pill px-2.5 py-1 text-[12px] font-medium"
                            style={{
                              background: `var(--cf-${status.color}-bg)`,
                              color: `var(--cf-${status.color}-acc)`,
                              borderColor: `color-mix(in srgb, var(--cf-${status.color}-acc) 30%, transparent)`,
                            }}
                          >
                            {status.name}
                          </span>
                        )
                      )}

                      {canEdit && (
                        <Menu
                          width={220}
                          trigger={({ toggle }) => (
                            <button className="cf-icon-btn" onClick={toggle} aria-label="Действия">
                              <MoreVertical size={15} />
                            </button>
                          )}
                          items={[
                            {
                              label: 'Работа в журнал',
                              icon: GraduationCap,
                              onClick: () => onCreateItemForLesson(lesson),
                            },
                            {
                              label: 'Изменить занятие',
                              icon: Pencil,
                              onClick: () => setModal({ open: true, lesson }),
                            },
                            { separator: true, label: '' },
                            {
                              label: 'Удалить занятие',
                              icon: Trash2,
                              danger: true,
                              onClick: () => setConfirm(lesson),
                            },
                          ]}
                        />
                      )}
                    </div>

                    {lesson.homework && (
                      <p className="mt-3 rounded-[14px] bg-canvas px-3 py-2 text-[13px] text-ink-2">
                        <b className="font-semibold text-ink">Домашнее задание. </b>
                        {lesson.homework}
                      </p>
                    )}

                    {canEdit && lesson.notes && (
                      <p className="mt-2 text-[12.5px] text-ink-3">Заметка: {lesson.notes}</p>
                    )}

                    {(items.length > 0 || linked.length > 0) && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {items.map((item) => {
                          const avg = itemAverage(item, gb.grades, gb.scaleFor(item))
                          return (
                            <button
                              key={item.id}
                              onClick={() => canEdit && onEditItem(item)}
                              className={cx(
                                'cf-pill border-line bg-canvas px-2.5 py-1 text-[12px] text-ink-2',
                                canEdit && 'transition hover:border-brand/40 hover:text-ink',
                              )}
                              title={`Работа журнала · макс ${trimNumber(item.max_score)}`}
                            >
                              <GraduationCap size={12} />
                              {item.title}
                              {avg !== null && (
                                <span
                                  className="ml-1 font-semibold"
                                  style={{ color: gradePalette.green.fg }}
                                >
                                  {Math.round(avg)}%
                                </span>
                              )}
                            </button>
                          )
                        })}
                        {linked.map((a) => (
                          <span
                            key={a.id}
                            className="cf-pill border-line bg-canvas px-2.5 py-1 text-[12px] text-ink-2"
                            title="Задание, прикреплённое к занятию"
                          >
                            <ClipboardList size={12} />
                            {a.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <LessonModalHost gb={gb} modal={modal} setModal={setModal} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Удалить занятие «${confirm?.title ?? ''}»?`}
        description="Работы журнала и задания сохранятся — они просто перестанут быть привязаны к занятию."
        onConfirm={async () => {
          if (!confirm) return
          try {
            await db.deleteLesson(confirm.id)
            await gb.refresh()
            toast.success('Занятие удалено')
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </div>
  )
}

function LessonModalHost({
  gb,
  modal,
  setModal,
}: {
  gb: GradebookApi
  modal: { open: boolean; lesson: Lesson | null }
  setModal: (v: { open: boolean; lesson: Lesson | null }) => void
}) {
  return (
    <LessonModal
      gb={gb}
      open={modal.open}
      lesson={modal.lesson}
      onClose={() => setModal({ open: false, lesson: null })}
    />
  )
}
