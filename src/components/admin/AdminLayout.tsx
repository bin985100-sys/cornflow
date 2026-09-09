import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Building2,
  Check,
  Copy,
  GraduationCap,
  LayoutGrid,
  LogOut,
  Layers,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useSchoolCtx } from '@/context/SchoolContext'
import { Avatar } from '@/components/ui/primitives'
import { cx } from '@/lib/utils'

const NAV: Array<{ to: string; icon: LucideIcon; label: string; end?: boolean }> = [
  { to: '/admin', icon: LayoutGrid, label: 'Обзор', end: true },
  { to: '/admin/classes', icon: Layers, label: 'Классы' },
  { to: '/admin/students', icon: Users, label: 'Ученики' },
  { to: '/admin/teachers', icon: UserCog, label: 'Учителя' },
  { to: '/admin/subjects', icon: BookOpen, label: 'Предметы' },
  { to: '/admin/groups', icon: GraduationCap, label: 'Группы' },
  { to: '/admin/courses', icon: Building2, label: 'Курсы' },
  { to: '/admin/settings', icon: Settings, label: 'Настройки школы' },
]

/** Каркас панели: свой сайдбар, никакого пространства и журнала. */
export function AdminLayout() {
  const { user, signOut } = useAuth()
  const school = useSchoolCtx()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <div className="px-2">
          <span className="inline-flex items-center gap-2 rounded-pill border border-brand/25 bg-brand-soft px-2.5 py-1 text-[11.5px] font-semibold text-brand">
            <ShieldCheck size={13} /> Админ-панель
          </span>
          <h1 className="mt-3 truncate text-[16px] font-semibold">{school.school.name || 'Школа'}</h1>
          {school.school.code && (
            <button
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1 font-mono text-[12px] font-semibold transition-colors hover:bg-surface-2"
              title="Код школы — его вводят на экране «Войти в школу»"
              onClick={async () => {
                await navigator.clipboard.writeText(school.school.code)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {school.school.code}
            </button>
          )}
        </div>

        <nav className="cf-stagger mt-5 flex-1 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 rounded-[14px] px-3 py-2 text-[13.5px] transition-colors',
                  isActive ? 'bg-brand-soft font-medium text-brand' : 'text-ink-2 hover:bg-surface-2',
                )
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-3 border-t border-line pt-3">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Avatar name={user?.name ?? '?'} src={user?.avatar} size={28} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{user?.name}</p>
              <p className="truncate text-[11.5px] text-ink-3">Администратор</p>
            </div>
          </div>
          <NavLink
            to="/app"
            className="mt-1 flex items-center gap-2.5 rounded-[14px] px-3 py-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-2"
          >
            <LayoutGrid size={15} /> В приложение
          </NavLink>
          <button
            className="flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-2"
            onClick={async () => {
              await signOut()
              navigate('/admin/login', { replace: true })
            }}
          >
            <LogOut size={15} /> Выйти
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
        {/* мобильная навигация */}
        <div className="cf-no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 lg:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'cf-pill shrink-0 px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                  isActive ? 'border-brand/30 bg-brand-soft text-brand' : 'text-ink-2',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
