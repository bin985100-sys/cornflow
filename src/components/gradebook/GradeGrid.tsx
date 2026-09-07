import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Download, ListChecks, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { Menu } from '@/components/ui/Menu'
import { Avatar, EmptyState } from '@/components/ui/primitives'
import {
  aggregateFor,
  colorForGrade,
  gradeLabel,
  gradePalette,
  itemAverage,
  percentOf,
  sortedLevels,
  toCsv,
  downloadCsv,
  trimNumber,
} from '@/lib/grading'
import { cx, formatDate } from '@/lib/utils'
import type { Grade, GradeItem, GradeLevel } from '@/lib/types'
import type { GradebookApi } from '@/hooks/useGradebook'

interface Props {
  gb: GradebookApi
  onCreateItem: () => void
  onEditItem: (item: GradeItem) => void
}

interface Active {
  r: number
  c: number
}

/** Сетка «ученики × работы»: быстрый ввод с клавиатуры, цвет по шкале, итоги. */
export function GradeGrid({ gb, onCreateItem, onEditItem }: Props) {
  const toast = useToast()
  const { students, periodItems: items, grades, categories, scaleFor, canEdit } = gb
  const [active, setActive] = useState<Active | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [detail, setDetail] = useState<{
    item: GradeItem
    studentId: string
    x: number
    y: number
  } | null>(null)
  const [picker, setPicker] = useState<{
    item: GradeItem
    r: number
    c: number
    x: number
    y: number
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const gradeAt = useCallback(
    (itemId: string, studentId: string): Grade | undefined =>
      grades.find((g) => g.item_id === itemId && g.student_id === studentId),
    [grades],
  )

  const criteriaOf = useCallback(
    (item: GradeItem) =>
      gb.criteria.filter((c) => c.item_id === item.id).sort((a, b) => a.position - b.position),
    [gb.criteria],
  )

  const categoryOf = useCallback(
    (item: GradeItem) => categories.find((c) => c.id === item.category_id) ?? null,
    [categories],
  )

  useEffect(() => {
    if (draft !== null) inputRef.current?.focus()
  }, [draft, active])

  const commit = useCallback(
    async (r: number, c: number, raw: string) => {
      const item = items[c]
      const student = students[r]
      if (!item || !student) return
      const value = raw.trim().toLowerCase().replace(',', '.')
      try {
        if (value === '') {
          await db.clearGrade(item.id, student.id)
        } else if (['н', 'n', 'нб'].includes(value)) {
          await db.setGrade(item.id, student.id, {
            score: null,
            flag: 'absent',
          })
        } else if (['осв', 'о', 'x'].includes(value)) {
          await db.setGrade(item.id, student.id, {
            score: null,
            flag: 'excused',
          })
        } else {
          const num = Number(value)
          if (Number.isNaN(num)) throw new Error('Введите число, «н» (не был) или «осв» (освобождён)')
          const scale = scaleFor(item)
          const min = scale.kind === 'points' ? scale.min_value : 0
          if (num < min || num > item.max_score) {
            throw new Error(`Балл должен быть от ${trimNumber(min)} до ${trimNumber(item.max_score)}`)
          }
          await db.setGrade(item.id, student.id, { score: num, flag: 'none' })
        }
        await gb.refresh()
      } catch (e) {
        toast.error(e)
      }
    },
    [items, students, scaleFor, gb, toast],
  )

  const move = useCallback(
    (dr: number, dc: number) => {
      setActive((a) => {
        if (!a) return a
        const r = Math.min(students.length - 1, Math.max(0, a.r + dr))
        const c = Math.min(items.length - 1, Math.max(0, a.c + dc))
        return { r, c }
      })
      setDraft(null)
    },
    [students.length, items.length],
  )

  async function onCellKey(e: React.KeyboardEvent, r: number, c: number) {
    if (draft !== null) return
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault()
      move(1, 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1, 0)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      move(0, -1)
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault()
      move(0, 1)
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      void commit(r, c, '')
    } else if (e.key.length === 1 && canEdit) {
      const item = items[c]
      const student = students[r]
      // У работы с критериями балл нельзя ввести одним числом — открываем разбор
      if (item && student && criteriaOf(item).length) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setActive({ r, c })
        setDetail({ item, studentId: student.id, x: rect.left, y: rect.bottom + 4 })
        return
      }
      setActive({ r, c })
      setDraft(e.key)
    }
  }

  const exportCsv = useCallback(() => {
    const header = [
      'Ученик',
      ...items.map((i) => `${i.title} (${formatDate(i.date)})`),
      'Средний %',
      'Итог',
    ]
    const rows: Array<Array<string | number | null>> = [header]
    for (const s of students) {
      const agg = aggregateFor(s.id, { items, grades, categories, scaleFor })
      rows.push([
        s.name,
        ...items.map((i) => {
          const g = gradeAt(i.id, s.id)
          return g ? gradeLabel(g, i, scaleFor(i)) : ''
        }),
        agg.percent === null ? '' : Math.round(agg.percent),
        agg.level?.label ?? '',
      ])
    }
    downloadCsv('cornflow-журнал.csv', toCsv(rows))
  }, [items, students, grades, categories, scaleFor, gradeAt])

  const columnAverages = useMemo(
    () => items.map((i) => itemAverage(i, grades, scaleFor(i))),
    [items, grades, scaleFor],
  )

  if (!students.length) {
    return (
      <EmptyState
        title="В пространстве пока нет учеников"
        description="Поделитесь кодом приглашения — как только ученики войдут, они появятся строками журнала."
        art="tasks"
      />
    )
  }

  if (!items.length) {
    return (
      <EmptyState
        title="В журнале нет работ"
        description="Добавьте контрольную, домашнюю или устный ответ — колонка появится в журнале, а оценки увидят ученики в своём дневнике."
        art="calendar"
        action={
          canEdit && (
            <button className="cf-btn-brand" onClick={onCreateItem}>
              <Plus size={16} /> Добавить работу
            </button>
          )
        }
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-3">
          {canEdit
            ? 'Кликните клетку и введите балл · «н» — не был · «осв» — освобождён · правая кнопка — комментарий и отметки'
            : 'Ваши оценки за выбранный период'}
        </p>
        <div className="flex items-center gap-2">
          <button className="cf-btn-ghost" onClick={exportCsv}>
            <Download size={15} /> CSV
          </button>
          {canEdit && (
            <button className="cf-btn-brand" onClick={onCreateItem}>
              <Plus size={16} /> Работа
            </button>
          )}
        </div>
      </div>

      <div
        ref={wrapRef}
        className="cf-card overflow-x-auto overflow-y-visible p-0"
        style={{ scrollbarWidth: 'thin' }}
      >
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-[190px] border-b border-r border-line bg-surface px-3.5 py-3 text-left font-semibold">
                Ученик
              </th>
              {items.map((item, c) => {
                const cat = categoryOf(item)
                return (
                  <th
                    key={item.id}
                    className={cx(
                      'min-w-[74px] border-b border-line bg-surface px-1.5 py-2 align-bottom',
                      active?.c === c && 'bg-brand-soft',
                    )}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10.5px] font-medium text-ink-3">{formatDate(item.date)}</span>
                      <span
                        className="line-clamp-2 max-w-[92px] text-center text-[11.5px] font-semibold leading-tight"
                        title={`${item.title} · макс ${trimNumber(item.max_score)} · вес ${trimNumber(item.weight)}`}
                      >
                        {item.title}
                      </span>
                      {criteriaOf(item).length > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-brand"
                          title={`Оценивается по ${criteriaOf(item).length} критериям`}
                        >
                          <ListChecks size={10} /> {criteriaOf(item).length}
                        </span>
                      )}
                      {cat && (
                        <span
                          className="h-1.5 w-8 rounded-pill"
                          style={{ background: `var(--cf-${cat.color}-acc)` }}
                          title={`${cat.name} · вес ×${trimNumber(cat.weight)}`}
                        />
                      )}
                      {canEdit && (
                        <Menu
                          align="right"
                          width={200}
                          trigger={({ toggle }) => (
                            <button
                              className="rounded-full p-1 text-ink-3 transition hover:bg-surface-2 hover:text-ink"
                              onClick={toggle}
                              aria-label="Действия с работой"
                            >
                              <MoreVertical size={13} />
                            </button>
                          )}
                          items={[
                            {
                              label: 'Изменить работу',
                              icon: Pencil,
                              onClick: () => onEditItem(item),
                            },
                            {
                              label: 'Удалить работу',
                              icon: Trash2,
                              danger: true,
                              onClick: async () => {
                                try {
                                  await db.deleteGradeItem(item.id)
                                  await gb.refresh()
                                  toast.success('Работа удалена')
                                } catch (e) {
                                  toast.error(e)
                                }
                              },
                            },
                          ]}
                        />
                      )}
                    </div>
                  </th>
                )
              })}
              <th className="min-w-[92px] border-b border-l border-line bg-surface px-2 py-3 text-[12px] font-semibold">
                Средний
              </th>
              <th className="min-w-[80px] border-b border-line bg-surface px-2 py-3 text-[12px] font-semibold">
                Итог
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, r) => {
              const agg = aggregateFor(student.id, {
                items,
                grades,
                categories,
                scaleFor,
              })
              return (
                <tr key={student.id} className={cx(active?.r === r && 'bg-brand-soft/40')}>
                  <td className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3.5 py-2">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={student.name} src={student.avatar} size={26} />
                      <span className="truncate font-medium">{student.name}</span>
                    </span>
                  </td>

                  {items.map((item, c) => {
                    const grade = gradeAt(item.id, student.id)
                    const scale = scaleFor(item)
                    const isActive = active?.r === r && active?.c === c
                    const editing = isActive && draft !== null
                    const color = grade ? colorForGrade(grade, item, scale) : null
                    const palette = color ? gradePalette[color] : null

                    return (
                      <td key={item.id} className="border-b border-line p-[3px] text-center">
                        {editing ? (
                          <input
                            ref={inputRef}
                            value={draft}
                            inputMode="decimal"
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={async () => {
                              const v = draft ?? ''
                              setDraft(null)
                              await commit(r, c, v)
                            }}
                            onKeyDown={async (e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                setDraft(null)
                              } else if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault()
                                const v = draft ?? ''
                                setDraft(null)
                                await commit(r, c, v)
                                move(e.key === 'Tab' ? 0 : 1, e.key === 'Tab' ? 1 : 0)
                              }
                            }}
                            className="h-9 w-full rounded-[10px] border-2 border-brand bg-surface text-center text-[14px] font-semibold outline-none"
                          />
                        ) : (
                          <button
                            onClick={(e) => {
                              setActive({ r, c })
                              if (!canEdit) return
                              if (criteriaOf(item).length) {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                setDraft(null)
                                setDetail({
                                  item,
                                  studentId: student.id,
                                  x: rect.left,
                                  y: rect.bottom + 4,
                                })
                              } else if (scale.kind === 'levels') {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                setDraft(null)
                                setPicker({
                                  item,
                                  r,
                                  c,
                                  x: rect.left,
                                  y: rect.bottom + 4,
                                })
                              } else {
                                setDraft(
                                  grade?.score !== null && grade?.score !== undefined
                                    ? trimNumber(grade.score)
                                    : '',
                                )
                              }
                            }}
                            onFocus={() => setActive({ r, c })}
                            onContextMenu={(e) => {
                              if (!canEdit) return
                              e.preventDefault()
                              setActive({ r, c })
                              setDraft(null)
                              setDetail({
                                item,
                                studentId: student.id,
                                x: e.clientX,
                                y: e.clientY,
                              })
                            }}
                            onKeyDown={(e) => void onCellKey(e, r, c)}
                            title={
                              grade?.comment
                                ? grade.comment
                                : grade && grade.score !== null
                                  ? `${trimNumber(grade.score)} из ${trimNumber(item.max_score)} · ${Math.round(percentOf(grade.score, item.max_score, scale))}%`
                                  : 'Нет оценки'
                            }
                            className={cx(
                              'relative h-9 w-full rounded-[10px] text-[14px] font-semibold transition duration-150',
                              isActive ? 'ring-2 ring-brand' : 'hover:bg-surface-2',
                              !palette && 'text-ink-3',
                            )}
                            style={palette ? { background: palette.bg, color: palette.fg } : undefined}
                          >
                            {grade ? gradeLabel(grade, item, scale) : ''}
                            {grade?.comment && (
                              <span
                                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                                style={{
                                  background: palette?.fg ?? 'var(--cf-brand)',
                                }}
                              />
                            )}
                          </button>
                        )}
                      </td>
                    )
                  })}

                  <td className="border-b border-l border-line px-2 py-2 text-center text-[13px] font-semibold">
                    {agg.percent === null ? (
                      <span className="text-ink-3">—</span>
                    ) : (
                      <span>
                        {Math.round(agg.percent)}%
                        {agg.average !== null && (
                          <span className="ml-1 text-[11px] font-medium text-ink-3">
                            {trimNumber(Math.round(agg.average * 100) / 100)}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-line px-2 py-2 text-center">
                    {agg.level ? (
                      <span
                        className="cf-pill px-2.5 py-1 text-[12px] font-semibold"
                        style={{
                          background: gradePalette[agg.level.color].bg,
                          color: gradePalette[agg.level.color].fg,
                          borderColor: `color-mix(in srgb, ${gradePalette[agg.level.color].fg} 28%, transparent)`,
                        }}
                      >
                        {agg.level.label}
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              )
            })}

            <tr className="bg-canvas/70">
              <td className="sticky left-0 z-10 border-r border-line bg-canvas px-3.5 py-2.5 text-[12px] font-semibold text-ink-2">
                Средний по классу
              </td>
              {columnAverages.map((avg, i) => (
                <td
                  key={items[i].id}
                  className="px-1 py-2.5 text-center text-[12px] font-semibold text-ink-2"
                >
                  {avg === null ? '—' : `${Math.round(avg)}%`}
                </td>
              ))}
              <td className="border-l border-line px-2 py-2.5" />
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {picker && (
        <LevelPicker
          scale={scaleFor(picker.item)}
          x={picker.x}
          y={picker.y}
          onPick={async (level) => {
            const { r, c, item } = picker
            setPicker(null)
            // Балл уровня — доля от максимума работы, чтобы подпись
            // и цвет совпали с выбранным уровнем шкалы.
            const score = Math.round(item.max_score * (level.min_percent / 100) * 100) / 100
            await commit(r, c, String(score))
            move(1, 0)
          }}
          onCancel={() => setPicker(null)}
        />
      )}

      {detail && (
        <CellEditor
          gb={gb}
          item={detail.item}
          studentId={detail.studentId}
          x={detail.x}
          y={detail.y}
          onClose={() => setDetail(null)}
        />
      )}

      <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
        <CalendarDays size={13} />
        {items.length} {items.length === 1 ? 'работа' : 'работ'} · {students.length} учеников · итог
        считается по весам категорий
      </p>
    </div>
  )
}

/** Выбор уровня для шкал вида «буквенная» и «зачёт/незачёт» */
function LevelPicker({
  scale,
  x,
  y,
  onPick,
  onCancel,
}: {
  scale: GradebookApi['defaultScale']
  x: number
  y: number
  onPick: (level: GradeLevel) => void
  onCancel: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 200
    const w = panelRef.current?.offsetWidth ?? 190
    const left = Math.min(Math.max(8, x), window.innerWidth - w - 8)
    const top = Math.max(8, Math.min(y, window.innerHeight - h - 8))
    setPos({ left, top })
  }, [x, y])

  const levels = sortedLevels(scale)

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80]" onClick={onCancel} aria-hidden />
      <div
        ref={panelRef}
        className="fixed z-[81] max-h-[80vh] w-[190px] animate-scale-in overflow-y-auto rounded-[16px] border border-line bg-surface p-1.5 shadow-pop"
        style={{ left: pos.left, top: pos.top }}
      >
        {levels.map((l) => (
          <button
            key={l.id}
            onClick={() => onPick(l)}
            className="flex w-full items-center gap-2 rounded-[11px] px-2.5 py-1.5 text-left text-[13px] transition hover:bg-surface-2"
          >
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-[7px] text-[11px] font-bold"
              style={{
                background: gradePalette[l.color].bg,
                color: gradePalette[l.color].fg,
              }}
              aria-hidden
            >
              {l.label.slice(0, 1)}
            </span>
            <span className="truncate">{l.label}</span>
          </button>
        ))}
        <button
          onClick={onCancel}
          className="mt-0.5 w-full rounded-[11px] px-2.5 py-1.5 text-left text-[12px] text-ink-3 transition hover:bg-surface-2"
        >
          Отмена
        </button>
      </div>
    </>,
    document.body,
  )
}

/** Подробный редактор клетки: балл или критерии, отметка и комментарий */
function CellEditor({
  gb,
  item,
  studentId,
  x,
  y,
  onClose,
}: {
  gb: GradebookApi
  item: GradeItem
  studentId: string
  x: number
  y: number
  onClose: () => void
}) {
  const toast = useToast()
  const existing = gb.grades.find((g) => g.item_id === item.id && g.student_id === studentId)
  const scale = gb.scaleFor(item)
  const criteria = useMemo(
    () => gb.criteria.filter((c) => c.item_id === item.id).sort((a, b) => a.position - b.position),
    [gb.criteria, item.id],
  )

  const [score, setScore] = useState(
    existing?.score !== null && existing?.score !== undefined ? trimNumber(existing.score) : '',
  )
  const [flag, setFlag] = useState<Grade['flag']>(existing?.flag ?? 'none')
  const [comment, setComment] = useState(existing?.comment ?? '')
  const [parts, setParts] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const c of criteria) {
      const found = gb.criterionScores.find(
        (cs) => cs.criterion_id === c.id && cs.student_id === studentId,
      )
      out[c.id] = found?.score !== null && found?.score !== undefined ? trimNumber(found.score) : ''
    }
    return out
  })
  const [busy, setBusy] = useState(false)
  const student = gb.students.find((s) => s.id === studentId)

  // Панель всегда целиком в окне: замеряем после отрисовки и подвигаем
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y })
  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 340
    const w = panelRef.current?.offsetWidth ?? 320
    const left = Math.min(Math.max(8, x), window.innerWidth - w - 8)
    let top = y
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8
    setPos({ left, top: Math.max(8, top) })
  }, [x, y, criteria.length])

  const partsTotal = useMemo(
    () =>
      criteria.reduce((sum, c) => {
        const v = Number((parts[c.id] ?? '').replace(',', '.'))
        return sum + (Number.isFinite(v) ? v : 0)
      }, 0),
    [criteria, parts],
  )
  const criteriaMax = useMemo(() => criteria.reduce((s2, c) => s2 + c.max_score, 0), [criteria])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    setBusy(true)
    try {
      if (criteria.length && flag === 'none') {
        const values = criteria.map((c) => {
          const raw = (parts[c.id] ?? '').trim().replace(',', '.')
          if (raw === '') return { criterion_id: c.id, score: null }
          const num = Number(raw)
          if (!Number.isFinite(num)) throw new Error(`Критерий «${c.title}»: введите число`)
          if (num < 0 || num > c.max_score) {
            throw new Error(`Критерий «${c.title}»: балл от 0 до ${trimNumber(c.max_score)}`)
          }
          return { criterion_id: c.id, score: num }
        })
        await db.setCriterionScores(item.id, studentId, values)
        if ((comment.trim() || null) !== (existing?.comment ?? null)) {
          await db.setGrade(item.id, studentId, { comment: comment.trim() || null })
        }
      } else {
        const value = score.trim().replace(',', '.')
        await db.setGrade(item.id, studentId, {
          score: flag === 'none' && value !== '' ? Number(value) : null,
          flag,
          comment: comment.trim() || null,
        })
      }
      await gb.refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  const flags: Array<{ value: Grade['flag']; label: string }> = [
    { value: 'none', label: criteria.length ? 'По критериям' : 'Балл' },
    { value: 'absent', label: 'Не был' },
    { value: 'excused', label: 'Освобождён' },
    { value: 'pending', label: 'Ожидает' },
  ]

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className="fixed z-[81] max-h-[86vh] w-[320px] animate-scale-in overflow-y-auto rounded-[20px] border border-line bg-surface p-4 shadow-pop"
        style={{ left: pos.left, top: pos.top }}
      >
        <p className="text-[13px] font-semibold">{student?.name}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-3">
          {item.title} · макс {trimNumber(item.max_score)}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <button
              key={f.value}
              onClick={() => setFlag(f.value)}
              className={cx(
                'rounded-pill border px-2.5 py-1 text-[12px] transition',
                flag === f.value
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {flag === 'none' &&
          (criteria.length ? (
            <div className="mt-3 space-y-2">
              {criteria.map((c) => (
                <label key={c.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12.5px]" title={c.title}>
                    {c.title}
                  </span>
                  <input
                    className="cf-input w-[68px] py-1.5 text-center"
                    inputMode="decimal"
                    value={parts[c.id] ?? ''}
                    onChange={(e) => setParts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  />
                  <span className="w-9 shrink-0 text-[12px] text-ink-3">
                    / {trimNumber(c.max_score)}
                  </span>
                </label>
              ))}
              <div className="flex items-center justify-between rounded-[12px] bg-canvas px-3 py-2 text-[13px] font-semibold">
                <span>Итого</span>
                <span>
                  {trimNumber(Math.round(partsTotal * 100) / 100)} / {trimNumber(criteriaMax)}
                  {criteriaMax > 0 && (
                    <span className="ml-1.5 text-[12px] font-medium text-ink-3">
                      {Math.round((partsTotal / criteriaMax) * 100)}%
                    </span>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <label className="mt-3 block">
              <span className="mb-1 block text-[12px] font-semibold text-ink-2">
                Балл {scale.kind === 'levels' ? '(доля от максимума)' : ''}
              </span>
              <input
                className="cf-input w-full"
                inputMode="decimal"
                value={score}
                autoFocus
                onChange={(e) => setScore(e.target.value)}
              />
            </label>
          ))}

        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] font-semibold text-ink-2">Комментарий ученику</span>
          <textarea
            className="cf-input min-h-[64px] w-full resize-y"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Что получилось, над чем поработать"
          />
        </label>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
            onClick={async () => {
              try {
                await db.clearGrade(item.id, studentId)
                if (criteria.length) {
                  await db.setCriterionScores(
                    item.id,
                    studentId,
                    criteria.map((c) => ({ criterion_id: c.id, score: null })),
                  )
                  await db.clearGrade(item.id, studentId)
                }
                await gb.refresh()
                onClose()
              } catch (e) {
                toast.error(e)
              }
            }}
          >
            Очистить
          </button>
          <div className="flex gap-2">
            <button className="cf-btn-ghost px-3 py-1.5 text-[12.5px]" onClick={onClose}>
              Отмена
            </button>
            <button className="cf-btn-brand px-3.5 py-1.5 text-[12.5px]" onClick={save} disabled={busy}>
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
