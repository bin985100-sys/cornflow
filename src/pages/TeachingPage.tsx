import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, GraduationCap, UserCog, UserPlus, Users } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useSchool } from '@/hooks/useSchool'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, Segmented, Skeleton } from '@/components/ui/primitives'
import { cardPalette, plural } from '@/lib/utils'
import type {
  GroupView,
  RosterRequestKind,
  SchoolPerson,
  SubjectView,
  TeachingAssignment,
} from '@/lib/types'

/**
 * «Мои группы» — экран учителя. Все группы, в которых он преподаёт, разложены
 * по предметам: у одного учителя может быть алгебра в трёх группах и геометрия
 * в двух, и это разные журналы. Клик по группе открывает её журнал.
 */
export function TeachingPage() {
  const { user } = useAuth()
  const school = useSchool()
  const navigate = useNavigate()
  const [rosterFor, setRosterFor] = useState<GroupView | null>(null)

  // кто я в этой школе — по этому person_id ищу свои курсы
  const me = useMemo(
    () => school.people.find((p) => p.user_id === user?.id) ?? null,
    [school.people, user?.id],
  )

  /** курсы, где я значусь учителем, сгруппированные по предмету */
  const bySubject = useMemo(() => {
    if (!me) return []
    const mine = school.assignments.filter((a) => a.teacher_ids.includes(me.id))
    const map = new Map<string, { subject: SubjectView | null; items: TeachingAssignment[] }>()
    for (const a of mine) {
      const key = a.subject_id
      if (!map.has(key)) {
        map.set(key, { subject: school.subjects.find((s) => s.id === a.subject_id) ?? null, items: [] })
      }
      map.get(key)!.items.push(a)
    }
    return [...map.values()].sort((x, y) =>
      (x.subject?.name ?? '').localeCompare(y.subject?.name ?? '', 'ru'),
    )
  }, [me, school.assignments, school.subjects])

  const groupCount = bySubject.reduce((n, s) => n + s.items.length, 0)
  const studentCount = useMemo(() => {
    const ids = new Set<string>()
    bySubject.forEach((s) =>
      s.items.forEach((a) => {
        school.groups.find((g) => g.id === a.group_id)?.member_ids.forEach((id) => ids.add(id))
      }),
    )
    return ids.size
  }, [bySubject, school.groups])

  function openJournal(assignment: TeachingAssignment) {
    if (!assignment.space_id) return
    // приложение читает активное пространство из этого ключа
    localStorage.setItem('cornflow.space', assignment.space_id)
    navigate('/app/gradebook')
  }

  if (school.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (!me) {
    return (
      <EmptyState
        title="Школа не найдена"
        description="Этот аккаунт не привязан к школе. Курсы появятся, когда администратор добавит вас и назначит предмет."
      />
    )
  }

  return (
    <div className="animate-fade-up space-y-5">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">Мои группы</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {school.school.name} · {plural(bySubject.length, 'предмет', 'предмета', 'предметов')} ·{' '}
            {plural(groupCount, 'группа', 'группы', 'групп')}
          </p>
        </div>
        {studentCount > 0 && (
          <span className="cf-pill ml-auto px-3 py-1.5 text-[12.5px] text-ink-2">
            <Users size={13} className="mr-1 inline" />
            учеников: {studentCount}
          </span>
        )}
      </header>

      {bySubject.length === 0 ? (
        <EmptyState
          title="Групп пока нет"
          description="Как только администратор назначит вам предмет и группу, курс и журнал появятся здесь."
          art="tasks"
        />
      ) : (
        <div className="space-y-6">
          {bySubject.map(({ subject, items }) => {
            const palette = cardPalette[subject?.color ?? 'blue']
            const department = school.departments.find((d) => d.id === subject?.department_id)
            return (
              <section key={subject?.id ?? 'unknown'} className="space-y-3">
                <header className="flex flex-wrap items-center gap-2 px-1">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-[10px]"
                    style={{ background: palette.bg, color: palette.accent }}
                  >
                    <BookOpen size={15} />
                  </span>
                  <h2 className="text-[16px] font-semibold">{subject?.name ?? 'Предмет удалён'}</h2>
                  {department && (
                    <span className="cf-pill px-2 py-[2px] text-[11px] text-ink-3">МО {department.name}</span>
                  )}
                  <span className="text-[12.5px] text-ink-3">
                    {plural(items.length, 'группа', 'группы', 'групп')}
                  </span>
                </header>

                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((a) => (
                    <GroupCard
                      key={a.id}
                      assignment={a}
                      group={school.groups.find((g) => g.id === a.group_id) ?? null}
                      coTeachers={a.teacher_ids
                        .filter((id) => id !== me.id)
                        .map((id) => school.people.find((p) => p.id === id))
                        .filter((p): p is SchoolPerson => Boolean(p))}
                      accent={palette.accent}
                      scope={(g) => school.groupScope(g)}
                      fullName={(p) => school.fullName(p)}
                      onOpen={() => openJournal(a)}
                      onRoster={(g) => setRosterFor(g)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {rosterFor && (
        <RosterRequestModal school={school} group={rosterFor} onClose={() => setRosterFor(null)} />
      )}
    </div>
  )
}

function GroupCard({
  assignment,
  group,
  coTeachers,
  accent,
  scope,
  fullName,
  onOpen,
  onRoster,
}: {
  assignment: TeachingAssignment
  group: GroupView | null
  coTeachers: SchoolPerson[]
  accent: string
  scope: (g: GroupView) => string
  fullName: (p: SchoolPerson) => string
  onOpen: () => void
  onRoster: (group: GroupView) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="cf-card group w-full cursor-pointer p-4 text-left transition-shadow hover:shadow-pop"
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="flex flex-wrap items-center gap-2">
        <GraduationCap size={16} style={{ color: accent }} />
        <h3 className="text-[15px] font-semibold">{group?.name ?? 'группа удалена'}</h3>
        {group && <span className="cf-pill px-2 py-[2px] text-[11px] text-ink-3">{scope(group)}</span>}
        <ArrowRight
          size={15}
          className="ml-auto text-ink-3 transition-transform group-hover:translate-x-0.5"
        />
      </div>

      <p className="mt-2 text-[12.5px] text-ink-3">
        {group && group.member_ids.length > 0
          ? `Учеников: ${group.member_ids.length}`
          : 'Учеников пока нет'}
      </p>

      {coTeachers.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
          <UserCog size={12} />
          вместе с вами: {coTeachers.map(fullName).join(', ')}
        </p>
      )}

      {!assignment.space_id && (
        <p className="mt-1.5 text-[12px] text-ink-3">Журнал ещё не создан</p>
      )}

      {group && (
        <button
          className="cf-btn-ghost mt-2 px-3 text-[12.5px]"
          onClick={(e) => {
            e.stopPropagation()
            onRoster(group)
          }}
        >
          <UserPlus size={13} /> Изменить состав
        </button>
      )}
    </div>
  )
}

/**
 * Просьба изменить состав группы.
 *
 * Состав правит администратор, но расхождение замечает учитель: к нему ходит
 * ученик, которого в списке нет. Решение придёт в виде изменённого состава.
 */
function RosterRequestModal({
  school,
  group,
  onClose,
}: {
  school: ReturnType<typeof useSchool>
  group: GroupView
  onClose: () => void
}) {
  const toast = useToast()
  const [kind, setKind] = useState<RosterRequestKind>('add')
  const [personId, setPersonId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const inGroup = new Set(group.member_ids)
  const candidates = school.students.filter((s) =>
    kind === 'add' ? !inGroup.has(s.id) : inGroup.has(s.id),
  )

  async function send() {
    if (!school.schoolId || !personId) return
    setBusy(true)
    try {
      await db.requestRosterChange({
        school_id: school.schoolId,
        group_id: group.id,
        person_id: personId,
        kind,
        note: note.trim() || null,
      })
      toast.success('Запрос ушёл администратору')
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Состав группы · ${group.name}`}>
      <div className="space-y-3">
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v as RosterRequestKind)
            setPersonId('')
          }}
          options={[
            { value: 'add', label: 'Добавить' },
            { value: 'remove', label: 'Убрать' },
          ]}
        />

        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Ученик</span>
          <select className="cf-input w-full" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">выберите ученика</option>
            {candidates.map((s) => (
              <option key={s.id} value={s.id}>
                {school.fullName(s)} · {school.classLabel(s.class_id)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[12.5px] text-ink-2">Почему</span>
          <input
            className="cf-input w-full"
            placeholder="Перевёлся из 7Б"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <p className="text-[12px] text-ink-3">
          Состав меняет администратор. Как только он примет запрос, ученик появится в журнале или
          исчезнет из него.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand px-4" disabled={busy || !personId} onClick={() => void send()}>
            Отправить
          </button>
        </div>
      </div>
    </Modal>
  )
}
