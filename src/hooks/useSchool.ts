import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/db'
import type {
  GroupView,
  PersonAccess,
  School,
  SchoolClass,
  SchoolPerson,
  SchoolRole,
  SchoolSnapshot,
  SchoolTerm,
  SubjectView,
} from '@/lib/types'

const ACTIVE_KEY = 'cornflow.school'

const EMPTY: SchoolSnapshot = {
  school: { id: '', name: '', code: '', owner_id: '', created_at: '' },
  role: 'student',
  myRoles: ['student'],
  terms: [],
  holidays: [],
  access: [],
  parallels: [],
  classes: [],
  people: [],
  departments: [],
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
  /** предметы МО; departmentId === null — предметы без МО */
  subjectsByDepartment: (departmentId: string | null) => SubjectView[]
  /** учителя группы, в том порядке, в котором их добавил администратор */
  groupTeachers: (group: GroupView) => SchoolPerson[]
  /** краткое «класс 9А» / «параллель 9» / «смешанная» */
  groupScope: (group: GroupView) => string
  /** учебные годы, внутри каждого — полугодия и четверти */
  years: SchoolTerm[]
  /** вложенные периоды: полугодия года или четверти полугодия */
  termChildren: (parentId: string) => SchoolTerm[]
  /** период, помеченный текущим; иначе тот, в который попадает сегодня */
  currentTerm: SchoolTerm | null
  termLabel: (termId: string | null | undefined) => string
  /** роли и привязки человека */
  accessOf: (personId: string) => PersonAccess
  hasRole: (role: SchoolRole) => boolean
}

/** Названия ролей в единственном числе, для списков и чипов */
export const ROLE_LABEL: Record<SchoolRole, string> = {
  admin: 'Администратор',
  teacher: 'Учитель',
  student: 'Ученик',
  parent: 'Родитель',
  homeroom: 'Классный руководитель',
  headteacher: 'Завуч',
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
      const prefix = parallel?.name ?? ''
      // «9» + «А» = 9А, но «Начальная школа» + «Ромашка» = «Начальная школа Ромашка»:
      // слитно только когда параллель — число, а класс — короткая литера
      const glue = /^\d+$/.test(prefix) && klass.name.length <= 2 ? '' : ' '
      return `${prefix}${glue}${klass.name}`.trim() || klass.name
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

  const subjectsByDepartment = useCallback(
    (departmentId: string | null) =>
      data.subjects.filter((s) => (s.department_id ?? null) === departmentId),
    [data.subjects],
  )

  const groupTeachers = useCallback(
    (group: GroupView) =>
      group.teacher_ids
        .map((id) => data.people.find((p) => p.id === id))
        .filter((p): p is SchoolPerson => Boolean(p)),
    [data.people],
  )

  const groupScope = useCallback(
    (group: GroupView) => {
      if (group.kind === 'mixed') return 'смешанная'
      if (group.class_id) return `класс ${classLabel(group.class_id)}`
      const parallel = data.parallels.find((p) => p.id === group.parallel_id)
      return parallel ? `параллель ${parallel.name}` : 'класс не выбран'
    },
    [classLabel, data.parallels],
  )

  const years = useMemo(
    () => data.terms.filter((t) => t.kind === 'year').sort((a, b) => a.position - b.position),
    [data.terms],
  )

  const termChildren = useCallback(
    (parentId: string) =>
      data.terms.filter((t) => t.parent_id === parentId).sort((a, b) => a.position - b.position),
    [data.terms],
  )

  const currentTerm = useMemo(() => {
    const marked = data.terms.find((t) => t.is_current && t.kind !== 'year')
    if (marked) return marked
    // ничего не помечено — берём тот период, в который попадает сегодня
    const today = new Date().toISOString().slice(0, 10)
    return (
      data.terms.find((t) => t.kind === 'quarter' && t.start_date <= today && today <= t.end_date) ??
      data.terms.find((t) => t.is_current) ??
      null
    )
  }, [data.terms])

  const termLabel = useCallback(
    (termId: string | null | undefined) => {
      if (!termId) return 'без периода'
      const term = data.terms.find((t) => t.id === termId)
      if (!term) return 'период удалён'
      const parent = term.parent_id ? data.terms.find((t) => t.id === term.parent_id) : null
      const year = parent?.parent_id ? data.terms.find((t) => t.id === parent.parent_id) : parent
      return year && year.id !== term.id ? `${term.name} · ${year.name}` : term.name
    },
    [data.terms],
  )

  const accessOf = useCallback(
    (personId: string): PersonAccess =>
      data.access.find((a) => a.person_id === personId) ?? {
        person_id: personId,
        roles: [],
        class_ids: [],
        child_ids: [],
      },
    [data.access],
  )

  const hasRole = useCallback((role: SchoolRole) => data.myRoles.includes(role), [data.myRoles])

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
    // администратором делает и основная роль, и добавленная в person_roles
    isAdmin: data.role === 'admin' || data.myRoles.includes('admin'),
    refresh: load,
    classLabel,
    fullName,
    students,
    teachers,
    classesByParallel,
    subjectsByDepartment,
    groupTeachers,
    groupScope,
    years,
    termChildren,
    currentTerm,
    termLabel,
    accessOf,
    hasRole,
  }
}
