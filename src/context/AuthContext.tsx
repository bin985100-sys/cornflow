import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { db } from '@/lib/db'
import type { SignInInput, SignUpInput } from '@/lib/db'
import type {User } from '@/lib/types'

interface AuthApi {
  user: User | null
  loading: boolean
  isTeacher: boolean
  signIn: (input: SignInInput) => Promise<void>
  signUp: (input: SignUpInput) => Promise<void>
  signOut: () => Promise<void>
  signInWithGoogle: ((redirectTo?: string) => Promise<void>) | null
  updateProfile: (patch: Partial<Pick<User, 'name' | 'avatar'>>) => Promise<void>
  /** Задать или сменить пароль; null — режим без паролей */
  setPassword: ((password: string) => Promise<void>) | null
}

const Ctx = createContext<AuthApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    db.getCurrentUser()
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false))

    const off = db.onAuthChange((u) => alive && setUser(u))
    return () => {
      alive = false
      off()
    }
  }, [])

  const signIn = useCallback(async (input: SignInInput) => {
    setUser(await db.signIn(input))
  }, [])

  const signUp = useCallback(async (input: SignUpInput) => {
    setUser(await db.signUp(input))
  }, [])

  const signOut = useCallback(async () => {
    await db.signOut()
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (patch: Partial<Pick<User, 'name' | 'avatar'>>) => {
    setUser(await db.updateProfile(patch))
  }, [])

  const value = useMemo<AuthApi>(
    () => ({
      user,
      loading,
      isTeacher: user?.role === 'teacher',
      signIn,
      signUp,
      signOut,
      updateProfile,
      setPassword: db.setPassword ? (password: string) => db.setPassword!(password) : null,
      signInWithGoogle: db.signInWithGoogle
        ? (redirectTo?: string) => db.signInWithGoogle!(redirectTo)
        : null,
    }),
    [user, loading, signIn, signUp, signOut, updateProfile],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider')
  return ctx
}
