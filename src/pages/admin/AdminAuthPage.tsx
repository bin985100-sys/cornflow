import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { cx } from '@/lib/utils'

type Mode = 'signin' | 'signup'

/**
 * Отдельный вход в администраторскую панель.
 *
 * Аккаунт тот же самый, что и в приложении — разделены не учётные записи,
 * а двери: здесь нет ни Google, ни выбора роли, ни школьных логинов. Сюда
 * заходит тот, кто управляет школой.
 */
export function AdminAuthPage() {
  const { user, loading, signIn, signUp } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/admin" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'signin') await signIn({ email, password })
      else await signUp({ name, email, password, role: 'teacher' })
      navigate('/admin', { replace: true })
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[420px]">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-[13.5px] text-ink-3 hover:text-ink">
          ← На главную
        </Link>

        <div className="cf-card p-6">
          <span className="inline-flex items-center gap-2 rounded-pill border border-brand/25 bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand">
            <ShieldCheck size={14} /> Панель администратора
          </span>

          <h1 className="mt-4 text-[24px] font-bold tracking-[-0.02em]">
            {mode === 'signin' ? 'Вход в панель' : 'Регистрация администратора'}
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            {mode === 'signin'
              ? 'Управление школой: классы, ученики, учителя, предметы, группы и курсы'
              : 'После регистрации вы заведёте школу и станете её администратором'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === 'signup' && (
              <Field label="Имя и фамилия">
                <input
                  className="cf-input w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Анна Петрова"
                  required
                  autoComplete="name"
                />
              </Field>
            )}

            <Field label="Почта">
              <input
                className="cf-input w-full"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@school.ru"
                required
                autoComplete="email"
              />
            </Field>

            <Field label="Пароль">
              <input
                className="cf-input w-full"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </Field>

            <button
              className={cx(
                'mt-1 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand px-5 py-3',
                'text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[.98] disabled:opacity-60',
              )}
              disabled={busy}
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {mode === 'signin' ? 'Войти' : 'Создать аккаунт'}
              {!busy && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-ink-3">
            {mode === 'signin' ? 'Ещё нет доступа?' : 'Уже есть аккаунт?'}{' '}
            <button
              type="button"
              className="font-semibold text-brand hover:underline"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? 'Зарегистрироваться' : 'Войти'}
            </button>
          </p>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-[18px] border border-line bg-surface/70 p-3.5 text-[12.5px] leading-relaxed text-ink-3">
          <Building2 size={15} className="mt-[1px] shrink-0 text-brand" />
          <span>
            Ученикам и учителям сюда не нужно: они входят на{' '}
            <Link to="/auth" className="font-medium text-brand hover:underline">
              обычном экране входа
            </Link>{' '}
            кнопкой «Войти в школу» — по коду школы, логину и паролю, которые выдали вы.
          </span>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[12.5px] text-ink-2">{label}</span>
      {children}
    </div>
  )
}
