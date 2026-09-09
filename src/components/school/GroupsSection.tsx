import { useMemo, useState } from 'react'
import { Check, Plus, Search, Trash2, Users } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState, Segmented } from '@/components/ui/primitives'
import { cx } from '@/lib/utils'
import type { SchoolApi } from '@/hooks/useSchool'
import type { GroupKind, GroupView } from '@/lib/types'

/**
 * Группы двух типов:
 *   • группа класса или параллели — состав ограничен ими;
 *   • смешанная — любые ученики из любых классов и параллелей.
 *
 * На группу вешается предмет с учителем — из этой тройки вырастает курс.
 */
export function GroupsSection({ school }: { school: SchoolApi }) {
  const [creating, setCreating] = useState(false)

  return (
    <section className="space-y-4">
      {school.isAdmin && (
        <div className="cf-card flex flex-wrap items-center gap-2 p-3">
          <span className="text-[13px] text-ink-2">Групп: {school.groups.length}</span>
          <button className="cf-btn-brand ml-auto px-4" onClick={() => setCreating(true)}>
            <Plus size={15} /> Новая группа
          </button>
        </div>
      )}

      {school.groups.length === 0 ? (
        <EmptyState
          title="Групп пока нет"
          description="Группа — это состав, которому потом назначается предмет и учитель."
          art="tasks"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {school.groups.map((group) => (
            <GroupCard key={group.id} group={group} school={school} />
          ))}
        </div>
      )}

      {creating && <GroupModal school={school} onClose={() => setCreating(false)} />}
    </section>
  )
}

function GroupCard({ group, school }: { group: GroupView; school: SchoolApi }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const scope =
    group.kind === 'mixed'
      ? 'смешанная'
      : group.class_id
        ? `класс ${school.classLabel(group.class_id)}`
        : `параллель ${school.parallels.find((p) => p.id === group.parallel_id)?.name ?? ''}`

  return (
    <div className="cf-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Users size={16} className="text-ink-3" />
        <h3 className="text-[15px] font-semibold">{group.name}</h3>
        <span className="cf-pill px-2 py-[2px] text-[11px] text-ink-3">{scope}</span>
        {school.isAdmin && (
          <div className="ml-auto flex items-center gap-1.5">
            <button className="cf-btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => setEditing(true)}>
              Состав
            </button>
            <button className="cf-icon-btn" onClick={() => setConfirm(true)} title="Удалить">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </header>

      <p className="mt-2 text-[12.5px] text-ink-3">
        {group.member_ids.length === 0
          ? 'Пока пусто — добавьте учеников'
          : `Учеников: ${group.member_ids.length}`}
      </p>

      {editing && <GroupModal school={school} group={group} onClose={() => setEditing(false)} />}

      <ConfirmDialog
        open={confirm}
        title={`Удалить группу «${group.name}»?`}
        description="Удалятся и назначения предметов этой группе. Курсы и оценки останутся."
        confirmLabel="Удалить"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false)
          try {
            await db.deleteGroup(group.id)
            await school.refresh()
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </div>
  )
}

function GroupModal({
  school,
  group,
  onClose,
}: {
  school: SchoolApi
  group?: GroupView
  onClose: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(group?.name ?? '')
  const [kind, setKind] = useState<GroupKind>(group?.kind ?? 'class')
  const [parallelId, setParallelId] = useState(group?.parallel_id ?? '')
  const [classId, setClassId] = useState(group?.class_id ?? '')
  const [members, setMembers] = useState<string[]>(group?.member_ids ?? [])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  // для группы класса состав ограничен выбранным классом или параллелью
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return school.students.filter((s) => {
      if (kind === 'class') {
        if (classId && s.class_id !== classId) return false
        if (!classId && parallelId) {
          const klass = school.classes.find((c) => c.id === s.class_id)
          if (klass?.parallel_id !== parallelId) return false
        }
      }
      if (!q) return true
      return school.fullName(s).toLowerCase().includes(q)
    })
  }, [school, kind, classId, parallelId, query])

  function toggle(id: string) {
    setMembers((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  }

  async function save() {
    if (!school.schoolId || !name.trim()) return
    if (kind === 'class' && !classId && !parallelId) {
      toast.error('Для группы класса выберите класс или параллель')
      return
    }
    setBusy(true)
    try {
      const payload = {
        name,
        parallel_id: kind === 'class' ? parallelId || null : null,
        class_id: kind === 'class' ? classId || null : null,
        member_ids: members,
      }
      if (group) await db.updateGroup(group.id, payload)
      else await db.createGroup({ school_id: school.schoolId, kind, ...payload })
      await school.refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={group ? 'Группа' : 'Новая группа'} size="lg">
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-[12.5px] text-ink-2">Название</span>
          <input
            className="cf-input w-full"
            placeholder="9А · английский, группа 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <span className="mb-1.5 block text-[12.5px] text-ink-2">Тип группы</span>
          <Segmented
            value={kind}
            onChange={(v) => {
              setKind(v)
              if (v === 'mixed') {
                setParallelId('')
                setClassId('')
              }
            }}
            options={[
              { value: 'class' as GroupKind, label: 'Класс или параллель' },
              { value: 'mixed' as GroupKind, label: 'Смешанная' },
            ]}
          />
          <p className="mt-1.5 text-[12px] text-ink-3">
            {kind === 'class'
              ? 'В группу попадут только ученики выбранного класса или параллели.'
              : 'В смешанную группу можно взять кого угодно — разные классы и параллели.'}
          </p>
        </div>

        {kind === 'class' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-[12.5px] text-ink-2">Параллель</span>
              <select
                className="cf-input w-full"
                value={parallelId}
                onChange={(e) => {
                  setParallelId(e.target.value)
                  setClassId('')
                }}
              >
                <option value="">не выбрана</option>
                {school.parallels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="mb-1 block text-[12.5px] text-ink-2">Класс</span>
              <select className="cf-input w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">вся параллель</option>
                {(parallelId ? school.classesByParallel(parallelId) : school.classes).map((c) => (
                  <option key={c.id} value={c.id}>
                    {school.classLabel(c.id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-ink-2">Состав</span>
            <span className="text-[12px] text-ink-3">выбрано: {members.length}</span>
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

          <div className="max-h-[36vh] space-y-1 overflow-y-auto rounded-[18px] border border-line p-2">
            {candidates.length === 0 ? (
              <p className="px-2 py-6 text-center text-[12.5px] text-ink-3">
                Подходящих учеников нет. Проверьте класс или добавьте учеников в школу.
              </p>
            ) : (
              candidates.map((s) => {
                const on = members.includes(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
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
        </div>

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
