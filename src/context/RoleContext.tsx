import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from '@/lib/db'
import type { MyMembership, SchoolRole } from '@/lib/types'

const ACTIVE_KEY = 'cf.activeRole'

/** Порядок в переключателе: от самой «рабочей» роли к административной. */
const ORDER: SchoolRole[] = ['student', 'parent', 'teacher', 'homeroom', 'headteacher', 'admin']

/** Куда ведёт роль. Экраны, которых ещё нет, открывают дашборд. */
export const ROLE_HOME: Record<SchoolRole, string> = {
  student: '/app/diary',
  teacher: '/app/teaching',
  parent: '/app',
  homeroom: '/app',
  headteacher: '/app',
  admin: '/admin',
}

export interface RoleApi {
  /** школы пользователя с его ролями в каждой */
  memberships: MyMembership[]
  /** все роли без привязки к школе, в порядке ORDER */
  roles: SchoolRole[]
  /** выбранный интерфейс; null — пока грузим или ролей в школе нет */
  active: SchoolRole | null
  setActive(role: SchoolRole): void
  /** есть ли у человека такая роль хоть в одной школе */
  has(role: SchoolRole): boolean
  loading: boolean
}

const Ctx = createContext<RoleApi | null>(null)

/**
 * Роли человека в школах и выбранный интерфейс.
 *
 * Один человек бывает и учителем, и родителем ученика этой же школы, и
 * классным руководителем. Держим список его ролей и то, каким интерфейсом он
 * сейчас пользуется, — чтобы меню и главный экран менялись вместе.
 */
export function RoleProvider({ children }: { children: ReactNode }) {
  const [memberships, setMemberships] = useState<MyMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [stored, setStored] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY)
    } catch {
      return null
    }
  })

  useEffect(() => {
    let alive = true
    db.myMemberships()
      .then((list) => alive && setMemberships(list))
      .catch(() => undefined)
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const roles = useMemo(() => {
    const set = new Set<SchoolRole>()
    for (const m of memberships) for (const r of m.roles) set.add(r)
    return ORDER.filter((r) => set.has(r))
  }, [memberships])

  // сохранённая роль могла пропасть: админ снял её — возвращаемся к первой
  const active = useMemo<SchoolRole | null>(() => {
    if (!roles.length) return null
    const saved = stored as SchoolRole | null
    return saved && roles.includes(saved) ? saved : roles[0]
  }, [roles, stored])

  const setActive = useCallback((role: SchoolRole) => {
    setStored(role)
    try {
      localStorage.setItem(ACTIVE_KEY, role)
    } catch {
      /* приватный режим — просто не запоминаем выбор */
    }
  }, [])

  const has = useCallback((role: SchoolRole) => roles.includes(role), [roles])

  const value = useMemo<RoleApi>(
    () => ({ memberships, roles, active, setActive, has, loading }),
    [memberships, roles, active, setActive, has, loading],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRoles(): RoleApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRoles должен использоваться внутри RoleProvider')
  return ctx
}
