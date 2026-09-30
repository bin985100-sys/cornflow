import { useCallback, useEffect, useState } from 'react'
import { db } from '@/lib/db'
import type {
  PlatformAuditEntry,
  PlatformOverview,
  PlatformPerson,
  PlatformSchool,
  PlatformSpace,
} from '@/lib/types'

export interface PlatformApi {
  /** null — ещё проверяем, false — доступа нет */
  isAdmin: boolean | null
  loading: boolean
  error: string | null
  overview: PlatformOverview | null
  schools: PlatformSchool[]
  spaces: PlatformSpace[]
  audit: PlatformAuditEntry[]
  refresh: () => Promise<void>
  findPeople: (query: string) => Promise<PlatformPerson[]>
}

/**
 * Данные панели главного администратора. Всё грузится разом: платформа
 * небольшая, а листать страницы при разборе инцидента — лишний шаг.
 */
export function usePlatform(): PlatformApi {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [overview, setOverview] = useState<PlatformOverview | null>(null)
  const [schools, setSchools] = useState<PlatformSchool[]>([])
  const [spaces, setSpaces] = useState<PlatformSpace[]>([])
  const [audit, setAudit] = useState<PlatformAuditEntry[]>([])

  const load = useCallback(async () => {
    setError(null)
    try {
      const ok = await db.isPlatformAdmin()
      setIsAdmin(ok)
      if (!ok) {
        setLoading(false)
        return
      }
      const [o, s, sp, a] = await Promise.all([
        db.platformOverview(),
        db.platformSchools(),
        db.platformSpaces(),
        db.platformAudit(),
      ])
      setOverview(o)
      setSchools(s)
      setSpaces(sp)
      setAudit(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const findPeople = useCallback((query: string) => db.platformPeople(query), [])

  return { isAdmin, loading, error, overview, schools, spaces, audit, refresh: load, findPeople }
}
