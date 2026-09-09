import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Loader2, Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

/** Первый шаг администратора: школы ещё нет — заводим. */
export function AdminSetupPage({ onCreated }: { onCreated: () => Promise<void> }) {
  const toast = useToast()
  const { user, signOut } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await db.createSchool(name)
      await onCreated()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="cf-card p-6">
          <Building2 size={22} className="text-brand" />
          <h1 className="mt-3 text-[22px] font-bold tracking-[-0.02em]">Заведите школу</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            Школа — это уровень над пространствами: параллели и классы, ученики и учителя,
            предметы, группы и курсы. Создатель становится администратором.
          </p>

          <div className="mt-5">
            <span className="mb-1 block text-[12.5px] text-ink-2">Название школы</span>
            <div className="flex flex-wrap gap-2">
              <input
                className="cf-input min-w-[180px] flex-1"
                placeholder="Школа №5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void create()}
                autoFocus
              />
              <button className="cf-btn-brand px-4" disabled={busy || !name.trim()} onClick={() => void create()}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Создать
              </button>
            </div>
          </div>

          <p className="mt-4 text-[12px] text-ink-3">
            Вы вошли как {user?.name} ({user?.email}).{' '}
            <button className="font-medium text-brand hover:underline" onClick={() => void signOut()}>
              Выйти
            </button>{' '}
            ·{' '}
            <Link to="/app" className="font-medium text-brand hover:underline">
              В приложение
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
