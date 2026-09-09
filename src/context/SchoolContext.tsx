import { createContext, useContext, type ReactNode } from 'react'
import { useSchool, type SchoolApi } from '@/hooks/useSchool'

const Ctx = createContext<SchoolApi | null>(null)

/**
 * Один экземпляр справочника школы на всю админ-панель: иначе каждая вкладка
 * грузила бы его заново и данные разъезжались бы между разделами.
 */
export function SchoolProvider({ children }: { children: ReactNode }) {
  const school = useSchool()
  return <Ctx.Provider value={school}>{children}</Ctx.Provider>
}

export function useSchoolCtx(): SchoolApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSchoolCtx должен использоваться внутри SchoolProvider')
  return ctx
}
