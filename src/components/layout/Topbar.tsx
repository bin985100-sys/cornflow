import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowDownWideNarrow,
  Bell,
  Command,
  Home,
  LayoutGrid,
  List,
  Menu as MenuIcon,
  Search,
  X,
} from 'lucide-react'
import { useApp, type SortMode } from '@/context/AppContext'
import { useCreate } from '@/context/CreateContext'
import { MATERIAL_ICON } from '@/lib/icons'
import { cardPalette, cx, dueLabel, excerpt, normalize, stripHtml } from '@/lib/utils'
import { Avatar, EventChip, Segmented, TagPill } from '@/components/ui/primitives'
import { Menu } from '@/components/ui/Menu'

const TITLES: Record<string, string> = {
  '/app': 'Дашборд',
  '/app/library': 'Все материалы',
  '/app/assignments': 'Задания',
  '/app/quizzes': 'Тесты',
  '/app/tasks': 'Задачи',
  '/app/calendar': 'Календарь',
  '/app/starred': 'Избранное',
  '/app/settings': 'Настройки',
  '/app/progress': 'Прогресс учеников',
}

export function Topbar() {
  const { space, query, setQuery, view, setView, sort, setSort, sidebarOpen, setSidebarOpen, allMaterials, allAssignments } =
    useApp()
  const create = useCreate()
  const location = useLocation()
  const navigate = useNavigate()

  const [focused, setFocused] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const sectionTitle = TITLES[location.pathname] ?? 'CornFlow'
  const showViewControls = ['/app', '/app/library', '/app/starred'].includes(location.pathname)

  /* Cmd/Ctrl+K — фокус в поиск */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  /* Мгновенная фильтрация по мере ввода: название, теги, описание, содержимое */
  const results = useMemo(() => {
    const q = normalize(query)
    if (q.length < 1) return []
    return allMaterials
      .filter((m) => {
        const haystack = [
          m.title,
          m.description ?? '',
          stripHtml(m.content),
          m.file_name ?? '',
          ...m.tags.map((t) => t.name),
        ]
          .map(normalize)
          .join(' ')
        return haystack.includes(q)
      })
      .slice(0, 8)
  }, [query, allMaterials])

  /* Уведомления: ближайшие и просроченные дедлайны */
  const notifications = useMemo(() => {
    return allAssignments
      .filter((a) => a.due_date)
      .map((a) => ({ a, due: dueLabel(a.due_date) }))
      .filter(({ due }) => due.tone !== 'ok')
      .slice(0, 6)
  }, [allAssignments])

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-xl lg:rounded-t-[26px]">
      <div className="flex h-[64px] items-center gap-3 px-4 lg:px-5">
        <button
          className={cx('cf-icon-btn', sidebarOpen && 'lg:hidden')}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? 'Свернуть боковую панель' : 'Развернуть боковую панель'}
          title={sidebarOpen ? 'Свернуть панель' : 'Развернуть панель'}
        >
          <MenuIcon size={17} />
        </button>

        {/* хлебные крошки */}
        <div className="hidden min-w-0 items-center gap-1.5 text-[13.5px] md:flex">
          {space && (
            <>
              <button
                onClick={() => navigate('/app/library')}
                className="max-w-[180px] truncate font-medium text-ink-3 transition hover:text-ink"
              >
                {space.name}
              </button>
              <span className="text-ink-3">/</span>
            </>
          )}
          <span className="truncate font-semibold text-ink">{sectionTitle}</span>
        </div>

        {/* центральная капсула поиска */}
        <div className="relative mx-auto w-full max-w-[520px]" ref={wrapRef}>
          <div
            className={cx(
              'flex items-center gap-2.5 rounded-pill border bg-canvas px-4 py-2.5 transition duration-200',
              focused
                ? 'border-brand bg-surface shadow-[0_0_0_4px_rgb(var(--cf-brand)/0.12)]'
                : 'border-line hover:border-brand/30',
            )}
          >
            <Search size={16} className="shrink-0 text-ink-3" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder="Поиск по материалам, тегам и конспектам…"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink-3 focus:outline-none"
            />
            {query ? (
              <button className="shrink-0 text-ink-3 transition hover:text-ink" onClick={() => setQuery('')}>
                <X size={15} />
              </button>
            ) : (
              <kbd className="hidden shrink-0 items-center gap-0.5 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-ink-3 sm:flex">
                <Command size={9} />K
              </kbd>
            )}
          </div>

          {/* выпадающие результаты */}
          {focused && query.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 animate-scale-in overflow-hidden rounded-[22px] border border-line bg-surface p-2 shadow-pop">
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-ink-3">
                  Ничего не найдено по запросу «{excerpt(query, 40)}»
                </p>
              ) : (
                <>
                  {results.map((m) => {
                    const Icon = MATERIAL_ICON[m.type]
                    const palette = cardPalette[m.color]
                    return (
                      <button
                        key={m.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          create.openMaterial(m)
                          setFocused(false)
                        }}
                        className="flex w-full items-center gap-3 rounded-pill px-2.5 py-2 text-left transition duration-200 hover:bg-surface-2"
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                          style={{ background: palette.bg, color: palette.accent }}
                        >
                          <Icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-ink">{m.title}</span>
                          <span className="block truncate text-[12px] text-ink-3">
                            {m.description || excerpt(stripHtml(m.content), 60) || m.file_name || '—'}
                          </span>
                        </span>
                        <span className="hidden shrink-0 gap-1 sm:flex">
                          {m.tags.slice(0, 2).map((t) => (
                            <TagPill key={t.id} tag={t} size="sm" />
                          ))}
                        </span>
                      </button>
                    )
                  })}
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      navigate('/app/library')
                      setFocused(false)
                    }}
                    className="mt-1 w-full rounded-pill px-3 py-2 text-center text-[12.5px] font-medium text-brand transition duration-200 hover:bg-brand-soft"
                  >
                    Показать все результаты в библиотеке
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* правые контролы */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="cf-icon-btn"
            onClick={() => navigate('/')}
            title="На главную страницу сайта"
            aria-label="На главную страницу сайта"
          >
            <Home size={16} />
          </button>

          {showViewControls && (
            <>
              <div className="hidden sm:block">
                <Segmented
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'grid', label: <LayoutGrid size={14} />, title: 'Сетка' },
                    { value: 'list', label: <List size={14} />, title: 'Список' },
                  ]}
                />
              </div>
              <Menu
                items={(
                  [
                    ['new', 'Сначала новые'],
                    ['old', 'Сначала старые'],
                    ['title', 'По названию'],
                    ['type', 'По типу'],
                  ] as Array<[SortMode, string]>
                ).map(([value, label]) => ({
                  label,
                  checked: sort === value,
                  onClick: () => setSort(value),
                }))}
                trigger={({ toggle }) => (
                  <button className="cf-icon-btn" onClick={toggle} title="Сортировка">
                    <ArrowDownWideNarrow size={16} />
                  </button>
                )}
              />
            </>
          )}

          <div className="relative">
            <button
              className="cf-icon-btn relative"
              onClick={() => setBellOpen((v) => !v)}
              title="Уведомления"
            >
              <Bell size={16} />
              {notifications.length > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9.5px] font-bold text-white"
                  style={{ background: 'var(--cf-red-acc)' }}
                >
                  {notifications.length}
                </span>
              )}
            </button>
            {bellOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-[320px] animate-scale-in overflow-hidden rounded-[22px] border border-line bg-surface p-2 shadow-pop">
                  <p className="px-2 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                    Ближайшие дедлайны
                  </p>
                  {notifications.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[13px] text-ink-3">Всё спокойно 🎉</p>
                  ) : (
                    notifications.map(({ a, due }) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setBellOpen(false)
                          create.openAssignment(a)
                        }}
                        className="flex w-full flex-col items-start gap-1.5 rounded-[16px] px-2.5 py-2 text-left transition duration-200 hover:bg-surface-2"
                      >
                        <span className="text-[13.5px] font-medium text-ink">{a.title}</span>
                        <EventChip icon={Bell} color={due.tone === 'late' ? 'red' : 'orange'}>
                          {due.text}
                        </EventChip>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {space && (
            <button
              onClick={create.share}
              className="hidden items-center -space-x-2 rounded-pill border border-line bg-surface py-1 pl-1 pr-3 transition duration-200 hover:border-brand/35 hover:shadow-[0_2px_10px_-6px_rgba(16,24,40,.35)] md:flex"
              title="Участники и приглашение"
            >
              {space.members.slice(0, 3).map((m) => (
                <Avatar key={m.id} name={m.name} src={m.avatar} size={24} />
              ))}
              <span className="pl-3 text-[12.5px] font-medium text-ink-2">{space.members.length}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
