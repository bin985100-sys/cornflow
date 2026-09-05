import { useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FolderPlus,
  Folder as FolderIcon,
  Globe2,
  Home,
  LayoutGrid,
  ListChecks,
  LogOut,
  Moon,
  Plus,
  Settings,
  Star,
  Sun,
  UserPlus,
  Users,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useCreate } from '@/context/CreateContext'
import type { Folder } from '@/lib/types'
import { cardPalette, cx } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import { Avatar, AvatarStack } from '@/components/ui/primitives'
import { Menu } from '@/components/ui/Menu'
import { Logo } from './Logo'

export function Sidebar() {
  const { spaces, space, setSpaceId, folders, allMaterials, sidebarOpen, setSidebarOpen, canEdit, canManage, isOwner, spaceRoleLabel, online, showAssignments, showCalendar } =
    useApp()
  const { user, signOut, isTeacher } = useAuth()
  const create = useCreate()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const onlineTitle = online.length
    ? `Сейчас в курсе: ${online.map((p) => p.name).join(', ')}`
    : 'Пока никого нет в сети'
  const [spaceMenu, setSpaceMenu] = useState(false)

  const starred = useMemo(() => allMaterials.filter((m) => m.starred).slice(0, 6), [allMaterials])
  const rootFolders = useMemo(() => folders.filter((f) => !f.parent_id), [folders])

  return (
    <>
      {/* затемнение под мобильным сайдбаром */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 animate-fade-in bg-ink/25 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[272px] shrink-0 flex-col border-r border-line bg-surface transition-transform duration-300 ease-out',
          'lg:static lg:translate-x-0 lg:rounded-[26px] lg:border lg:shadow-card',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:hidden',
        )}
      >
        {/* -------------------------------- шапка ------------------------------ */}
        <div className="px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <button onClick={() => navigate('/app')} className="transition hover:opacity-80">
              <Logo />
            </button>
            <div className="flex items-center gap-1">
              <button
                className="cf-icon-btn"
                onClick={() => navigate('/')}
                aria-label="На главную страницу сайта"
                title="На главную страницу сайта"
              >
                <Home size={16} />
              </button>
              <button
                className="cf-icon-btn"
                onClick={() => setSidebarOpen(false)}
                aria-label="Свернуть боковую панель"
                title="Свернуть панель"
              >
                <ChevronRight size={16} className="rotate-180" />
              </button>
            </div>
          </div>

          <Menu
            width={260}
            align="left"
            items={[
              ...(canEdit
                ? [
                    { label: 'Загрузить файлы', icon: Plus, onClick: () => create.newMaterial() },
                    { label: 'Написать конспект', icon: ClipboardList, onClick: () => create.newMaterial({ kind: 'note' }) },
                    { label: 'Добавить ссылку', icon: LayoutGrid, onClick: () => create.newMaterial({ kind: 'link' }) },
                  ]
                : []),
              ...(canManage
                ? [
                    { label: 'Новая папка', icon: FolderPlus, onClick: () => create.newFolder(null) },
                    { label: 'Новое задание', icon: ClipboardList, onClick: () => create.newAssignment() },
                    { label: 'Новый тест', icon: ListChecks, onClick: () => navigate('/app/quizzes') },
                  ]
                : []),
              { label: '', separator: true },
              { label: 'Новое пространство', icon: Users, onClick: () => create.newSpace() },
              { label: 'Войти по коду', icon: UserPlus, onClick: () => create.joinSpace() },
            ]}
            trigger={({ toggle: t }) => (
              <button className="cf-btn-brand mt-4 w-full" onClick={t}>
                <Plus size={17} strokeWidth={2.6} />
                Создать
              </button>
            )}
          />
        </div>

        {/* --------------------------- переключатель пространств --------------- */}
        <div className="px-3">
          <button
            onClick={() => setSpaceMenu((v) => !v)}
            className="flex w-full items-center gap-2.5 rounded-pill border border-line bg-surface px-2.5 py-2 text-left transition duration-200 hover:border-brand/35 hover:shadow-[0_2px_10px_-6px_rgba(16,24,40,.35)]"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold"
              style={{
                background: cardPalette[space?.color ?? 'blue'].bg,
                color: cardPalette[space?.color ?? 'blue'].accent,
              }}
            >
              {space?.name.slice(0, 1).toUpperCase() ?? '·'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-ink">
                {space?.name ?? 'Нет пространств'}
              </span>
              <span className="block truncate text-[11.5px] text-ink-3">
                {space ? `${space.members.length} участник(ов)` : 'создайте первое'}
              </span>
            </span>
            <ChevronDown size={15} className={cx('shrink-0 text-ink-3 transition', spaceMenu && 'rotate-180')} />
          </button>

          {space && !spaceMenu && (
            <div className="mt-1.5 flex items-center justify-between px-3.5">
              <span className="flex items-center gap-1.5" title={onlineTitle}>
                <AvatarStack people={space.members} size={22} />
                {online.length > 1 && (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-2">
                    <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-[color:var(--cf-green-acc)]" />
                    {online.length} онлайн
                  </span>
                )}
              </span>
              <button
                onClick={create.share}
                className="rounded-pill px-2 py-1 text-[11.5px] font-medium text-brand transition duration-200 hover:bg-brand-soft"
              >
                {isOwner ? 'Настроить доступ' : 'Участники'}
              </button>
            </div>
          )}

          {space?.is_locked && (
            <p
              className="mt-2 rounded-soft px-3 py-2 text-[11.5px] leading-snug"
              style={{ background: 'var(--cf-red-soft, rgba(229,72,77,.1))', color: 'var(--cf-red-acc)' }}
            >
              Пространство закрыто: ученики не видят содержимое, пока вы не откроете его снова.
            </p>
          )}

          {spaceMenu && (
            <div className="mt-1.5 animate-scale-in space-y-0.5 rounded-[18px] border border-line bg-surface p-1.5 shadow-card">
              {spaces.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSpaceId(s.id)
                    setSpaceMenu(false)
                  }}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-pill px-2.5 py-2 text-left text-[13px] transition duration-200',
                    s.id === space?.id ? 'bg-brand-soft font-medium text-brand' : 'text-ink-2 hover:bg-surface-2',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: cardPalette[s.color].accent }}
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.id === space?.id && <Check size={14} className="text-brand" />}
                </button>
              ))}
              <div className="my-1 h-px bg-line" />
              <button
                onClick={() => {
                  setSpaceMenu(false)
                  create.newSpace()
                }}
                className="flex w-full items-center gap-2 rounded-pill px-2.5 py-2 text-[13px] text-ink-2 transition duration-200 hover:bg-surface-2"
              >
                <Plus size={14} /> Новое пространство
              </button>
              <button
                onClick={() => {
                  setSpaceMenu(false)
                  create.joinSpace()
                }}
                className="flex w-full items-center gap-2 rounded-pill px-2.5 py-2 text-[13px] text-ink-2 transition duration-200 hover:bg-surface-2"
              >
                <UserPlus size={14} /> Войти по коду
              </button>
            </div>
          )}
        </div>

        {/* -------------------------------- навигация -------------------------- */}
        <nav className="cf-stagger cf-no-scrollbar mt-3 flex-1 overflow-y-auto px-3 pb-4">
          <SidebarLink to="/app" icon={LayoutGrid} label="Дашборд" end />
          <SidebarLink to="/app/library" icon={FolderIcon} label="Все материалы" />
          {showAssignments && (
            <>
              <SidebarLink to="/app/assignments" icon={ClipboardList} label="Задания" />
              <SidebarLink to="/app/quizzes" icon={ListChecks} label="Тесты" />
            </>
          )}
          <SidebarLink to="/app/tasks" icon={CheckSquare} label="Задачи" />
          {showCalendar && <SidebarLink to="/app/calendar" icon={BarChart3} label="Календарь" />}
          {isOwner && <SidebarLink to="/app/progress" icon={Users} label="Прогресс учеников" />}

          {/* Избранное */}
          <SectionTitle
            title="Избранное"
            action={
              <NavLink to="/app/starred" className="text-[11px] font-medium text-brand hover:underline">
                все
              </NavLink>
            }
          />
          {starred.length === 0 ? (
            <p className="px-2.5 py-1 text-[12px] text-ink-3">Отметьте материал звёздочкой</p>
          ) : (
            <ul className="space-y-0.5">
              {starred.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => create.openMaterial(m)}
                    className="flex w-full items-center gap-2 rounded-pill px-3 py-2 text-left text-[13px] text-ink-2 transition duration-200 hover:bg-surface-2 hover:text-ink"
                  >
                    <Star size={13} className="shrink-0 fill-current" style={{ color: 'var(--cf-yellow-acc)' }} />
                    <span className="truncate">{m.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Папки */}
          <SectionTitle
            title="Папки"
            action={
              canEdit ? (
                <button
                  onClick={() => create.newFolder(null)}
                  className="text-ink-3 transition hover:text-ink"
                  aria-label="Новая папка"
                >
                  <Plus size={14} />
                </button>
              ) : undefined
            }
          />
          {rootFolders.length === 0 ? (
            <p className="px-2.5 py-1 text-[12px] text-ink-3">Пока нет папок</p>
          ) : (
            <ul className="space-y-0.5">
              {rootFolders.map((f) => (
                <FolderNode key={f.id} folder={f} all={folders} depth={0} />
              ))}
            </ul>
          )}
        </nav>

        {/* --------------------------------- профиль --------------------------- */}
        <div className="border-t border-line p-3">
          <Menu
            align="left"
            width={244}
            side="top"
            items={[
              { label: 'Настройки', icon: Settings, onClick: () => navigate('/app/settings') },
              {
                label: theme === 'dark' ? 'Светлая тема' : 'Тёмная тема',
                icon: theme === 'dark' ? Sun : Moon,
                onClick: toggle,
              },
              { label: '', separator: true },
              { label: 'На главную страницу', icon: Globe2, onClick: () => navigate('/') },
              {
                label: 'Выйти',
                icon: LogOut,
                danger: true,
                onClick: () => void signOut().then(() => navigate('/')),
              },
            ]}
            trigger={({ toggle: t }) => (
              <button
                onClick={t}
                className="flex w-full items-center gap-2.5 rounded-pill border border-transparent px-2.5 py-2 text-left transition duration-200 hover:border-line hover:bg-surface-2"
              >
                <Avatar name={user?.name ?? '?'} src={user?.avatar} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{user?.name}</span>
                  <span className="block truncate text-[11.5px] text-ink-3">
                    {space ? spaceRoleLabel : isTeacher ? 'Учитель' : 'Ученик'}
                  </span>
                </span>
                <Settings size={15} className="shrink-0 text-ink-3" />
              </button>
            )}
          />
        </div>
      </aside>
    </>
  )
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-1 mt-5 flex items-center justify-between px-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</span>
      {action}
    </div>
  )
}

function SidebarLink({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string
  icon: typeof LayoutGrid
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'group relative mb-0.5 flex items-center gap-2.5 overflow-hidden rounded-pill px-3 py-2.5 text-[13.5px] font-medium',
          'transition-[background-color,color,transform] duration-300 ease-out active:scale-[.98]',
          isActive
            ? 'bg-brand-soft text-brand'
            : 'text-ink-2 hover:translate-x-[2px] hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 animate-slide-left rounded-r-full bg-brand"
              aria-hidden
            />
          )}
          <Icon
            size={16.5}
            className={cx(
              'transition-[color,transform] duration-300 ease-out group-hover:scale-110',
              isActive ? 'scale-110 text-brand' : 'text-ink-3 group-hover:text-ink-2',
            )}
          />
          {label}
        </>
      )}
    </NavLink>
  )
}

function FolderNode({ folder, all, depth }: { folder: Folder; all: Folder[]; depth: number }) {
  const [open, setOpen] = useState(depth === 0)
  const children = all.filter((f) => f.parent_id === folder.id)
  const navigate = useNavigate()

  return (
    <li>
      <div
        className="group flex items-center gap-1 rounded-pill pr-1 transition duration-200 hover:bg-surface-2"
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className={cx('p-1 text-ink-3 transition', children.length === 0 && 'invisible')}
          aria-label={open ? 'Свернуть' : 'Развернуть'}
        >
          <ChevronRight size={13} className={cx('transition', open && 'rotate-90')} />
        </button>
        <button
          onClick={() => navigate(`/app/library?folder=${folder.id}`)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-[13px] text-ink-2 transition hover:text-ink"
        >
          <FolderIcon size={14} className="shrink-0" style={{ color: cardPalette[folder.color].accent }} />
          <span className="truncate">{folder.name}</span>
        </button>
      </div>
      {open && children.length > 0 && (
        <ul className="space-y-0.5">
          {children.map((c) => (
            <FolderNode key={c.id} folder={c} all={all} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
