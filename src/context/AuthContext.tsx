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
import { isOfflineError } from '@/lib/db/supabase-provider'
import type { SchoolSignInInput, SignInInput, SignUpInput } from '@/lib/db'
import type {User } from '@/lib/types'

interface AuthApi {
  user: User | null
  loading: boolean
  /** сервер не ответил на первый же запрос — показываем экран «нет связи» */
  offline: boolean
  /** повторить первичную проверку сессии */
  retry: () => void
  isTeacher: boolean
  signIn: (input: SignInInput) => Promise<void>
  /** Вход по школьному аккаунту: код школы, логин и выданный пароль */
  signInToSchool: ((input: SchoolSignInInput) => Promise<void>) | null
  signUp: (input: SignUpInput) => Promise<void>
  signOut: () => Promise<void>
  signInWithGoogle: ((redirectTo?: string) => Promise<void>) | null
  updateProfile: (patch: Partial<Pick<User, 'name' | 'avatar'>>) => Promise<void>
  /** Задать или сменить пароль; null — режим без паролей */
  setPassword: ((password: string) => Promise<void>) | null
}

const Ctx = createContext<AuthApi | null>(null)

/**
 * Сколько ждём ответа на первый запрос. Клиент Supabase сам не ставит таймаут:
 * если бэкенд не отвечает (проект на паузе, сбой сети), промис висит вечно —
 * и приложение застревает на сплэше. Лучше через 12 секунд честно сказать,
 * что связи нет, и дать кнопку «Повторить».
 */
const BOOT_TIMEOUT = 12_000

class OfflineError extends Error {}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    setLoading(true)
    setOffline(false)

    const withTimeout = new Promise<User | null>((resolve, reject) => {
      timer = window.setTimeout(() => reject(new OfflineError('timeout')), BOOT_TIMEOUT)
      db.getCurrentUser().then(resolve, reject)
    })

    withTimeout
      .then((u) => {
        if (!alive) return
        setUser(u)
        setOffline(false)
      })
      .catch((e) => {
        if (!alive) return
        setUser(null)
        // сеть молчит — это не «нет сессии», и вести на экран входа бессмысленно
        setOffline(e instanceof OfflineError || isOfflineError(e))
      })
      .finally(() => {
        window.clearTimeout(timer)
        if (alive) setLoading(false)
      })

    const off = db.onAuthChange((u) => {
      if (!alive) return
      setUser(u)
      if (u) setOffline(false)
    })
    return () => {
      alive = false
      window.clearTimeout(timer)
      off()
    }
  }, [attempt])

  const signIn = useCallback(async (input: SignInInput) => {
    setUser(await db.signIn(input))
  }, [])

  const signInToSchool = useCallback(async (input: SchoolSignInInput) => {
    if (!db.signInToSchool) throw new Error('Вход по школьному аккаунту недоступен')
    setUser(await db.signInToSchool(input))
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
      offline,
      retry,
      isTeacher: user?.role === 'teacher',
      signIn,
      signInToSchool: db.signInToSchool ? signInToSchool : null,
      signUp,
      signOut,
      updateProfile,
      setPassword: db.setPassword ? (password: string) => db.setPassword!(password) : null,
      signInWithGoogle: db.signInWithGoogle
        ? (redirectTo?: string) => db.signInWithGoogle!(redirectTo)
        : null,
    }),
    [user, loading, offline, retry, signIn, signInToSchool, signUp, signOut, updateProfile],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider')
  return ctx
}
