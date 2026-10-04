import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { ROLE_LABEL, type SchoolApi } from '@/hooks/useSchool'
import { cx } from '@/lib/utils'
import type { SchoolPerson, SchoolRole } from '@/lib/types'

/** Роли, которые администратор может выдать руками */
const ASSIGNABLE: SchoolRole[] = ['student', 'teacher', 'homeroom', 'headteacher', 'parent', 'admin']

/**
 * Роли человека.
 *
 * Один человек бывает и учителем, и родителем ученика этой же школы, и
 * классным руководителем — поэтому ролей несколько, а не одна. Первая
 * выбранная остаётся основной: по ней работают экраны, которые о множестве
 * ролей ещё не знают.
 */
export function RolesModal({
  school,
  person,
  onClose,
}: {
  school: SchoolApi
  person: SchoolPerson
  onClose: () => void
}) {
  const toast = useToast()
  const access = school.accessOf(person.id)
  const [roles, setRoles] = useState<SchoolRole[]>(access?.roles ?? [person.role])
  const [classIds, setClassIds] = useState<string[]>(access?.class_ids ?? [])
  const [childIds, setChildIds] = useState<string[]>(access?.child_ids ?? [])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const needsClasses = roles.includes('homeroom') || roles.includes('headteacher')
  const needsChildren = roles.includes('parent')

  const children = useMemo(() => {
    const q = query.trim().toLowerCase()
    return school.students.filter(
      (s) => s.id !== person.id && (!q || school.fullName(s).toLowerCase().includes(q)),
    )
  }, [school, person.id, query])

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
  }

  async function save() {
    if (!roles.length) {
      toast.error('Оставьте хотя бы одну роль')
      return
    }
    setBusy(true)
    try {
      await db.setPersonRoles(person.id, roles)
      await db.setPersonClasses(person.id, needsClasses ? classIds : [])
      await db.setParentChildren(person.id, needsChildren ? childIds : [])
      await school.refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Роли · ${school.fullName(person)}`}>
      <div className="space-y-4">
        <div>
          <span className="mb-1.5 block text-[12.5px] text-ink-2">Роли</span>
          <div className="flex flex-wrap gap-1.5">
            {ASSIGNABLE.map((role) => {
              const on = roles.includes(role)
              return (
                <button
                  key={role}
                  onClick={() => setRoles((list) => toggle(list, role))}
                  className={cx(
                    'cf-pill flex items-center gap-1.5 px-2.5 py-[4px] text-[12.5px] font-medium transition-colors',
                    on ? 'border-brand/30 bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2',
                  )}
                >
                  {on && <Check size={12} />}
                  {ROLE_LABEL[role]}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">
            Ролей может быть несколько — человек переключается между интерфейсами сам. Первая
            выбранная считается основной.
          </p>
        </div>

        {needsClasses && (
          <div>
            <span className="mb-1.5 block text-[12.5px] text-ink-2">
              Закреплённые классы <span className="text-ink-3">выбрано: {classIds.length}</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {school.classes.map((klass) => {
                const on = classIds.includes(klass.id)
                return (
                  <button
                    key={klass.id}
                    onClick={() => setClassIds((list) => toggle(list, klass.id))}
                    className={cx(
                      'cf-pill px-2.5 py-[3px] text-[12px] font-semibold transition-colors',
                      on ? 'border-brand/30 bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    {school.classLabel(klass.id)}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-3">
              У классного руководителя обычно один класс, у завуча — несколько.
            </p>
          </div>
        )}

        {needsChildren && (
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[12.5px] text-ink-2">
                Дети <span className="text-ink-3">выбрано: {childIds.length}</span>
              </span>
              <label className="relative ml-auto">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
                <input
                  className="cf-input h-8 w-[180px] py-0 pl-7 text-[12.5px]"
                  placeholder="Поиск"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>

            <ul className="max-h-[200px] space-y-1 overflow-y-auto">
              {children.map((child) => {
                const on = childIds.includes(child.id)
                return (
                  <li key={child.id}>
                    <button
                      onClick={() => setChildIds((list) => toggle(list, child.id))}
                      className="flex w-full items-center gap-2 rounded-[14px] border border-line px-3 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <span
                        className={cx(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-[6px] border',
                          on ? 'border-brand bg-brand text-white' : 'border-line',
                        )}
                      >
                        {on && <Check size={11} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {school.fullName(child)}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-ink-3">
                        {school.classLabel(child.class_id)}
                      </span>
                    </button>
                  </li>
                )
              })}
              {children.length === 0 && (
                <li className="px-1 py-2 text-[12.5px] text-ink-3">Учеников не нашлось</li>
              )}
            </ul>
            <p className="mt-1.5 text-[12px] text-ink-3">
              Родитель видит всё, что видит ребёнок, но сдавать работы за него не может.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand px-4" disabled={busy} onClick={() => void save()}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}
