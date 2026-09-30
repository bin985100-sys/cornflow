import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { usePlatformCtx } from '@/context/PlatformContext'
import { Skeleton } from '@/components/ui/primitives'
import { PlatformLayout } from './PlatformLayout'

/**
 * Пускает в панель только того, кто есть в таблице platform_admins.
 * Роль нельзя выдать себе из интерфейса — только строкой в базе.
 */
export function PlatformGate() {
  const platform = usePlatformCtx()

  if (platform.loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (!platform.isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-6">
        <div className="cf-card max-w-md p-7 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#FDECEC] text-[#8E2226]">
            <ShieldAlert size={20} />
          </span>
          <h1 className="mt-4 text-[18px] font-semibold">Раздел недоступен</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
            Панель платформы открыта только главным администраторам сервиса. Роль
            выдаётся строкой в таблице <code>platform_admins</code> — из интерфейса
            её получить нельзя, и это сделано намеренно.
          </p>
          {platform.error && (
            <p className="mt-3 rounded-[12px] bg-surface-2 p-2.5 text-[12px] text-ink-3">{platform.error}</p>
          )}
          <Link to="/app" className="cf-btn-brand mt-5 inline-flex px-5">
            В приложение
          </Link>
        </div>
      </div>
    )
  }

  return <PlatformLayout />
}
