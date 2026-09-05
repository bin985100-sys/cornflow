import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { Logo } from '@/components/layout/Logo'

/** Переход по ссылке-инвайту вида /join/MATH10 */
export function JoinPage() {
  const { code } = useParams<{ code: string }>()
  const { refreshSpaces, setSpaceId } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    let alive = true
    db.joinSpaceByCode(code)
      .then(async (space) => {
        if (!alive) return
        await refreshSpaces()
        setSpaceId(space.id)
        toast.success(`Вы присоединились к «${space.name}»`)
        navigate('/app/library', { replace: true })
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Не удалось присоединиться'))
    return () => {
      alive = false
    }
  }, [code, refreshSpaces, setSpaceId, toast, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-5 text-center">
      <Logo size="lg" />
      {error ? (
        <>
          <p className="text-[15px] font-semibold text-ink">{error}</p>
          <button className="cf-btn-brand" onClick={() => navigate('/app')}>
            На главную
          </button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-[14px] text-ink-3">
          <Loader2 size={16} className="animate-spin" /> Присоединяемся к пространству…
        </p>
      )}
    </div>
  )
}
