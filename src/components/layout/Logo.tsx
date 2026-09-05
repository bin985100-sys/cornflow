import { cx } from '@/lib/utils'

export function Logo({
  size = 'md',
  compact = false,
  tone = 'auto',
}: {
  size?: 'md' | 'lg'
  compact?: boolean
  /** 'light' — для тёмных и цветных фонов: белая подложка знака и белый текст */
  tone?: 'auto' | 'light'
}) {
  const box = size === 'lg' ? 40 : 32
  const light = tone === 'light'

  return (
    <div className="flex items-center gap-2.5">
      <svg width={box} height={box} viewBox="0 0 32 32" className="shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" fill={light ? '#FFFFFF' : 'var(--cf-blue-acc)'} />
        <path
          d="M16 6c3.6 0 6 2.7 6 7.2 0 5.2-2.6 9.4-6 12.8-3.4-3.4-6-7.6-6-12.8C10 8.7 12.4 6 16 6z"
          fill={light ? '#2356FD' : 'var(--cf-yellow-bg)'}
        />
        <path
          d="M16 8.6v14.2"
          stroke={light ? '#FFFFFF' : 'var(--cf-yellow-acc)'}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="13" cy="13" r="1.5" fill={light ? '#FFFFFF' : 'var(--cf-yellow-acc)'} />
        <circle cx="19" cy="16" r="1.5" fill={light ? '#FFFFFF' : 'var(--cf-yellow-acc)'} />
        <circle cx="13" cy="18.5" r="1.5" fill={light ? '#FFFFFF' : 'var(--cf-yellow-acc)'} />
      </svg>
      {!compact && (
        <span
          className={cx(
            'font-extrabold tracking-[-0.03em]',
            light ? 'text-white' : 'text-ink',
            size === 'lg' ? 'text-[24px]' : 'text-[19px]',
          )}
        >
          CornFlow
        </span>
      )}
    </div>
  )
}
