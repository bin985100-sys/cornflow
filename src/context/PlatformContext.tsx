import { createContext, useContext, type ReactNode } from 'react'
import { usePlatform, type PlatformApi } from '@/hooks/usePlatform'

const Ctx = createContext<PlatformApi | null>(null)

export function PlatformProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={usePlatform()}>{children}</Ctx.Provider>
}

export function usePlatformCtx(): PlatformApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePlatformCtx должен использоваться внутри PlatformProvider')
  return ctx
}
