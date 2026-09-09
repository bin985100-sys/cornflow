import { useMemo, useState } from 'react'
import { ArrowRight, BookOpen, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/primitives'
import type { SchoolApi } from '@/hooks/useSchool'
import type { TeachingAssignment } from '@/lib/types'

/**
 * Преподавание: предмет + группа + учитель. При назначении создаётся
 * пространство-журнал — у каждого учителя своё на каждый предмет. Ученики
 * группы попадают в него сразу, без кода приглашения.
 */
export function TeachingSection({ school }: { school: SchoolApi }) {
  const [creating, setCreating] = useState(false)

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
          description="Выберите предмет, группу и учителя — журнал соберётся сам, ученики группы окажутся в нём."
        />
      ) : (
        <div className="space-y-2">
          {school.assignments.map((a) => (
            <AssignmentRow key={a.id} assignment={a} school={school} />
          ))}
        </div>
      )}

      {creating && <TeachingModal school={school} onClose={() => setCreating(false)} />}
    </section>
  )
}

function AssignmentRow({ assignment, school }: { assignment: TeachingAssignment; school: SchoolApi }) {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const subject = school.subjects.find((s) => s.id === assignment.subject_id)
  const group = school.groups.find((g) => g.id === assignment.group_id)
  const teacher = school.people.find((p) => p.id === assignment.teacher_id)

  return (
    <div className="cf-card flex flex-wrap items-center gap-2 p-3">
      <BookOpen size={16} className="text-ink-3" />
      <span className="text-[14px] font-semibold">{subject?.name ?? 'предмет удалён'}</span>
      <ArrowRight size={14} className="text-ink-3" />
      <span className="text-[13px]">{group?.name ?? 'группа удалена'}</span>
      <span className="text-[12.5px] text-ink-3">
        {teacher ? school.fullName(teacher) : 'учитель не назначен'}
      </span>

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
          <button className="cf-icon-btn" onClick={() => setConfirm(true)} title="Убрать назначение">
            <Trash2 size={15} />
          </button>
        )}
      </div>

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

function TeachingModal({ school, onClose }: { school: SchoolApi; onClose: () => void }) {
  const toast = useToast()
  const [groupId, setGroupId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [teacherId, setTeacherId] = useState('')
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

  async function save() {
    if (!school.schoolId || !groupId || !subjectId) return
    setBusy(true)
    try {
      await db.createTeaching({
        school_id: school.schoolId,
        subject_id: subjectId,
        group_id: groupId,
        teacher_id: teacherId || null,
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
          <select className="cf-input w-full" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
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
          <span className="mb-1 block text-[12.5px] text-ink-2">Учитель</span>
          <select className="cf-input w-full" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">не назначен</option>
            {school.teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {school.fullName(t)}
                {t.user_id ? '' : ' — без аккаунта'}
              </option>
            ))}
          </select>
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
