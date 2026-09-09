import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/db'
import type { School, SchoolClass, SchoolPerson, SchoolSnapshot } from '@/lib/types'

const ACTIVE_KEY = 'cornflow.school'

const EMPTY: SchoolSnapshot = {
  school: { id: '', name: '', code: '', owner_id: '', created_at: '' },
  role: 'student',
  parallels: [],
  classes: [],
  people: [],
  subjects: [],
  groups: [],
  assignments: [],
}

export interface SchoolApi extends SchoolSnapshot {
  /** школы, где пользователь состоит */
  schools: School[]
  schoolId: string | null
  setSchoolId: (id: string | null) => void
  loading: boolean
  isAdmin: boolean
  refresh: () => Promise<void>
  /** «9» + «А» → «9А» */
  classLabel: (classId: string | null | undefined) => string
  fullName: (person: SchoolPerson) => string
  students: SchoolPerson[]
  teachers: SchoolPerson[]
  classesByParallel: (parallelId: string) => SchoolClass[]
}

/** Справочник школы: список школ, активная школа и её содержимое. */
export function useSchool(): SchoolApi {
  const [schools, setSchools] = useState<School[]>([])
  const [schoolId, setSchoolIdState] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY))
  const [data, setData] = useState<SchoolSnapshot>(EMPTY)
  const [loading, setLoading] = useState(true)

  const setSchoolId = useCallback((id: string | null) => {
    setSchoolIdState(id)
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  }, [])

  const load = useCallback(async () => {
    try {
      const list = await db.listSchools()
      setSchools(list)
      // активная школа могла исчезнуть или ещё не выбрана
      const active = list.find((s) => s.id === schoolId) ?? list[0] ?? null
      if (active?.id !== schoolId) {
        setSchoolIdState(active?.id ?? null)
        if (active) localStorage.setItem(ACTIVE_KEY, active.id)
      }
      setData(active ? await db.loadSchool(active.id) : EMPTY)
    } catch {
      setSchools([])
      setData(EMPTY)
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    let timer: number | undefined
    const off = db.subscribe((e) => {
      if (e.table !== 'school') return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void load(), 150)
    })
    return () => {
      window.clearTimeout(timer)
      off()
    }
  }, [load])

  const classLabel = useCallback(
    (classId: string | null | undefined) => {
      if (!classId) return '—'
      const klass = data.classes.find((c) => c.id === classId)
      if (!klass) return '—'
      const parallel = data.parallels.find((p) => p.id === klass.parallel_id)
      return `${parallel?.name ?? ''}${klass.name}`.trim() || klass.name
    },
    [data.classes, data.parallels],
  )

  const fullName = useCallback(
    (person: SchoolPerson) =>
      [person.last_name, person.first_name, person.middle_name].filter(Boolean).join(' ').trim() ||
      person.login ||
      'Без имени',
    [],
  )

  const classesByParallel = useCallback(
    (parallelId: string) => data.classes.filter((c) => c.parallel_id === parallelId),
    [data.classes],
  )

  const students = useMemo(() => data.people.filter((p) => p.role === 'student'), [data.people])
  const teachers = useMemo(
    () => data.people.filter((p) => p.role === 'teacher' || p.role === 'admin'),
    [data.people],
  )

  return {
    ...data,
    schools,
    schoolId,
    setSchoolId,
    loading,
    isAdmin: data.role === 'admin',
    refresh: load,
    classLabel,
    fullName,
    students,
    teachers,
    classesByParallel,
  }
}
