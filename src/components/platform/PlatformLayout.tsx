import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  KeyRound,
  LayoutGrid,
  LogOut,
  ScrollText,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { usePlatformCtx } from '@/context/PlatformContext'
import { Avatar } from '@/components/ui/primitives'
import { cx, plural } from '@/lib/utils'

const NAV: Array<{ to: string; icon: LucideIcon; label: string; end?: boolean }> = [
  { to: '/platform', icon: LayoutGrid, label: 'Обзор', end: true },
  { to: '/platform/schools', icon: Building2, label: 'Школы' },
  { to: '/platform/spaces', icon: LayoutGrid, label: 'Пространства' },
  { to: '/platform/people', icon: Users, label: 'Люди' },
  { to: '/platform/search', icon: Search, label: 'Поиск по содержимому' },
  { to: '/platform/incidents', icon: AlertTriangle, label: 'Инциденты' },
  { to: '/platform/audit', icon: ScrollText, label: 'Журнал действий' },
]

/** Каркас панели платформы. Намеренно не похож на школьную админку. */
export function PlatformLayout() {
  const { user, signOut } = useAuth()
  const platform = usePlatformCtx()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <div className="px-2">
          <span className="inline-flex items-center gap-2 rounded-pill border border-[#E5484D]/30 bg-[#FDECEC] px-2.5 py-1 text-[11.5px] font-semibold text-[#8E2226]">
            <ShieldAlert size={13} /> Платформа
          </span>
          <h1 className="mt-3 truncate text-[16px] font-semibold">CornFlow</h1>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {platform.overview
              ? `${plural(platform.overview.schools, 'школа', 'школы', 'школ')} · ` +
                `${plural(platform.overview.users, 'аккаунт', 'аккаунта', 'аккаунтов')}`
              : 'главный администратор'}
          </p>
        </div>

        <nav className="mt-5 flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-[13.5px] font-medium transition-colors',
                  isActive ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2',
                )
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-3 rounded-[14px] border border-line p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
            <KeyRound size={13} /> О паролях
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
            Пароли нигде не хранятся открытым текстом — в базе только хеш.
            Доступ восстанавливается сбросом. Любая правка данных отсюда
            попадает в журнал вместе со старым значением.
          </p>
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <div className="flex items-center gap-2.5 px-2">
            <Avatar name={user?.name ?? ''} src={user?.avatar ?? null} size={30} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{user?.name}</p>
              <p className="text-[11.5px] text-ink-3">Главный администратор</p>
            </div>
          </div>
          <NavLink
            to="/app"
            className="mt-2 flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-[13.5px] text-ink-2 transition-colors hover:bg-surface-2"
          >
            <LayoutGrid size={16} /> В приложение
          </NavLink>
          <button
            className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-[13.5px] text-ink-2 transition-colors hover:bg-surface-2"
            onClick={async () => {
              await signOut()
              navigate('/auth', { replace: true })
            }}
          >
            <LogOut size={16} /> Выйти
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-7">
        {/* мобильная навигация */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto lg:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'cf-pill shrink-0 px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                  isActive ? 'border-brand/30 bg-brand-soft text-brand' : 'text-ink-3',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <Outlet />
      </main>
    </div>
  )
}
