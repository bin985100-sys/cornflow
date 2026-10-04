import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookMarked, BookOpen, Check, Plus, Trash2, UserCog } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/primitives'
import { cx } from '@/lib/utils'
import type { SchoolApi } from '@/hooks/useSchool'
import type { CurriculumView, GroupView, SchoolPerson, TeachingAssignment } from '@/lib/types'

/**
 * Курс: предмет × группа × учителя. При назначении создаётся
 * пространство-журнал. Учителей может быть несколько, и журнал у них общий —
 * иначе оценки одной группы разъехались бы по двум журналам, а в дневнике
 * ученика предмет задвоился бы. Ученики группы попадают в журнал сразу,
 * без кода приглашения.
 */
export function TeachingSection({ school }: { school: SchoolApi }) {
  const [creating, setCreating] = useState(false)
  // планы грузим один раз на всю страницу: в снимок школы они не входят
  const [plans, setPlans] = useState<CurriculumView[]>([])

  useEffect(() => {
    if (!school.schoolId) return
    let alive = true
    db.listCurricula(school.schoolId)
      .then((list) => alive && setPlans(list))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [school.schoolId])

  return (
    <section className="space-y-4">
      {school.isAdmin && (
        <div className="cf-card flex flex-wrap items-center gap-2 p-3">
          <span className="text-[13px] text-ink-2">Курсов: {school.assignments.length}</span>
          <button
            className="cf-btn-brand ml-auto px-4"
            disabled={!school.subjects.length || !school.groups.length}
            onClick={() => setCreating(true)}
          >
            <Plus size={15} /> Назначить предмет
          </button>
        </div>
      )}

      {school.assignments.length === 0 ? (
        <EmptyState
          title="Курсов пока нет"
          description="Выберите предмет, группу и учителей — журнал соберётся сам, ученики группы окажутся в нём."
        />
      ) : (
        <div className="space-y-2">
          {school.assignments.map((a) => (
            <AssignmentRow key={a.id} assignment={a} school={school} plans={plans} />
          ))}
        </div>
      )}

      {creating && <TeachingModal school={school} onClose={() => setCreating(false)} />}
    </section>
  )
}

function AssignmentRow({
  assignment,
  school,
  plans,
}: {
  assignment: TeachingAssignment
  school: SchoolApi
  plans: CurriculumView[]
}) {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const subject = school.subjects.find((s) => s.id === assignment.subject_id)
  const group = school.groups.find((g) => g.id === assignment.group_id)
  const teachers = assignment.teacher_ids
    .map((id) => school.people.find((p) => p.id === id))
    .filter((p): p is SchoolPerson => Boolean(p))

  return (
    <div className="cf-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen size={16} className="text-ink-3" />
        <span className="text-[14px] font-semibold">{subject?.name ?? 'предмет удалён'}</span>
        <ArrowRight size={14} className="text-ink-3" />
        <span className="text-[13px]">{group?.name ?? 'группа удалена'}</span>
        {group && <span className="cf-pill px-2 py-[2px] text-[11px] text-ink-3">{school.groupScope(group)}</span>}

        <div className="ml-auto flex items-center gap-1.5">
          {assignment.space_id && (
            <Link
              to="/app/gradebook"
              className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
              // приложение читает активное пространство из этого ключа
              onClick={() => localStorage.setItem('cornflow.space', assignment.space_id!)}
            >
              Открыть журнал
            </Link>
          )}
          {school.isAdmin && (
            <>
              <button className="cf-btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => setEditing(true)}>
                Учителя
              </button>
              <button className="cf-icon-btn" onClick={() => setConfirm(true)} title="Убрать назначение">
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
        <UserCog size={13} className="text-ink-3" />
        {teachers.length === 0 ? (
          <span className="text-[12.5px] text-ink-3">учителя не назначены</span>
        ) : (
          teachers.map((t) => (
            <span
              key={t.id}
              className="cf-pill px-2.5 py-[3px] text-[11.5px] font-semibold"
              title={t.user_id ? undefined : 'Аккаунт не заведён — в журнал не попадёт'}
            >
              {school.fullName(t)}
            </span>
          ))
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
        <BookMarked size={13} className="shrink-0 text-ink-3" />
        <span className="text-[12.5px] text-ink-3">КТП</span>
        <select
          className="cf-input h-8 min-w-[200px] max-w-full py-0 text-[12.5px]"
          value={assignment.curriculum_id ?? ''}
          disabled={!school.isAdmin}
          onChange={async (e) => {
            try {
              await db.setAssignmentCurriculum(assignment.id, e.target.value || null)
              await school.refresh()
            } catch (err) {
              toast.error(err)
            }
          }}
        >
          <option value="">не выбран — заведётся сам</option>
          {plans
            .filter((p) => !p.subject_id || p.subject_id === assignment.subject_id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.is_auto ? ' (авто)' : ''}
              </option>
            ))}
        </select>
      </div>

      {editing && (
        <TeachersModal
          school={school}
          assignment={assignment}
          title={`${subject?.name ?? 'Курс'} · ${group?.name ?? ''}`}
          onClose={() => setEditing(false)}
        />
      )}

      <ConfirmDialog
        open={confirm}
        title="Убрать назначение?"
        description="Пространство с журналом останется — удалить его можно в настройках пространства."
        confirmLabel="Убрать"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false)
          try {
            await db.deleteTeaching(assignment.id)
            await school.refresh()
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </div>
  )
}

/** Список учителей с галочками — общий для создания курса и правки состава. */
function TeacherPicker({
  school,
  value,
  onChange,
  hint,
}: {
  school: SchoolApi
  value: string[]
  onChange: (ids: string[]) => void
  hint?: string
}) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  }

  if (!school.teachers.length) {
    return (
      <p className="text-[12.5px] text-ink-3">
        Учителей в школе пока нет — добавьте их в разделе «Учителя».
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {school.teachers.map((t) => {
          const on = value.includes(t.id)
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className={cx(
                'cf-pill px-2.5 py-[4px] text-[12px] font-semibold transition-colors',
                on ? 'border-brand/30 bg-brand-soft text-brand' : 'text-ink-3',
              )}
              title={t.user_id ? undefined : 'Аккаунт не заведён — в журнал не попадёт'}
            >
              {on && <Check size={12} className="mr-1 inline" />}
              {school.fullName(t)}
              {!t.user_id && ' ·'}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3">
        {hint ?? 'Учителей можно выбрать несколько — журнал у них общий, править могут все.'}
      </p>
    </div>
  )
}

function TeachersModal({
  school,
  assignment,
  title,
  onClose,
}: {
  school: SchoolApi
  assignment: TeachingAssignment
  title: string
  onClose: () => void
}) {
  const toast = useToast()
  const [ids, setIds] = useState<string[]>(assignment.teacher_ids)
  const [busy, setBusy] = useState(false)

  return (
    <Modal open onClose={onClose} title={`Учителя курса · ${title}`} size="sm">
      <div className="space-y-4">
        <TeacherPicker school={school} value={ids} onChange={setIds} />
        <p className="text-[12px] text-ink-3">
          Снятый с курса учитель теряет доступ к журналу. Оценки, которые он выставил, остаются.
        </p>
        <div className="flex justify-end gap-2">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button
            className="cf-btn-brand px-4"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await db.updateTeaching(assignment.id, { teacher_ids: ids })
                await school.refresh()
                onClose()
              } catch (e) {
                toast.error(e)
              } finally {
                setBusy(false)
              }
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}

function TeachingModal({ school, onClose }: { school: SchoolApi; onClose: () => void }) {
  const toast = useToast()
  const [groupId, setGroupId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [teacherIds, setTeacherIds] = useState<string[]>([])
  const [touchedTeachers, setTouchedTeachers] = useState(false)
  const [busy, setBusy] = useState(false)

  const group = school.groups.find((g) => g.id === groupId)

  // предмет предлагаем только тот, что разрешён в классах этой группы
  const subjects = useMemo(() => {
    if (!group) return school.subjects
    const classIds = new Set<string>()
    if (group.class_id) classIds.add(group.class_id)
    if (group.parallel_id) school.classesByParallel(group.parallel_id).forEach((c) => classIds.add(c.id))
    group.member_ids.forEach((id) => {
      const person = school.people.find((p) => p.id === id)
      if (person?.class_id) classIds.add(person.class_id)
    })
    return school.subjects.filter(
      (s) => s.class_ids.length === 0 || s.class_ids.some((c) => classIds.has(c)),
    )
  }, [group, school])

  // при выборе группы подставляем её учителей — админ может поправить
  function pickGroup(next: GroupView | undefined, id: string) {
    setGroupId(id)
    if (!touchedTeachers) setTeacherIds(next?.teacher_ids ?? [])
  }

  async function save() {
    if (!school.schoolId || !groupId || !subjectId) return
    setBusy(true)
    try {
      await db.createTeaching({
        school_id: school.schoolId,
        subject_id: subjectId,
        group_id: groupId,
        teacher_ids: teacherIds,
      })
      await school.refresh()
      toast.success('Курс создан, журнал готов')
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Назначить предмет" size="sm">
      <div className="space-y-3">
        <div>
          <span className="mb-1 block text-[12.5px] text-ink-2">Группа</span>
          <select
            className="cf-input w-full"
            value={groupId}
            onChange={(e) => pickGroup(school.groups.find((g) => g.id === e.target.value), e.target.value)}
          >
            <option value="">выберите</option>
            {school.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} · {g.member_ids.length}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="mb-1 block text-[12.5px] text-ink-2">Предмет</span>
          <select className="cf-input w-full" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">выберите</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {group && subjects.length < school.subjects.length && (
            <p className="mt-1 text-[12px] text-ink-3">
              Показаны предметы, разрешённые в классах этой группы.
            </p>
          )}
        </div>

        <div>
          <span className="mb-1.5 block text-[12.5px] text-ink-2">Учителя курса</span>
          <TeacherPicker
            school={school}
            value={teacherIds}
            onChange={(ids) => {
              setTouchedTeachers(true)
              setTeacherIds(ids)
            }}
            hint={
              group?.teacher_ids.length
                ? 'Подставлены учителя группы — список можно поправить. Журнал у них общий.'
                : 'Учителей можно выбрать несколько — журнал у них общий, править могут все.'
            }
          />
          <p className="mt-1 text-[12px] text-ink-3">
            Учитель без аккаунта в пространство не попадёт — сначала выдайте ему логин и пароль.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand px-4" disabled={busy || !groupId || !subjectId} onClick={() => void save()}>
            Создать курс
          </button>
        </div>
      </div>
    </Modal>
  )
}
