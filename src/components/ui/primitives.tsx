import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { CardColor, Tag as TagModel, TagColor } from '@/lib/types'
import { cardPalette, cx, initials, tagPalette } from '@/lib/utils'
import { iconByName } from '@/lib/icons'

/* --------------------------------- Аватар -------------------------------- */

const AVATAR_TONES: CardColor[] = ['blue', 'green', 'purple', 'yellow', 'red']

export function Avatar({
  name,
  src,
  size = 28,
  className,
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
}) {
  const tone = AVATAR_TONES[(name.charCodeAt(0) || 0) % AVATAR_TONES.length]
  const palette = cardPalette[tone]
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={cx('shrink-0 rounded-full object-cover ring-2 ring-surface', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      title={name}
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-2 ring-surface',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: palette.bg,
        color: palette.accent,
        fontSize: Math.max(10, size * 0.38),
      }}
    >
      {initials(name)}
    </span>
  )
}

export function AvatarStack({
  people,
  max = 4,
  size = 26,
}: {
  people: Array<{ id: string; name: string; avatar?: string | null }>
  max?: number
  size?: number
}) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <span key={p.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar name={p.name} src={p.avatar} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink-2 ring-2 ring-surface"
          style={{ width: size, height: size, marginLeft: -8 }}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}

/* ------------------------------ Тег-пилюля -------------------------------
   Ключевой элемент дизайна: полностью скруглённая капсула, тонированный фон,
   бордер и текст в цвет, слева цветная иконка в маленьком квадрате.
--------------------------------------------------------------------------- */

export function TagPill({
  tag,
  active,
  onClick,
  onRemove,
  size = 'md',
}: {
  tag: TagModel
  active?: boolean
  onClick?: () => void
  onRemove?: () => void
  size?: 'sm' | 'md'
}) {
  const palette = tagPalette[tag.color]
  const Icon = iconByName(tag.icon)
  const small = size === 'sm'
  const Comp = onClick ? 'button' : 'span'

  return (
    <Comp
      onClick={
        onClick
          ? (e: React.MouseEvent) => {
              e.stopPropagation()
              onClick()
            }
          : undefined
      }
      className={cx(
        'cf-pill transition',
        small ? 'px-2 py-[3px] text-[11px]' : 'px-2.5 py-[5px] text-[12px]',
        onClick && 'hover:brightness-[0.97] active:scale-95 cursor-pointer',
        active && 'ring-2',
      )}
      style={
        {
          background: palette.bg,
          borderColor: active ? palette.fg : `color-mix(in srgb, ${palette.fg} 30%, transparent)`,
          color: palette.fg,
          '--tw-ring-color': `color-mix(in srgb, ${palette.fg} 28%, transparent)`,
        } as CSSProperties
      }
    >
      <span
        className={cx(
          'inline-flex items-center justify-center rounded-[5px]',
          small ? 'h-[14px] w-[14px]' : 'h-[16px] w-[16px]',
        )}
        style={{ background: `color-mix(in srgb, ${palette.fg} 16%, transparent)` }}
      >
        <Icon size={small ? 9 : 10.5} strokeWidth={2.6} />
      </span>
      <span className="whitespace-nowrap font-medium">{tag.name}</span>
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          onKeyDown={(e) => e.key === 'Enter' && onRemove()}
          className="ml-0.5 opacity-55 transition hover:opacity-100"
          aria-label={`Убрать тег ${tag.name}`}
        >
          ✕
        </span>
      )}
    </Comp>
  )
}

/* ------------------------------ Чип события ------------------------------
   Компактная тонированная пилюля с цветной иконкой слева — используется
   в карточках заданий и в календаре (дата, повтор, время, участники…).
--------------------------------------------------------------------------- */

export function EventChip({
  icon: Icon,
  color = 'blue',
  children,
  title,
  className,
  compact = false,
}: {
  icon: LucideIcon
  color?: TagColor
  children: ReactNode
  title?: string
  className?: string
  compact?: boolean
}) {
  const palette = tagPalette[color]
  return (
    <span
      title={title}
      className={cx(
        'cf-pill whitespace-nowrap',
        compact ? 'gap-1 px-1.5 py-[3px] text-[10.5px]' : 'px-2.5 py-[5px] text-[12px]',
        className,
      )}
      style={{
        background: palette.bg,
        borderColor: `color-mix(in srgb, ${palette.fg} 26%, transparent)`,
        color: palette.fg,
      }}
    >
      <span
        className={cx(
          'inline-flex items-center justify-center rounded-full',
          compact ? 'h-[12px] w-[12px]' : 'h-[16px] w-[16px]',
        )}
        style={{ background: `color-mix(in srgb, ${palette.fg} 16%, transparent)` }}
      >
        <Icon size={compact ? 8 : 10.5} strokeWidth={2.6} />
      </span>
      {children}
    </span>
  )
}

/* -------------------------------- Скелетоны ------------------------------- */

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cx('cf-skeleton', className)} style={style} />
}

export function CardSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="cf-card overflow-hidden p-0 opacity-70">
          <Skeleton className="h-[7px] rounded-none" />
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-[10px]" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-20 rounded-pill" />
              <Skeleton className="h-5 w-16 rounded-pill" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="cf-card divide-y divide-line overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3.5">
          <Skeleton className="h-9 w-9 rounded-[10px]" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-24 rounded-pill" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

/* ------------------------------ Пустое состояние -------------------------- */

export function EmptyState({
  title,
  description,
  action,
  art = 'materials',
}: {
  title: string
  description?: string
  action?: ReactNode
  art?: 'materials' | 'search' | 'calendar' | 'tasks' | 'star'
}) {
  return (
    <div className="flex animate-fade-up flex-col items-center justify-center rounded-[26px] border border-dashed border-line bg-surface/70 px-6 py-16 text-center">
      <EmptyArt kind={art} />
      <h3 className="mt-5 text-[17px]">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[14px] text-ink-3">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

function EmptyArt({ kind }: { kind: 'materials' | 'search' | 'calendar' | 'tasks' | 'star' }) {
  const common = { width: 132, height: 100, fill: 'none' } as const
  if (kind === 'search') {
    return (
      <svg viewBox="0 0 132 100" {...common} aria-hidden>
        <rect x="18" y="20" width="66" height="60" rx="12" fill="var(--cf-blue-bg)" />
        <rect x="30" y="34" width="42" height="6" rx="3" fill="var(--cf-blue-acc)" opacity=".35" />
        <rect x="30" y="48" width="30" height="6" rx="3" fill="var(--cf-blue-acc)" opacity=".22" />
        <circle cx="88" cy="58" r="20" fill="var(--cf-yellow-bg)" stroke="var(--cf-yellow-acc)" strokeWidth="4" />
        <path d="M102 72l14 14" stroke="var(--cf-yellow-acc)" strokeWidth="6" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'calendar') {
    return (
      <svg viewBox="0 0 132 100" {...common} aria-hidden>
        <rect x="24" y="18" width="84" height="68" rx="14" fill="var(--cf-purple-bg)" />
        <rect x="24" y="18" width="84" height="18" rx="9" fill="var(--cf-purple-acc)" opacity=".28" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3].map((c) => (
            <rect
              key={`${r}-${c}`}
              x={34 + c * 18}
              y={46 + r * 14}
              width="12"
              height="8"
              rx="3"
              fill="var(--cf-purple-acc)"
              opacity={(r + c) % 3 === 0 ? '.5' : '.18'}
            />
          )),
        )}
      </svg>
    )
  }
  if (kind === 'tasks') {
    return (
      <svg viewBox="0 0 132 100" {...common} aria-hidden>
        <rect x="26" y="16" width="80" height="70" rx="14" fill="var(--cf-green-bg)" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x="38" y={32 + i * 18} width="14" height="14" rx="4" fill="var(--cf-green-acc)" opacity={i === 0 ? '1' : '.25'} />
            <rect x="58" y={37 + i * 18} width="36" height="5" rx="2.5" fill="var(--cf-green-acc)" opacity=".3" />
          </g>
        ))}
      </svg>
    )
  }
  if (kind === 'star') {
    return (
      <svg viewBox="0 0 132 100" {...common} aria-hidden>
        <rect x="26" y="20" width="80" height="62" rx="14" fill="var(--cf-yellow-bg)" />
        <path
          d="M66 34l6.6 13.4 14.8 2.1-10.7 10.4 2.5 14.7L66 67.7 52.8 74.6l2.5-14.7-10.7-10.4 14.8-2.1z"
          fill="var(--cf-yellow-acc)"
          opacity=".85"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 132 100" {...common} aria-hidden>
      <rect x="14" y="26" width="48" height="58" rx="12" fill="var(--cf-blue-bg)" />
      <rect x="14" y="26" width="48" height="9" rx="4.5" fill="var(--cf-blue-acc)" opacity=".5" />
      <rect x="52" y="14" width="48" height="58" rx="12" fill="var(--cf-red-bg)" transform="rotate(6 76 43)" />
      <rect x="52" y="14" width="48" height="9" rx="4.5" fill="var(--cf-red-acc)" opacity=".5" transform="rotate(6 76 18)" />
      <rect x="76" y="34" width="44" height="50" rx="12" fill="var(--cf-green-bg)" />
      <rect x="76" y="34" width="44" height="9" rx="4.5" fill="var(--cf-green-acc)" opacity=".5" />
    </svg>
  )
}

/* ------------------------------- Прогресс-бар ----------------------------- */

export function ProgressBar({ value, color = 'blue' }: { value: number; color?: CardColor }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-2">
      <div
        className="h-full rounded-pill transition-[width] duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: cardPalette[color].accent }}
      />
    </div>
  )
}

/* --------------------------------- Сегменты ------------------------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: ReactNode; title?: string }>
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-pill border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-pill font-medium transition duration-200 ease-out',
            size === 'sm' ? 'px-3 py-1.5 text-[12px]' : 'px-3.5 py-2 text-[13px]',
            value === o.value
              ? 'bg-brand text-white shadow-[0_4px_12px_-6px_rgb(var(--cf-brand))]'
              : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------ Цветовой выбор ---------------------------- */

export function ColorPicker({
  value,
  onChange,
}: {
  value: CardColor
  onChange: (c: CardColor) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {(Object.keys(cardPalette) as CardColor[]).map((c) => (
        <button
          key={c}
          type="button"
          title={cardPalette[c].label}
          onClick={() => onChange(c)}
          className={cx(
            'h-7 w-7 rounded-full border-2 transition active:scale-90',
            value === c ? 'scale-110' : 'border-transparent hover:scale-105',
          )}
          style={{
            background: cardPalette[c].bg,
            borderColor: value === c ? cardPalette[c].accent : 'transparent',
            boxShadow: `inset 0 0 0 3px ${cardPalette[c].accent}`,
          }}
        />
      ))}
    </div>
  )
}
