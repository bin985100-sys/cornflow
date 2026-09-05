import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  FolderTree,
  GraduationCap,
  Info,
  Loader2,
  Search,
  Users,
} from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { IS_MOCK } from '@/lib/db'
import type { Role } from '@/lib/types'
import { cx } from '@/lib/utils'
import { Logo } from '@/components/layout/Logo'
import { VideoPanel } from '@/components/landing/VideoPanel'

type Mode = 'signin' | 'signup'

export function AuthPage() {
  const { user, loading, signIn, signUp, signInWithGoogle } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const next = params.get('next') || '/app'
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [role, setRole] = useState<Role>('teacher')
  const [signInFailed, setSignInFailed] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleHint, setGoogleHint] = useState(false)

  if (!loading && user) return <Navigate to={next} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      setSignInFailed(false)
      if (mode === 'signin') await signIn({ email, password })
      else await signUp({ name, email, password, role })
      navigate(next, { replace: true })
    } catch (err) {
      if (mode === 'signin') setSignInFailed(true)
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    if (!signInWithGoogle) {
      setGoogleHint(true)
      return
    }
    try {
      // роль и вкладку, с которой уходим, запоминаем: через Google они иначе теряются
      db.rememberAuthMode?.(mode)
      if (mode === 'signup') db.rememberPendingRole?.(role)
      // возвращаем ровно туда, куда пользователь шёл (по умолчанию — в приложение)
      await signInWithGoogle(`${window.location.origin}${next.startsWith('/') ? next : '/app'}`)
    } catch (err) {
      toast.error(err)
    }
  }

  return (
    <div
      data-theme="light"
      className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[1.05fr_minmax(430px,0.95fr)]"
    >
      {/* ---------------------------- левая витрина ---------------------------- */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-11">
        <VideoPanel
          src="/media/hands.mp4"
          poster="/media/hands-poster.jpg"
          objectPosition="center 45%"
          videoStyle={{ filter: 'brightness(1.35) contrast(1.06)' }}
          overlay={{
            background:
              'linear-gradient(180deg, rgba(5,6,10,.62) 0%, rgba(5,6,10,.34) 45%, rgba(5,6,10,.88) 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(40rem 30rem at 70% 55%, rgba(35,86,253,.34), transparent 62%)',
          }}
          aria-hidden
        />

        <div className="relative">
          <Link to="/" className="inline-block transition hover:opacity-80">
            <Logo size="lg" tone="light" />
          </Link>
        </div>

        <div className="relative">
          <h1 className="max-w-[14ch] text-[clamp(2.2rem,3.6vw,3.4rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white">
            Всё для учёбы — в одном потоке
          </h1>
          <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-white/75">
            Конспекты, презентации, PDF, видео и ссылки складываются в цветные карточки,
            размечаются тегами и находятся за секунду.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[12.5px] font-medium text-white backdrop-blur">
              <FolderTree size={13} /> Пространства и папки
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[12.5px] font-medium text-white backdrop-blur">
              <Search size={13} /> Мгновенный поиск
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[12.5px] font-medium text-white backdrop-blur">
              <CalendarDays size={13} /> Дедлайны
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[12.5px] font-medium text-white backdrop-blur">
              <Users size={13} /> Доступ по коду
            </span>
          </div>
        </div>

        <p className="relative max-w-[52ch] text-[12.5px] leading-relaxed text-white/55">
          Аккаунт создаётся один раз: пространство, материалы, задания и прогресс сохраняются
          и доступны с любого устройства.
        </p>
      </aside>

      {/* ------------------------------- форма -------------------------------- */}
      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]">
          <Link
            to="/"
            className="mb-8 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-black/50 transition hover:text-black"
          >
            <ArrowLeft size={15} /> На главную
          </Link>

          <div className="lg:hidden">
            <Logo />
          </div>

          <h2 className="mt-6 text-[28px] font-bold tracking-[-0.02em] text-[#0B0C10] lg:mt-0">
            {mode === 'signin' ? 'С возвращением' : 'Создать аккаунт'}
          </h2>
          <p className="mt-1.5 text-[14px] text-black/50">
            {mode === 'signin'
              ? 'Войдите, чтобы вернуться к своим материалам'
              : 'Выберите роль — от неё зависит набор действий'}
          </p>

          {/* ---------------------------- Google ---------------------------- */}
          <button
            type="button"
            onClick={google}
            className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-full border border-black/[0.12] bg-white px-4 py-3 text-[14.5px] font-semibold text-[#0B0C10] transition hover:bg-black/[0.03] active:scale-[.98]"
          >
            <GoogleMark />
            Продолжить с Google
          </button>

          {googleHint && (
            <div className="mt-3 flex gap-2.5 rounded-2xl border border-black/[0.08] bg-[#F7F7F5] p-3.5 text-[12.5px] leading-relaxed text-black/60">
              <Info size={15} className="mt-[1px] shrink-0 text-[#3B7DE5]" />
              <span>
                Вход через Google работает после подключения проекта Supabase: добавьте
                <code className="mx-1 rounded bg-black/[0.06] px-1 py-0.5">VITE_SUPABASE_URL</code>
                и
                <code className="mx-1 rounded bg-black/[0.06] px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code>
                в <code className="rounded bg-black/[0.06] px-1 py-0.5">.env</code> и включите провайдер
                Google в разделе Authentication. Пока это не сделано, используйте регистрацию по почте —
                она работает полностью.
              </span>
            </div>
          )}

          <div className="my-6 flex items-center gap-3 text-[12px] text-black/35">
            <span className="h-px flex-1 bg-black/[0.09]" />
            или по почте
            <span className="h-px flex-1 bg-black/[0.09]" />
          </div>

          {/* ----------------------------- форма ---------------------------- */}
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    [
                      { value: 'teacher', label: 'Учитель', icon: GraduationCap, hint: 'Ведёт курс' },
                      { value: 'student', label: 'Ученик', icon: BookOpen, hint: 'Учится' },
                    ] as const
                  ).map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      className={cx(
                        'flex flex-col items-start gap-1 rounded-2xl border-2 p-3.5 text-left transition',
                        role === r.value
                          ? 'border-[#3B7DE5] bg-[#EAF1FD]'
                          : 'border-black/[0.09] bg-white hover:bg-black/[0.02]',
                      )}
                    >
                      <r.icon size={19} className={role === r.value ? 'text-[#3B7DE5]' : 'text-black/35'} />
                      <span className="text-[14px] font-semibold text-[#0B0C10]">{r.label}</span>
                      <span className="text-[11.5px] text-black/45">{r.hint}</span>
                    </button>
                  ))}
                </div>

                <Field label="Имя и фамилия">
                  <input
                    className="cf-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Анна Петрова"
                    required
                    autoComplete="name"
                  />
                </Field>
              </>
            )}

            <Field label="Почта">
              <input
                className="cf-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@school.ru"
                required
                autoComplete="email"
              />
            </Field>

            <Field label="Пароль">
              <input
                className="cf-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </Field>

            {signInFailed && mode === 'signin' && (
              <div className="animate-fade-up rounded-2xl border border-[#E5484D]/25 bg-[#FDECEC] p-3.5 text-[12.5px] leading-relaxed text-[#8E2226]">
                Войти не удалось. Такое бывает по трём причинам: аккаунта с этой почтой ещё нет —{' '}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => {
                    setMode('signup')
                    setSignInFailed(false)
                  }}
                >
                  создайте его
                </button>
                ; аккаунт заведён через Google — тогда войдите кнопкой выше, пароля у него нет;
                либо пароль введён с ошибкой.
              </div>
            )}

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[.98] disabled:opacity-60"
              style={{ background: '#2356FD' }}
              disabled={busy}
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {mode === 'signin' ? 'Войти' : 'Создать аккаунт'}
              {!busy && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="mt-6 text-center text-[13.5px] text-black/50">
            {mode === 'signin' ? 'Ещё нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
            <button
              className="font-semibold text-[#2356FD] hover:underline"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? 'Зарегистрироваться' : 'Войти'}
            </button>
          </p>

          {IS_MOCK && (
            <p className="mt-8 rounded-2xl border border-black/[0.08] bg-[#F7F7F5] p-3.5 text-[12px] leading-relaxed text-black/50">
              Локальный режим: аккаунт и материалы сохраняются в этом браузере и остаются на месте
              между визитами. Подключите Supabase, чтобы данные жили на сервере и открывались
              с любого устройства.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-black/60">{label}</span>
      {children}
    </label>
  )
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}
