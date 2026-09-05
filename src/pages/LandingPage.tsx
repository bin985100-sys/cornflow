import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  CloudUpload,
  Eye,
  FolderTree,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Link2,
  Lock,
  Menu as MenuIcon,
  Moon,
  Notebook,
  PlayCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Tag as TagIcon,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { cx } from '@/lib/utils'
import { Logo } from '@/components/layout/Logo'
import { FolderCard } from '@/components/landing/FolderCard'
import { Reveal } from '@/components/landing/Reveal'
import { VideoPanel } from '@/components/landing/VideoPanel'

/* Лендинг живёт в собственной палитре — она не зависит от темы приложения,
   чтобы кадры из видео и заливки секций всегда совпадали. */
const BLUE = '#2356FD'
const INK = '#0B0C10'
const GREY = '#EFEFEF'

const NAV = [
  { href: '#product', label: 'Продукт' },
  { href: '#features', label: 'Возможности' },
  { href: '#how', label: 'Как это работает' },
  { href: '#roles', label: 'Роли' },
  { href: '#faq', label: 'Вопросы' },
]

export function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const primaryCta = user ? { to: '/app', label: 'Открыть приложение' } : { to: '/auth?mode=signup', label: 'Начать бесплатно' }

  return (
    // data-theme="light" — лендинг всегда светлый, даже если приложение в тёмной теме
    <div data-theme="light" className="min-h-screen bg-white" style={{ color: INK }}>
      {/* ============================= навигация ============================= */}
      <header
        className={cx(
          'fixed inset-x-0 top-0 z-50 transition-all duration-300',
          scrolled ? 'border-b border-black/[0.07] bg-white/85 backdrop-blur-xl' : 'border-b border-transparent',
        )}
      >
        <div className="mx-auto flex h-[68px] max-w-[1240px] items-center gap-6 px-5 lg:px-8">
          <Link to="/" className="shrink-0 transition hover:opacity-80">
            <Logo tone={scrolled ? 'auto' : 'light'} />
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cx(
                  'rounded-full px-3.5 py-2 text-[14px] font-medium transition',
                  scrolled ? 'text-black/65 hover:bg-black/[0.05] hover:text-black' : 'text-white/75 hover:bg-white/10 hover:text-white',
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to={user ? '/app' : '/auth'}
              className={cx(
                'hidden rounded-full px-4 py-2.5 text-[14px] font-semibold transition sm:block',
                scrolled ? 'text-black/70 hover:bg-black/[0.05]' : 'text-white/85 hover:bg-white/10',
              )}
            >
              {user ? 'Приложение' : 'Войти'}
            </Link>
            <Link
              to={primaryCta.to}
              className={cx(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full py-2.5 text-[13.5px] font-semibold transition active:scale-[.98] sm:text-[14px]',
                scrolled ? 'text-white hover:brightness-110' : 'bg-white text-[#0B0C10] hover:bg-white/90',
              )}
              style={scrolled ? { background: BLUE, paddingInline: 16 } : { paddingInline: 16 }}
            >
              <span className="sm:hidden">{user ? 'Приложение' : 'Начать'}</span>
              <span className="hidden sm:inline">{primaryCta.label}</span>
              <ArrowRight size={15} />
            </Link>
            <button
              className={cx(
                'ml-1 rounded-full p-2 transition lg:hidden',
                scrolled ? 'text-black/70 hover:bg-black/5' : 'text-white hover:bg-white/10',
              )}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Меню"
            >
              {menuOpen ? <X size={20} /> : <MenuIcon size={20} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-black/[0.07] bg-white px-5 py-3 lg:hidden">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-3 py-2.5 text-[15px] font-medium text-black/70 transition hover:bg-black/[0.04]"
              >
                {item.label}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* ================================ HERO ============================== */}
      <section
        className="relative flex min-h-[100svh] items-center overflow-hidden"
        style={{ background: '#05060A' }}
      >
        <VideoPanel
          src="/media/hands.mp4"
          poster="/media/hands-poster.jpg"
          objectPosition="center 45%"
          videoStyle={{ filter: 'brightness(1.35) contrast(1.06)', transform: 'scale(1.06)' }}
          overlay={{
            background:
              'linear-gradient(180deg, rgba(5,6,10,.55) 0%, rgba(5,6,10,.2) 45%, rgba(5,6,10,.78) 100%)',
          }}
        />

        {/* слева уводим кадр в глубину, чтобы текст читался на любом кадре */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(5,6,10,.9) 0%, rgba(5,6,10,.55) 42%, rgba(5,6,10,0) 80%)',
          }}
          aria-hidden
        />
        {/* фирменное синее свечение вокруг рук */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(55rem 34rem at 66% 52%, rgba(35,86,253,.4), transparent 60%)',
            mixBlendMode: 'screen',
          }}
          aria-hidden
        />

        <div className="relative mx-auto w-full max-w-[1240px] px-5 pb-24 pt-32 lg:px-8">
          <Reveal>
            <span className="inline-flex items-start gap-2 rounded-full border border-white/20 bg-white/[0.07] px-3.5 py-1.5 text-[11.5px] font-medium leading-snug text-white/90 backdrop-blur sm:items-center sm:text-[12.5px]">
              <Sparkles size={13} className="mt-[2px] shrink-0 text-[#7AA2FF] sm:mt-0" />
              Учебные материалы, которые наконец-то не теряются
            </span>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="mt-6 max-w-[15ch] text-[clamp(2.15rem,7vw,5.4rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-white">
              Всё&nbsp;для&nbsp;учёбы&nbsp;—
              <br />в одном потоке
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 max-w-[52ch] text-[clamp(1rem,1.6vw,1.22rem)] leading-relaxed text-white/75">
              CornFlow собирает конспекты, PDF, презентации, видео, ссылки и задания в одном
              пространстве. Цветные карточки, теги и мгновенный поиск — материал находится
              за секунду, а не за десять открытых вкладок.
            </p>
          </Reveal>

          <Reveal delay={230}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                onClick={() => navigate(user ? '/app' : '/auth?mode=signup')}
                className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-white transition hover:brightness-110 active:scale-[.98]"
                style={{ background: BLUE, boxShadow: '0 12px 34px -12px rgba(35,86,253,.9)' }}
              >
                {user ? 'Открыть приложение' : 'Создать пространство'}
                <ArrowRight size={17} />
              </button>
              <a
                href="#product"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-white/10"
              >
                <PlayCircle size={17} />
                Как это выглядит
              </a>
            </div>
          </Reveal>

          <Reveal delay={300}>
            <dl className="mt-16 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
              {[
                ['9', 'типов материалов'],
                ['2', 'роли с разными правами'],
                ['1', 'поиск по всему сразу'],
                ['0', 'потерянных файлов'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="text-[26px] font-extrabold leading-none text-white sm:text-[30px]">{value}</dt>
                  <dd className="mt-1.5 text-[12.5px] leading-snug text-white/55">{label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <a
          href="#product"
          className="absolute bottom-7 left-1/2 -translate-x-1/2 text-white/50 transition hover:text-white"
          aria-label="Листать вниз"
        >
          <ChevronDown size={26} className="animate-bounce" />
        </a>
      </section>

      {/* ============================== ПРОБЛЕМА ============================= */}
      <section id="product" className="relative overflow-hidden bg-white py-24 lg:py-32">
        <VideoPanel
          src="/media/bloom.mp4"
          poster="/media/bloom-poster.jpg"
          overlay={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,.94) 0%, rgba(255,255,255,.9) 50%, rgba(255,255,255,.96) 100%)',
          }}
        />
        <div className="relative mx-auto max-w-[1240px] px-5 lg:px-8">
          <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: BLUE }}>
                Проблема
              </p>
              <h2
              className="mt-4 text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]"
              style={{ color: INK }}
            >
                Материалы живут в пяти местах сразу
              </h2>
              <p className="mt-5 max-w-[50ch] text-[16px] leading-relaxed text-black/65">
                Презентация — в мессенджере, конспект — в тетради, ссылка на разбор — в закладках,
                дедлайн — в голове. Через месяц никто не помнит, где что лежит, а перед экзаменом
                половина материалов теряется окончательно.
              </p>
              <ul className="mt-8 space-y-3.5">
                {[
                  'Файлы пересылают заново каждому, кто пропустил урок',
                  'Никто не знает, открыл ли ученик материал',
                  'Дедлайны живут отдельно от заданий',
                  'Поиск заканчивается на «сейчас найду, подождите»',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-[15px] text-black/70">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#E5484D' }} />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={120}>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: BLUE }}>
                Решение
              </p>
              <h2
              className="mt-4 text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]"
              style={{ color: INK }}
            >
                Одно пространство на весь курс
              </h2>
              <p className="mt-5 max-w-[50ch] text-[16px] leading-relaxed text-black/65">
                Преподаватель создаёт пространство, наполняет его материалами и раздаёт доступ по коду.
                Ученики видят ту же библиотеку, календарь дедлайнов и свои задания — с любого устройства.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: FolderTree, t: 'Пространства и папки', d: 'Иерархия с вложенностью' },
                  { icon: TagIcon, t: 'Цветные теги', d: 'Фильтр в один клик' },
                  { icon: Search, t: 'Мгновенный поиск', d: 'Включая текст конспектов' },
                  { icon: CalendarDays, t: 'Календарь', d: 'Все дедлайны на виду' },
                ].map(({ icon: Icon, t, d }) => (
                  <div key={t} className="rounded-2xl border border-black/[0.07] bg-[#FAFAF9] p-4">
                    <Icon size={18} style={{ color: BLUE }} />
                    <p className="mt-2.5 text-[14px] font-semibold" style={{ color: INK }}>{t}</p>
                    <p className="mt-0.5 text-[12.5px] text-black/60">{d}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================ ВОЗМОЖНОСТИ =========================== */}
      <section id="features" className="py-24 lg:py-32" style={{ background: '#F7F7F5' }}>
        <div className="mx-auto max-w-[1240px] px-5 lg:px-8">
          <Reveal>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: BLUE }}>
              Возможности
            </p>
            <h2
              className="mt-4 max-w-[18ch] text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]"
              style={{ color: INK }}
            >
              Всё, что нужно курсу, и ничего лишнего
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 60} className="h-full">
                <FolderCard
                  icon={f.icon}
                  title={f.title}
                  text={f.text}
                  accent={f.accent}
                  deep={f.deep}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* =========================== КАК ЭТО РАБОТАЕТ ======================= */}
      <section id="how" className="relative overflow-hidden py-24 lg:py-32" style={{ background: GREY }}>
        <VideoPanel
          src="/media/halftone.mp4"
          poster="/media/halftone-poster.jpg"
          className="left-auto right-0 w-full lg:w-[46%]"
          overlay={{
            background: `linear-gradient(90deg, ${GREY} 0%, rgba(239,239,239,.72) 28%, rgba(239,239,239,.25) 100%)`,
          }}
        />

        <div className="relative mx-auto max-w-[1240px] px-5 lg:px-8">
          <Reveal>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: BLUE }}>
              Как это работает
            </p>
            <h2
              className="mt-4 max-w-[16ch] text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]"
              style={{ color: INK }}
            >
              Три шага от пустого экрана до курса
            </h2>
          </Reveal>

          <ol className="mt-12 max-w-[640px] space-y-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 90} as="li">
                <div className="flex gap-5 rounded-[20px] border border-black/[0.07] bg-white/85 p-5 backdrop-blur">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[16px] font-bold text-white"
                    style={{ background: BLUE }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-[17px] font-semibold" style={{ color: INK }}>{s.title}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-black/65">{s.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ================================ РОЛИ ============================== */}
      <section id="roles" className="relative overflow-hidden bg-white py-24 lg:py-32">
        <VideoPanel
          src="/media/petals.mp4"
          poster="/media/petals-poster.jpg"
          overlay={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,.95) 0%, rgba(255,255,255,.9) 45%, rgba(255,255,255,.97) 100%)',
          }}
        />
        <div className="relative mx-auto max-w-[1240px] px-5 lg:px-8">
          <Reveal>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: BLUE }}>
              Роли
            </p>
            <h2
              className="mt-4 max-w-[20ch] text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]"
              style={{ color: INK }}
            >
              Учитель ведёт курс. Ученик учится. Интерфейс подстраивается
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {ROLES.map((role, i) => (
              <Reveal key={role.title} delay={i * 110}>
                <div
                  className="h-full overflow-hidden rounded-[24px] border p-7"
                  style={{ background: role.bg, borderColor: `color-mix(in srgb, ${role.accent} 22%, transparent)` }}
                >
                  <span
                    className="inline-flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ background: `color-mix(in srgb, ${role.accent} 16%, transparent)`, color: role.accent }}
                  >
                    <role.icon size={23} />
                  </span>
                  <h3 className="mt-4 text-[22px] font-bold tracking-[-0.02em]" style={{ color: INK }}>{role.title}</h3>
                  <p className="mt-1.5 text-[14.5px] text-black/65">{role.subtitle}</p>
                  <ul className="mt-6 space-y-3">
                    {role.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-[14.5px] text-black/75">
                        <CheckCircle2 size={17} className="mt-[2px] shrink-0" style={{ color: role.accent }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* =========================== ПОИСК И ТЕГИ =========================== */}
      <section className="relative overflow-hidden py-24 lg:py-32" style={{ background: GREY }}>
        <VideoPanel
          src="/media/dots.mp4"
          poster="/media/dots-poster.jpg"
          overlay={{
            background:
              'linear-gradient(115deg, rgba(255,255,255,.97) 0%, rgba(255,255,255,.9) 38%, rgba(255,255,255,.66) 100%)',
          }}
        />

        <div className="relative mx-auto max-w-[1240px] px-5 lg:px-8">
          <div className="max-w-[620px] rounded-[28px] border border-black/[0.06] bg-white/80 p-8 backdrop-blur-md lg:p-10">
            <Reveal>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: BLUE }}>
                Поиск и теги
              </p>
              <h2
                className="mt-4 text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]"
                style={{ color: INK }}
              >
                Находится всё. Даже то, что внутри конспекта
              </h2>
              <p className="mt-5 text-[16px] leading-relaxed text-black/65">
                Глобальный поиск открывается по{' '}
                <kbd className="rounded-md border border-black/10 bg-black/[0.04] px-1.5 py-0.5 text-[13px]">⌘K</kbd>{' '}
                и фильтрует по мере ввода: название, описание, имя файла, теги и текст конспектов.
                Теги — цветные пилюли с иконками: клик по тегу мгновенно сужает библиотеку.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <div className="mt-8 flex flex-wrap gap-2">
                {TAG_DEMO.map((t) => (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium"
                    style={{ background: t.bg, borderColor: `color-mix(in srgb, ${t.fg} 30%, transparent)`, color: t.fg }}
                  >
                    <span
                      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[6px]"
                      style={{ background: `color-mix(in srgb, ${t.fg} 16%, transparent)` }}
                    >
                      <t.icon size={11} strokeWidth={2.6} />
                    </span>
                    {t.name}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================ БЕЗОПАСНОСТЬ ========================== */}
      <section className="relative overflow-hidden py-24 lg:py-32" style={{ background: INK, color: 'white' }}>
        <VideoPanel
          src="/media/globe.mp4"
          poster="/media/globe-poster.jpg"
          objectPosition="80% center"
          overlay={{
            background:
              'linear-gradient(90deg, rgba(11,12,16,.97) 0%, rgba(11,12,16,.88) 45%, rgba(11,12,16,.6) 100%)',
          }}
        />
        <div className="relative mx-auto max-w-[1240px] px-5 lg:px-8">
          <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
            <Reveal>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Данные и доступ
              </p>
              <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em] text-white">
                Ваши материалы остаются вашими
              </h2>
              <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-white/60">
                Каждое пространство изолировано: доступ выдаёт только владелец, а права
                разделены на просмотр и редактирование. Файлы лежат в приватном хранилище
                и отдаются по временным ссылкам.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <div className="grid gap-3 sm:grid-cols-2">
                {SECURITY.map(({ icon: Icon, t, d }) => (
                  <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                    <Icon size={19} className="text-white/80" />
                    <p className="mt-3 text-[15px] font-semibold text-white">{t}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-white/55">{d}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================================ FAQ =============================== */}
      <section id="faq" className="bg-white py-24 lg:py-32">
        <div className="mx-auto max-w-[820px] px-5 lg:px-8">
          <Reveal>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: BLUE }}>
              Вопросы
            </p>
            <h2
              className="mt-4 text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]"
              style={{ color: INK }}
            >
              Коротко о главном
            </h2>
          </Reveal>

          <div className="mt-10 divide-y divide-black/[0.08] border-y border-black/[0.08]">
            {FAQ.map((item, i) => (
              <Reveal key={item.q} delay={i * 50}>
                <details className="group py-5">
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16.5px] font-semibold"
                    style={{ color: INK }}
                  >
                    {item.q}
                    <ChevronDown
                      size={19}
                      className="shrink-0 text-black/40 transition group-open:rotate-180"
                    />
                  </summary>
                  <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-black/65">{item.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* =============================== CTA ================================ */}
      <section className="relative overflow-hidden" style={{ background: BLUE }}>
        <VideoPanel
          src="/media/burst.mp4"
          poster="/media/burst-poster.jpg"
          objectPosition="center"
          overlay={{
            background:
              'linear-gradient(180deg, rgba(35,86,253,.62) 0%, rgba(18,46,160,.86) 100%)',
          }}
        />
        <div className="relative mx-auto max-w-[1240px] px-5 py-28 text-center lg:px-8 lg:py-36">
          <Reveal>
            <h2 className="mx-auto max-w-[16ch] text-[clamp(2.1rem,4.6vw,3.6rem)] font-extrabold leading-[1.03] tracking-[-0.035em] text-white">
              Соберите свой курс за один вечер
            </h2>
            <p className="mx-auto mt-5 max-w-[52ch] text-[16.5px] leading-relaxed text-white/75">
              Регистрация по почте или через Google. Пространство создаётся сразу — остаётся
              перетащить в него первые файлы.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                to={user ? '/app' : '/auth?mode=signup'}
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-[15.5px] font-semibold text-[#0B0C10] transition hover:bg-white/90 active:scale-[.98]"
              >
                {user ? 'Открыть приложение' : 'Создать аккаунт'}
                <ArrowUpRight size={18} />
              </Link>
              {!user && (
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 px-7 py-4 text-[15.5px] font-semibold text-white transition hover:bg-white/10"
                >
                  У меня уже есть аккаунт
                </Link>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================== ФУТЕР =============================== */}
      <footer className="bg-white py-14">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <Logo />
            <p className="mt-3 max-w-[42ch] text-[13.5px] leading-relaxed text-black/60">
              Агрегатор учебных материалов для преподавателей и учеников.
              Конспекты, файлы, задания и дедлайны — в одном месте.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-7 gap-y-3 text-[13.5px] text-black/55">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-black">
                {item.label}
              </a>
            ))}
            <Link to="/auth" className="transition hover:text-black">
              Войти
            </Link>
          </nav>
        </div>
        <div className="mx-auto mt-10 max-w-[1240px] border-t border-black/[0.07] px-5 pt-6 text-[12.5px] text-black/40 lg:px-8">
          © {new Date().getFullYear()} CornFlow
        </div>
      </footer>
    </div>
  )
}

/* ------------------------------- контент ---------------------------------- */

const FEATURES = [
  {
    icon: LayoutGrid,
    title: 'Библиотека карточек',
    text: 'Сетка или список. Каждая карточка — материал или папка: цветная плашка, тип, превью текста, теги, автор и дата.',
    bg: '#EAF1FD',
    accent: '#3B7DE5',
    deep: '#1B4BA6',
  },
  {
    icon: CloudUpload,
    title: 'Загрузка перетаскиванием',
    text: 'Бросьте файлы в любое место окна. Несколько сразу, превью изображений, прогресс по каждому файлу.',
    bg: '#EAF6EE',
    accent: '#3A9E5D',
    deep: '#1D6A3D',
  },
  {
    icon: Notebook,
    title: 'Редактор конспектов',
    text: 'Заголовки, списки, чек-листы, выделение, цитаты и ссылки. Автосохранение — без кнопки «сохранить».',
    bg: '#FEF9E7',
    accent: '#E5A83D',
    deep: '#A96A11',
  },
  {
    icon: ClipboardList,
    title: 'Задания и сдачи',
    text: 'Дедлайн, описание, прикреплённые материалы. Ученик сдаёт работу с комментарием, преподаватель ставит оценку.',
    bg: '#FDECEC',
    accent: '#E5484D',
    deep: '#A3232A',
  },
  {
    icon: Eye,
    title: 'Встроенный просмотрщик',
    text: 'PDF, презентации, изображения, видео и аудио открываются прямо в приложении — скачивать необязательно.',
    bg: '#F1ECFD',
    accent: '#7B5EE5',
    deep: '#4931A6',
  },
  {
    icon: Star,
    title: 'Избранное и прогресс',
    text: 'Отмечайте важное звёздочкой и статусом «Изучено». Преподаватель видит, кто открыл материал.',
    bg: '#FEF9E7',
    accent: '#E5A83D',
    deep: '#A96A11',
  },
  {
    icon: CalendarDays,
    title: 'Календарь дедлайнов',
    text: 'Месяц и неделя, чипы событий, панель выбранного дня. Задания и личные задачи в одной сетке.',
    bg: '#EAF1FD',
    accent: '#3B7DE5',
    deep: '#1B4BA6',
  },
  {
    icon: KeyRound,
    title: 'Доступ по коду',
    text: 'Шестизначный код или ссылка-приглашение. Права выдаются отдельно: только просмотр или редактирование.',
    bg: '#EAF6EE',
    accent: '#3A9E5D',
    deep: '#1D6A3D',
  },
  {
    icon: Moon,
    title: 'Тёмная тема и адаптив',
    text: 'Работает на ноутбуке, планшете и телефоне. Светлая и тёмная темы переключаются одним тумблером.',
    bg: '#F1ECFD',
    accent: '#7B5EE5',
    deep: '#4931A6',
  },
]

const STEPS = [
  {
    title: 'Создайте пространство',
    text: 'Пространство — это курс или предмет. У него свой цвет, участники и код приглашения. Первое создаётся автоматически при регистрации.',
  },
  {
    title: 'Наполните материалами',
    text: 'Перетащите файлы, добавьте ссылки, напишите конспект прямо в редакторе. Разложите по папкам и разметьте тегами.',
  },
  {
    title: 'Пригласите учеников',
    text: 'Отправьте код или ссылку. Ученики увидят библиотеку, задания и календарь, а вы — кто что открыл и сдал.',
  },
]

const ROLES = [
  {
    icon: GraduationCap,
    title: 'Учитель',
    subtitle: 'Ведёт курс и видит картину целиком',
    accent: '#3B7DE5',
    deep: '#1B4BA6',
    bg: '#EAF1FD',
    items: [
      'Создаёт пространства и папки любой вложенности',
      'Загружает файлы, добавляет ссылки, пишет конспекты',
      'Ставит задания с дедлайнами и вложениями',
      'Выдаёт доступ по коду и управляет правами участников',
      'Видит прогресс: кто открыл материал и кто сдал работу',
      'Оценивает сданные работы',
    ],
  },
  {
    icon: Users,
    title: 'Ученик',
    subtitle: 'Учится, ничего не теряя',
    accent: '#7B5EE5',
    deep: '#4931A6',
    bg: '#F1ECFD',
    items: [
      'Присоединяется к пространству по коду или ссылке',
      'Смотрит и скачивает материалы, открывает их в приложении',
      'Добавляет важное в избранное и отмечает «Изучено»',
      'Видит календарь дедлайнов и список заданий',
      'Сдаёт работы с комментарием и вложениями',
      'Ведёт личные материалы и список задач',
    ],
  },
]

const TAG_DEMO = [
  { name: 'Лекция', bg: '#E7F0FF', fg: '#2563EB', icon: Notebook },
  { name: 'Практика', bg: '#E6F4EC', fg: '#1F9D57', icon: Zap },
  { name: 'Экзамен', bg: '#FDECEC', fg: '#E5484D', icon: GraduationCap },
  { name: 'Домашка', bg: '#FEEFE0', fg: '#EA7B1B', icon: ClipboardList },
  { name: 'Теория', bg: '#E8ECFB', fg: '#2A3B8F', icon: Search },
  { name: 'Видео', bg: '#E4F6F8', fg: '#1AA5B7', icon: PlayCircle },
  { name: 'Важное', bg: '#F0EAFE', fg: '#7C3AED', icon: Star },
]

const SECURITY = [
  {
    icon: Lock,
    t: 'Изоляция пространств',
    d: 'Материалы видны только участникам. Посторонний не получит их даже по прямой ссылке.',
  },
  {
    icon: ShieldCheck,
    t: 'Права на уровне строк',
    d: 'Политики доступа проверяются на стороне базы, а не только в интерфейсе.',
  },
  {
    icon: KeyRound,
    t: 'Вход по почте или Google',
    d: 'Сессия сохраняется между визитами, пароль хранится хешированным на стороне провайдера.',
  },
  {
    icon: Link2,
    t: 'Временные ссылки на файлы',
    d: 'Хранилище приватное: ссылка на файл подписывается и живёт ограниченное время.',
  },
]

const FAQ = [
  {
    q: 'Сколько стоит?',
    a: 'Приложение открыто и разворачивается на вашей инфраструктуре. Плата может возникнуть только за хостинг и за хранилище файлов, если вы выйдете за бесплатные лимиты выбранного провайдера.',
  },
  {
    q: 'Какие файлы можно загружать?',
    a: 'Любые: PDF, презентации, документы, изображения, видео и аудио. PDF, картинки, видео и аудио открываются прямо в приложении, остальное скачивается одним нажатием. Ссылки на внешние ресурсы и YouTube тоже становятся карточками.',
  },
  {
    q: 'Как ученик попадает в мой курс?',
    a: 'Вы отправляете ему шестизначный код или ссылку-приглашение. По коду он присоединяется к пространству с правом просмотра — при необходимости право можно поднять до редактирования.',
  },
  {
    q: 'Данные не потеряются?',
    a: 'Нет. При подключённом бэкенде всё хранится в базе PostgreSQL с резервным копированием провайдера, файлы — в объектном хранилище. В локальном режиме данные лежат в браузере, а в настройках есть выгрузка резервной копии одним файлом.',
  },
  {
    q: 'Можно ли работать с телефона?',
    a: 'Да. Интерфейс адаптивный: сайдбар сворачивается, карточки перестраиваются в одну колонку, загрузка и просмотр работают так же, как на десктопе.',
  },
  {
    q: 'Что видит преподаватель о прогрессе?',
    a: 'По каждому ученику — сколько материалов он открыл, сколько отметил как изученные и сколько заданий сдал. Плюс сводка по каждому заданию: кто сдал, кто нет, какие оценки выставлены.',
  },
]
