import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/db'
import { useRoles } from '@/context/RoleContext'
import type { CurriculumView, LessonKind, SchoolSubject } from '@/lib/types'

export interface CurriculaApi {
  loading: boolean
  /** школа, чьи планы показываем */
  schoolId: string | null
  /** человек текущего пользователя в этой школе; владелец новых планов */
  personId: string | null
  all: CurriculumView[]
  /** планы, которые ведёт сам пользователь */
  mine: CurriculumView[]
  /** чужие — их можно взять за основу, но не править */
  others: CurriculumView[]
  subjects: SchoolSubject[]
  kinds: LessonKind[]
  subjectName: (id: string | null) => string
  canEdit: (plan: CurriculumView) => boolean
  refresh: () => Promise<void>
}

/**
 * Планы (КТП) школы для экрана учителя.
 *
 * Полный справочник школы здесь не нужен — только предметы и типы уроков,
 * поэтому грузим снимок один раз и дальше работаем со списком планов.
 */
export function useCurricula(): CurriculaApi {
  const roles = useRoles()
  const schoolId = roles.memberships[0]?.school_id ?? null
  const personId = roles.memberships[0]?.person_id ?? null

  const [all, setAll] = useState<CurriculumView[]>([])
  const [subjects, setSubjects] = useState<SchoolSubject[]>([])
  const [kinds, setKinds] = useState<LessonKind[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!schoolId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [plans, snapshot] = await Promise.all([db.listCurricula(schoolId), db.loadSchool(schoolId)])
      setAll(plans)
      setSubjects(snapshot.subjects)
      setKinds(snapshot.lessonKinds)
    } catch {
      /* молча: экран покажет пустое состояние */
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => {
    void load()
  }, [load])

  const mine = useMemo(() => all.filter((c) => c.owner_id && c.owner_id === personId), [all, personId])
  const others = useMemo(() => all.filter((c) => !c.owner_id || c.owner_id !== personId), [all, personId])

  const subjectName = useCallback(
    (id: string | null) => (id ? (subjects.find((s) => s.id === id)?.name ?? 'Предмет') : 'Без предмета'),
    [subjects],
  )

  // править может владелец; администратору это разрешает уже база
  const canEdit = useCallback(
    (plan: CurriculumView) => Boolean(personId) && plan.owner_id === personId,
    [personId],
  )

  return { loading, schoolId, personId, all, mine, others, subjects, kinds, subjectName, canEdit, refresh: load }
}
