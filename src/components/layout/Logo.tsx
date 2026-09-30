import { cx } from '@/lib/utils'

/**
 * Знак CornFlow: колонна и раскрытая книга. Без подложки — фон всегда виден
 * насквозь. Рисунок в двух вариантах, потому что одним цветом он не читается
 * на обоих фонах: на тёмном — исходный розово-кремовый, на светлом — тот же
 * рисунок в тёмно-сливовом, иначе кремовые части сливаются с белым.
 */
export function Logo({
  size = 'md',
  compact = false,
  tone = 'auto',
}: {
  size?: 'md' | 'lg'
  compact?: boolean
  /** 'light' — знак и текст для тёмных и цветных фонов */
  tone?: 'auto' | 'light'
}) {
  const box = size === 'lg' ? 40 : 32
  const light = tone === 'light'

  return (
    <div className="flex items-center gap-2.5">
      <span
        className="relative shrink-0"
        style={{ width: box, height: box }}
        aria-hidden
      >
        {/* на цветном фоне вариант один; в приложении — по теме */}
        <img
          src="/logo-mark.png"
          alt=""
          width={box}
          height={box}
          draggable={false}
          className={cx(
            'absolute inset-0 h-full w-full select-none object-contain',
            light ? 'block' : 'hidden dark:block',
          )}
        />
        {!light && (
          <img
            src="/logo-mark-light.png"
            alt=""
            width={box}
            height={box}
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-contain dark:hidden"
          />
        )}
      </span>
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
