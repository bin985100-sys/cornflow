import { useState } from 'react'
import { Check, Search } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { cx } from '@/lib/utils'
import { ROLE_LABEL, type SchoolApi } from '@/hooks/useSchool'
import type { SchoolPerson, SchoolRole } from '@/lib/types'

/** Роли, которые админ выдаёт руками. Ученик и учитель задаются при заведении. */
const ASSIGNABLE: SchoolRole[] = ['student', 'teacher', 'homeroom', 'headteacher', 'parent', 'admin']

/** Роли, которым нужны закреплённые классы */
const NEEDS_CLASSES: SchoolRole[] = ['homeroom', 'headteacher']

/**
 * Роли человека и то, что из них следует: классы у классного руководителя и
 * завуча, дети у родителя. Ролей может быть несколько — первая считается
 * основной, по ней работает вход и старые проверки доступа.
 */
export function RolesModal({
  person,
  school,
  onClose,
}: {
  person: SchoolPerson
  school: SchoolApi
  onClose: () => void
}) {
  const toast = useToast()
  const access = school.accessOf(person.id)
  const [roles, setRoles] = useState<SchoolRole[]>(access.roles.length ? access.roles : [person.role])
  const [classIds, setClassIds] = useState<string[]>(access.class_ids)
  const [childIds, setChildIds] = useState<string[]>(access.child_ids)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const needsClasses = roles.some((r) => NEEDS_CLASSES.includes(r))
  const isParent = roles.includes('parent')

  function toggleRole(role: SchoolRole) {
    setRoles((list) => (list.includes(role) ? list.filter((r) => r !== role) : [...list, role]))
  }

  const children = school.students.filter((s) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return school.fullName(s).toLowerCase().includes(q)
  })

  async function save() {
    if (!roles.length) {
      toast.error('Оставьте хотя бы одну роль')
      return
    }
    setBusy(true)
    try {
      await db.setPersonRoles(person.id, roles)
      await db.setPersonClasses(person.id, needsClasses ? classIds : [])
      await db.setParentChildren(person.id, isParent ? childIds : [])
      await school.refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Роли · ${school.fullName(person)}`} size="lg">
      <div className="space-y-4">
        <div>
          <span className="mb-1.5 block text-[12.5px] text-ink-2">Роли</span>
          <div className="flex flex-wrap gap-1.5">
            {ASSIGNABLE.map((role) => {
              const on = roles.includes(role)
              return (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={cx(
                    'cf-pill px-2.5 py-[4px] text-[12px] font-semibold transition-colors',
                    on ? 'border-brand/30 bg-brand-soft text-brand' : 'text-ink-3',
                  )}
                >
                  {on && <Check size={12} className="mr-1 inline" />}
                  {ROLE_LABEL[role]}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">
            Ролей может быть несколько — человек переключается между интерфейсами сам.
            Первая выбранная считается основной.
          </p>
        </div>

        {needsClasses && (
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-ink-2">Закреплённые классы</span>
              <span className="text-[12px] text-ink-3">выбрано: {classIds.length}</span>
            </div>
            {school.classes.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">Классов пока нет.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {school.classes.map((c) => {
                  const on = classIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        setClassIds((l) => (on ? l.filter((x) => x !== c.id) : [...l, c.id]))
                      }
                      className={cx(
                        'cf-pill px-2.5 py-[4px] text-[12px] font-semibold transition-colors',
                        on ? 'border-brand/30 bg-brand-soft text-brand' : 'text-ink-3',
                      )}
                    >
                      {on && <Check size={12} className="mr-1 inline" />}
                      {school.classLabel(c.id)}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="mt-1.5 text-[12px] text-ink-3">
              У классного руководителя обычно один класс, у завуча — несколько.
            </p>
          </div>
        )}

        {isParent && (
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-ink-2">Дети</span>
              <span className="text-[12px] text-ink-3">выбрано: {childIds.length}</span>
              <span className="relative ml-auto">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
                <input
                  className="cf-input h-8 w-44 py-0 pl-8 text-[12.5px]"
                  placeholder="Поиск"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </span>
            </div>
            <div className="max-h-[32vh] space-y-1 overflow-y-auto rounded-[18px] border border-line p-2">
              {children.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12.5px] text-ink-3">Учеников не нашлось.</p>
              ) : (
                children.map((s) => {
                  const on = childIds.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => setChildIds((l) => (on ? l.filter((x) => x !== s.id) : [...l, s.id]))}
                      className={cx(
                        'flex w-full items-center gap-2 rounded-[12px] px-2.5 py-1.5 text-left text-[13px] transition-colors',
                        on ? 'bg-brand-soft text-brand' : 'hover:bg-surface-2',
                      )}
                    >
                      <span
                        className={cx(
                          'flex h-4 w-4 items-center justify-center rounded-[5px] border',
                          on ? 'border-brand bg-brand text-white' : 'border-line',
                        )}
                      >
                        {on && <Check size={11} />}
                      </span>
                      {school.fullName(s)}
                      <span className="ml-auto text-[11.5px] text-ink-3">{school.classLabel(s.class_id)}</span>
                    </button>
                  )
                })
              )}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-3">
              Родитель видит всё, что видит ребёнок, но сдавать работы за него не может.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand px-4" disabled={busy || !roles.length} onClick={() => void save()}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}
