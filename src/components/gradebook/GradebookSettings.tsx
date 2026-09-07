import { useState } from 'react'
import { Check, Plus, Sparkles, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog } from '@/components/ui/Modal'
import { ColorPicker } from '@/components/ui/primitives'
import {
  GRADE_COLORS,
  SCALE_PRESETS,
  gradePalette,
  presetByKey,
  trimNumber,
} from '@/lib/grading'
import { cx, uid } from '@/lib/utils'
import type { CardColor, GradeColor, GradeLevel, GradeScale } from '@/lib/types'
import type { GradebookApi } from '@/hooks/useGradebook'

/** Настройки журнала: шкалы оценивания, категории работ, учебные периоды. */
export function GradebookSettings({ gb }: { gb: GradebookApi }) {
  return (
    <div className="space-y-5">
      <ScalesSection gb={gb} />
      <CategoriesSection gb={gb} />
      <LessonDictionaries gb={gb} />
      <PeriodsSection gb={gb} />
    </div>
  )
}

/* --------------------------------- шкалы ---------------------------------- */

function ScalesSection({ gb }: { gb: GradebookApi }) {
  const toast = useToast()
  const [editing, setEditing] = useState<GradeScale | null>(null)
  const [confirm, setConfirm] = useState<GradeScale | null>(null)

  async function addPreset(key: string) {
    if (!gb.spaceId) return
    try {
      const preset = presetByKey(key).build()
      const created = await db.createScale({
        ...preset,
        space_id: gb.spaceId,
        is_default: gb.scales.length === 0,
      })
      await gb.refresh()
      if (key === 'custom') setEditing(created)
      toast.success(`Шкала «${preset.name}» добавлена`)
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <section className="cf-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">Шкалы оценивания</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            Любая шкала: 5, 10, 12, 100 баллов, буквенная, зачёт/незачёт или собственная с порогами и цветами
          </p>
        </div>
      </header>

      <div className="mt-3 space-y-2">
        {gb.scales.map((scale) => (
          <div key={scale.id} className="rounded-[18px] border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-semibold">{scale.name}</span>
              {scale.is_default && (
                <span className="cf-pill border-brand/25 bg-brand-soft px-2 py-[2px] text-[11px] text-brand">
                  По умолчанию
                </span>
              )}
              <span className="text-[12px] text-ink-3">
                {scale.kind === 'points' ? 'ввод баллом' : 'выбор уровня'} · {trimNumber(scale.min_value)}–
                {trimNumber(scale.max_value)}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                {!scale.is_default && (
                  <button
                    className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
                    onClick={async () => {
                      try {
                        await db.updateScale(scale.id, { is_default: true })
                        await gb.refresh()
                      } catch (e) {
                        toast.error(e)
                      }
                    }}
                  >
                    <Check size={14} /> Сделать основной
                  </button>
                )}
                <button
                  className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
                  onClick={() => setEditing(editing?.id === scale.id ? null : scale)}
                >
                  {editing?.id === scale.id ? 'Свернуть' : 'Настроить'}
                </button>
                <button
                  className="cf-icon-btn"
                  aria-label="Удалить шкалу"
                  onClick={() => setConfirm(scale)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...scale.levels]
                .sort((a, b) => b.min_percent - a.min_percent)
                .map((l) => (
                  <span
                    key={l.id}
                    className="cf-pill px-2.5 py-[3px] text-[11.5px] font-semibold"
                    style={{
                      background: gradePalette[l.color].bg,
                      color: gradePalette[l.color].fg,
                      borderColor: `color-mix(in srgb, ${gradePalette[l.color].fg} 26%, transparent)`,
                    }}
                  >
                    {l.label} · от {trimNumber(l.min_percent)}%
                  </span>
                ))}
            </div>

            {editing?.id === scale.id && (
              <ScaleEditor
                gb={gb}
                scale={scale}
                onDone={() => setEditing(null)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
          <Sparkles size={14} /> Добавить готовую шкалу
        </p>
        <div className="flex flex-wrap gap-2">
          {SCALE_PRESETS.map((p) => (
            <button
              key={p.key}
              className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
              title={p.hint}
              onClick={() => addPreset(p.key)}
            >
              <Plus size={14} /> {p.name}
            </button>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Удалить шкалу «${confirm?.name ?? ''}»?`}
        description="Работы, которые её использовали, вернутся к шкале по умолчанию. Оценки сохранятся."
        onConfirm={async () => {
          if (!confirm) return
          try {
            await db.deleteScale(confirm.id)
            await gb.refresh()
            toast.success('Шкала удалена')
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </section>
  )
}

function ScaleEditor({
  gb,
  scale,
  onDone,
}: {
  gb: GradebookApi
  scale: GradeScale
  onDone: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(scale.name)
  const [kind, setKind] = useState(scale.kind)
  const [minValue, setMinValue] = useState(trimNumber(scale.min_value))
  const [maxValue, setMaxValue] = useState(trimNumber(scale.max_value))
  const [passing, setPassing] = useState(trimNumber(scale.passing_percent))
  const [levels, setLevels] = useState<GradeLevel[]>(
    [...scale.levels].sort((a, b) => b.min_percent - a.min_percent),
  )
  const [busy, setBusy] = useState(false)

  function patchLevel(id: string, patch: Partial<GradeLevel>) {
    setLevels((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  async function save() {
    setBusy(true)
    try {
      await db.updateScale(scale.id, {
        name: name.trim() || scale.name,
        kind,
        min_value: Number(minValue.replace(',', '.')) || 0,
        max_value: Number(maxValue.replace(',', '.')) || 5,
        passing_percent: Number(passing.replace(',', '.')) || 50,
        levels: [...levels].sort((a, b) => b.min_percent - a.min_percent),
      })
      await gb.refresh()
      toast.success('Шкала сохранена')
      onDone()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-4 border-t border-line pt-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-[12px] font-semibold text-ink-2">Название</span>
          <input className="cf-input w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-ink-2">Ввод</span>
          <select
            className="cf-input w-full"
            value={kind}
            onChange={(e) => setKind(e.target.value as GradeScale['kind'])}
          >
            <option value="points">Баллом</option>
            <option value="levels">Выбором уровня</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-ink-2">Мин / макс</span>
          <div className="flex gap-1.5">
            <input
              className="cf-input w-full"
              value={minValue}
              inputMode="decimal"
              onChange={(e) => setMinValue(e.target.value)}
            />
            <input
              className="cf-input w-full"
              value={maxValue}
              inputMode="decimal"
              onChange={(e) => setMaxValue(e.target.value)}
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-ink-2">Порог сдачи, %</span>
          <input
            className="cf-input w-full"
            value={passing}
            inputMode="decimal"
            onChange={(e) => setPassing(e.target.value)}
          />
        </label>
      </div>

      <div>
        <p className="mb-2 text-[12.5px] font-semibold text-ink-2">
          Уровни — подпись, нижний порог в процентах, числовой эквивалент и цвет
        </p>
        <div className="space-y-2">
          {levels.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2">
              <input
                className="cf-input w-[150px]"
                value={l.label}
                onChange={(e) => patchLevel(l.id, { label: e.target.value })}
                placeholder="Отметка"
              />
              <input
                className="cf-input w-[92px]"
                value={String(l.min_percent)}
                inputMode="decimal"
                onChange={(e) => patchLevel(l.id, { min_percent: Number(e.target.value) || 0 })}
                title="Нижний порог, %"
              />
              <input
                className="cf-input w-[92px]"
                value={String(l.value)}
                inputMode="decimal"
                onChange={(e) => patchLevel(l.id, { value: Number(e.target.value) || 0 })}
                title="Числовой эквивалент"
              />
              <div className="flex items-center gap-1">
                {GRADE_COLORS.map((c: GradeColor) => (
                  <button
                    key={c}
                    type="button"
                    title={gradePalette[c].label}
                    onClick={() => patchLevel(l.id, { color: c })}
                    className={cx(
                      'h-6 w-6 rounded-full border-2 transition',
                      l.color === c ? 'scale-110' : 'border-transparent hover:scale-105',
                    )}
                    style={{
                      background: gradePalette[c].bg,
                      borderColor: l.color === c ? gradePalette[c].fg : 'transparent',
                      boxShadow: `inset 0 0 0 3px ${gradePalette[c].fg}`,
                    }}
                  />
                ))}
              </div>
              <button
                className="cf-icon-btn"
                aria-label="Удалить уровень"
                onClick={() => setLevels((ls) => ls.filter((x) => x.id !== l.id))}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="cf-btn-ghost mt-2 px-3 py-1.5 text-[12.5px]"
          onClick={() =>
            setLevels((ls) => [
              ...ls,
              { id: uid('lvl'), label: 'Новый уровень', min_percent: 0, value: 0, color: 'grey' },
            ])
          }
        >
          <Plus size={14} /> Уровень
        </button>
      </div>

      <div className="flex justify-end gap-2">
        <button className="cf-btn-ghost" onClick={onDone}>
          Отмена
        </button>
        <button className="cf-btn-brand" onClick={save} disabled={busy}>
          Сохранить шкалу
        </button>
      </div>
    </div>
  )
}

/* ------------------------------- категории -------------------------------- */

function CategoriesSection({ gb }: { gb: GradebookApi }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [weight, setWeight] = useState('1')
  const [color, setColor] = useState<CardColor>('blue')

  async function add() {
    if (!gb.spaceId || !name.trim()) return
    try {
      await db.createCategory({
        space_id: gb.spaceId,
        name: name.trim(),
        code: code.trim().toUpperCase() || null,
        weight: Number(weight.replace(',', '.')) || 1,
        color,
        default_priority_id: gb.lessonPriorities.find((p) => p.is_default)?.id ?? null,
        counts_toward_grade: true,
        position: gb.categories.length,
      })
      setName('')
      setCode('')
      setWeight('1')
      await gb.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  async function patch(id: string, values: Parameters<typeof db.updateCategory>[1]) {
    try {
      await db.updateCategory(id, values)
      await gb.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <section className="cf-card p-4">
      <h3 className="text-[15px] font-semibold">Типы работ и занятий</h3>
      <p className="mt-0.5 text-[12.5px] text-ink-3">
        Ничего не зашито: имя, короткий код на чипе, вес в среднем балле, важность по умолчанию и
        участие в итоге — всё меняется здесь. SA и FA это обычные типы, их можно переименовать или
        удалить.
      </p>

      <ul className="mt-3 divide-y divide-line">
        {gb.categories.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-3">
            <span
              className="cf-pill px-2.5 py-[3px] text-[12px]"
              style={{
                background: `var(--cf-${c.color}-bg)`,
                color: `var(--cf-${c.color}-acc)`,
                borderColor: `color-mix(in srgb, var(--cf-${c.color}-acc) 26%, transparent)`,
              }}
            >
              {c.code ? `${c.code} · ${c.name}` : c.name}
            </span>

            <input
              className="cf-input w-[74px] py-1.5 text-center uppercase"
              defaultValue={c.code ?? ''}
              placeholder="код"
              title="Короткий код на чипе"
              onBlur={(e) => {
                const v = e.target.value.trim().toUpperCase() || null
                if (v !== (c.code ?? null)) void patch(c.id, { code: v })
              }}
            />

            <select
              className="cf-input py-1.5 text-[12.5px]"
              value={c.default_priority_id ?? ''}
              title="Важность по умолчанию"
              onChange={(e) => void patch(c.id, { default_priority_id: e.target.value || null })}
            >
              <option value="">Важность: не задана</option>
              {gb.lessonPriorities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <label
              className="flex items-center gap-1.5 text-[12.5px] text-ink-3"
              title="Учитывать работы этого типа в среднем балле"
            >
              <input
                type="checkbox"
                checked={c.counts_toward_grade}
                onChange={(e) => void patch(c.id, { counts_toward_grade: e.target.checked })}
              />
              в среднем балле
            </label>

            <label className="ml-auto flex items-center gap-1.5 text-[12.5px] text-ink-3">
              вес
              <input
                className="cf-input w-[80px] py-1.5 text-center"
                defaultValue={trimNumber(c.weight)}
                inputMode="decimal"
                onBlur={(e) => {
                  const v = Number(e.target.value.replace(',', '.'))
                  if (Number.isFinite(v) && v !== c.weight) void patch(c.id, { weight: v })
                }}
              />
            </label>

            <button
              className="cf-icon-btn"
              aria-label="Удалить тип"
              onClick={async () => {
                try {
                  await db.deleteCategory(c.id)
                  await gb.refresh()
                } catch (e) {
                  toast.error(e)
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input
          className="cf-input min-w-[180px] flex-1"
          placeholder="Новый тип работы"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input
          className="cf-input w-[86px] text-center uppercase"
          placeholder="код"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          className="cf-input w-[92px] text-center"
          value={weight}
          inputMode="decimal"
          onChange={(e) => setWeight(e.target.value)}
        />
        <ColorPicker value={color} onChange={setColor} />
        <button className="cf-btn-brand" onClick={add}>
          <Plus size={15} /> Добавить
        </button>
      </div>
    </section>
  )
}

/* --------------------- справочники занятий -------------------------------- */

function LessonDictionaries({ gb }: { gb: GradebookApi }) {
  const toast = useToast()
  const [statusName, setStatusName] = useState('')
  const [statusColor, setStatusColor] = useState<CardColor>('blue')
  const [priorityName, setPriorityName] = useState('')
  const [priorityColor, setPriorityColor] = useState<CardColor>('yellow')

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await gb.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <section className="cf-card p-4">
      <h3 className="text-[15px] font-semibold">Статусы занятий и важность</h3>
      <p className="mt-0.5 text-[12.5px] text-ink-3">
        Свои списки для расписания: как называются состояния урока и какие бывают уровни важности.
        «Состоялось» отмечает занятия, которые считаются проведёнными.
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {/* статусы */}
        <div>
          <p className="mb-2 text-[12.5px] font-semibold text-ink-2">Статусы занятия</p>
          <ul className="divide-y divide-line">
            {gb.lessonStatuses.map((st) => (
              <li key={st.id} className="flex flex-wrap items-center gap-2 py-2">
                <input
                  className="cf-input min-w-0 flex-1 py-1.5"
                  defaultValue={st.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== st.name) void run(() => db.updateLessonStatus(st.id, { name: v }))
                  }}
                />
                <ColorPicker
                  value={st.color}
                  onChange={(c) => void run(() => db.updateLessonStatus(st.id, { color: c }))}
                />
                <label className="flex items-center gap-1 text-[12px] text-ink-3" title="Занятие состоялось">
                  <input
                    type="checkbox"
                    checked={st.is_held}
                    onChange={(e) =>
                      void run(() => db.updateLessonStatus(st.id, { is_held: e.target.checked }))
                    }
                  />
                  состоялось
                </label>
                <label className="flex items-center gap-1 text-[12px] text-ink-3" title="Ставить новым занятиям">
                  <input
                    type="radio"
                    name="default-status"
                    checked={st.is_default}
                    onChange={() => void run(() => db.updateLessonStatus(st.id, { is_default: true }))}
                  />
                  по умолчанию
                </label>
                <button
                  className="cf-icon-btn"
                  aria-label="Удалить статус"
                  onClick={() => void run(() => db.deleteLessonStatus(st.id))}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="cf-input min-w-[140px] flex-1"
              placeholder="Новый статус"
              value={statusName}
              onChange={(e) => setStatusName(e.target.value)}
            />
            <ColorPicker value={statusColor} onChange={setStatusColor} />
            <button
              className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
              onClick={() => {
                if (!gb.spaceId || !statusName.trim()) return
                void run(async () => {
                  await db.createLessonStatus({
                    space_id: gb.spaceId as string,
                    name: statusName.trim(),
                    color: statusColor,
                    is_held: false,
                    is_default: false,
                    position: gb.lessonStatuses.length,
                  })
                  setStatusName('')
                })
              }}
            >
              <Plus size={14} /> Статус
            </button>
          </div>
        </div>

        {/* важность */}
        <div>
          <p className="mb-2 text-[12.5px] font-semibold text-ink-2">Уровни важности</p>
          <ul className="divide-y divide-line">
            {gb.lessonPriorities.map((pr) => (
              <li key={pr.id} className="flex flex-wrap items-center gap-2 py-2">
                <input
                  className="cf-input min-w-0 flex-1 py-1.5"
                  defaultValue={pr.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== pr.name) void run(() => db.updateLessonPriority(pr.id, { name: v }))
                  }}
                />
                <input
                  className="cf-input w-[70px] py-1.5 text-center"
                  defaultValue={String(pr.rank)}
                  inputMode="numeric"
                  title="Чем больше, тем важнее"
                  onBlur={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v) && v !== pr.rank)
                      void run(() => db.updateLessonPriority(pr.id, { rank: v }))
                  }}
                />
                <ColorPicker
                  value={pr.color}
                  onChange={(c) => void run(() => db.updateLessonPriority(pr.id, { color: c }))}
                />
                <label className="flex items-center gap-1 text-[12px] text-ink-3">
                  <input
                    type="radio"
                    name="default-priority"
                    checked={pr.is_default}
                    onChange={() => void run(() => db.updateLessonPriority(pr.id, { is_default: true }))}
                  />
                  по умолчанию
                </label>
                <button
                  className="cf-icon-btn"
                  aria-label="Удалить уровень"
                  onClick={() => void run(() => db.deleteLessonPriority(pr.id))}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="cf-input min-w-[140px] flex-1"
              placeholder="Новый уровень"
              value={priorityName}
              onChange={(e) => setPriorityName(e.target.value)}
            />
            <ColorPicker value={priorityColor} onChange={setPriorityColor} />
            <button
              className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
              onClick={() => {
                if (!gb.spaceId || !priorityName.trim()) return
                void run(async () => {
                  await db.createLessonPriority({
                    space_id: gb.spaceId as string,
                    name: priorityName.trim(),
                    color: priorityColor,
                    rank: (gb.lessonPriorities[0]?.rank ?? 0) + 10,
                    is_default: false,
                    position: gb.lessonPriorities.length,
                  })
                  setPriorityName('')
                })
              }}
            >
              <Plus size={14} /> Уровень
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------- периоды --------------------------------- */

function PeriodsSection({ gb }: { gb: GradebookApi }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  async function add() {
    if (!gb.spaceId || !name.trim() || !start || !end) {
      toast.error('Заполните название и даты периода')
      return
    }
    try {
      await db.createPeriod({
        space_id: gb.spaceId,
        name: name.trim(),
        start_date: start,
        end_date: end,
        is_current: false,
      })
      setName('')
      setStart('')
      setEnd('')
      await gb.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <section className="cf-card p-4">
      <h3 className="text-[15px] font-semibold">Учебные периоды</h3>
      <p className="mt-0.5 text-[12.5px] text-ink-3">
        Четверти, триместры, семестры или модули — журнал и итоги считаются по выбранному периоду
      </p>

      <ul className="mt-3 divide-y divide-line">
        {gb.periods.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <span className="text-[13.5px] font-medium">{p.name}</span>
            <span className="text-[12px] text-ink-3">
              {p.start_date} — {p.end_date}
            </span>
            {p.is_current && (
              <span className="cf-pill border-brand/25 bg-brand-soft px-2 py-[2px] text-[11px] text-brand">
                Текущий
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {!p.is_current && (
                <button
                  className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
                  onClick={async () => {
                    try {
                      await db.updatePeriod(p.id, { is_current: true })
                      await gb.refresh()
                    } catch (e) {
                      toast.error(e)
                    }
                  }}
                >
                  Сделать текущим
                </button>
              )}
              <button
                className="cf-icon-btn"
                aria-label="Удалить период"
                onClick={async () => {
                  try {
                    await db.deletePeriod(p.id)
                    await gb.refresh()
                  } catch (e) {
                    toast.error(e)
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input
          className="cf-input min-w-[160px] flex-1"
          placeholder="Например, I полугодие"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input type="date" className="cf-input" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" className="cf-input" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button className="cf-btn-brand" onClick={add}>
          <Plus size={15} /> Добавить
        </button>
      </div>
    </section>
  )
}
