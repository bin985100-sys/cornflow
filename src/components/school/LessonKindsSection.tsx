import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { cardPalette, cx } from '@/lib/utils'
import type { SchoolApi } from '@/hooks/useSchool'
import type { CardColor } from '@/lib/types'

const COLORS: CardColor[] = ['blue', 'purple', 'green', 'yellow', 'red']

/**
 * Типы уроков школы: «Лекция», «Практикум», «Контрольная».
 *
 * Справочник, а не зашитый список: в музыкальной школе это «Сольфеджио» и
 * «Хор», а не контрольные. Тип ставится уроку в КТП и виден в плане.
 */
export function LessonKindsSection({ school }: { school: SchoolApi }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [color, setColor] = useState<CardColor>('blue')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!school.schoolId || !name.trim()) return
    setBusy(true)
    try {
      await db.createLessonKind(school.schoolId, name, color)
      setName('')
      await school.refresh()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    try {
      await db.deleteLessonKind(id)
      await school.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <section className="cf-card space-y-3 p-4">
      <header>
        <h2 className="text-[15px] font-semibold">Типы уроков</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Ставятся урокам в КТП. Названия любые — школа решает сама.
        </p>
      </header>

      {school.isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="cf-input min-w-[180px] flex-1"
            placeholder="Лекция"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => setColor(c)}
                className={cx(
                  'h-6 w-6 rounded-full border-2 transition',
                  color === c ? 'border-ink' : 'border-transparent',
                )}
                style={{ background: cardPalette[c].accent }}
              />
            ))}
          </div>
          <button className="cf-btn-brand px-4" disabled={busy || !name.trim()} onClick={() => void add()}>
            <Plus size={15} /> Добавить
          </button>
        </div>
      )}

      {school.lessonKinds.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">
          Пока ни одного. Без типов КТП тоже работает — они нужны, когда план надо читать с одного
          взгляда.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {school.lessonKinds.map((k) => (
            <li
              key={k.id}
              className="cf-pill flex items-center gap-1.5 px-2.5 py-[3px] text-[12.5px] font-medium"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: cardPalette[k.color].accent }}
              />
              {k.name}
              {school.isAdmin && (
                <button
                  className="text-ink-3 transition-colors hover:text-red-500"
                  onClick={() => void remove(k.id)}
                  title="Удалить тип"
                >
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Частые формулировки «за что».
 *
 * Поле у оценки свободное — это лишь подсказки, чтобы учитель не печатал
 * «за устный ответ» в сотый раз, а школа говорила одними словами.
 */
export function GradeReasonsSection({ school }: { school: SchoolApi }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!school.schoolId || !text.trim()) return
    setBusy(true)
    try {
      await db.createGradeReason(school.schoolId, text)
      setText('')
      await school.refresh()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="cf-card space-y-3 p-4">
      <header>
        <h2 className="text-[15px] font-semibold">Формулировки «за что»</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Подсказки учителю при выставлении оценки. Поле остаётся свободным — это не ограничение.
        </p>
      </header>

      {school.isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="cf-input min-w-[200px] flex-1"
            placeholder="За устный ответ"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <button className="cf-btn-brand px-4" disabled={busy || !text.trim()} onClick={() => void add()}>
            <Plus size={15} /> Добавить
          </button>
        </div>
      )}

      {school.gradeReasons.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">
          Пока ни одной. Учитель всё равно может написать свою — список лишь экономит ему время.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {school.gradeReasons.map((r) => (
            <li
              key={r.id}
              className="cf-pill flex items-center gap-1.5 px-2.5 py-[3px] text-[12.5px] font-medium"
            >
              {r.text}
              {school.isAdmin && (
                <button
                  className="text-ink-3 transition-colors hover:text-red-500"
                  onClick={async () => {
                    try {
                      await db.deleteGradeReason(r.id)
                      await school.refresh()
                    } catch (e) {
                      toast.error(e)
                    }
                  }}
                  title="Убрать подсказку"
                >
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
