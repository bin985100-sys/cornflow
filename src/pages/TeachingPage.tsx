import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, GraduationCap, UserCog, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useSchool } from '@/hooks/useSchool'
import { EmptyState, Skeleton } from '@/components/ui/primitives'
import { cardPalette } from '@/lib/utils'
import type { GroupView, SchoolPerson, SubjectView, TeachingAssignment } from '@/lib/types'

/**
 * «Мои группы» — экран учителя. Все группы, в которых он преподаёт, разложены
 * по предметам: у одного учителя может быть алгебра в трёх группах и геометрия
 * в двух, и это разные журналы. Клик по группе открывает её журнал.
 */
export function TeachingPage() {
  const { user } = useAuth()
  const school = useSchool()
  const navigate = useNavigate()

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
            {school.school.name} · {bySubject.length}{' '}
            {plural(bySubject.length, 'предмет', 'предмета', 'предметов')} · {groupCount}{' '}
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
                    {items.length} {plural(items.length, 'группа', 'группы', 'групп')}
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
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
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
}: {
  assignment: TeachingAssignment
  group: GroupView | null
  coTeachers: SchoolPerson[]
  accent: string
  scope: (g: GroupView) => string
  fullName: (p: SchoolPerson) => string
  onOpen: () => void
}) {
  return (
    <button
      className="cf-card group w-full p-4 text-left transition-shadow hover:shadow-pop"
      onClick={onOpen}
      disabled={!assignment.space_id}
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
    </button>
  )
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = n % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
