import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx } from '@/lib/utils'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onClick?: () => void
  danger?: boolean
  checked?: boolean
  separator?: boolean
}

export function Menu({
  trigger,
  items,
  align = 'right',
  width = 216,
  side = 'auto',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  width?: number
  /** куда раскрывать список: вниз, вверх или автоматически по месту на экране */
  side?: 'bottom' | 'top' | 'auto'
}) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(side === 'top')
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /* Меню у нижнего края окна раскрываем вверх, иначе его не видно */
  useLayoutEffect(() => {
    if (!open) return
    if (side !== 'auto') {
      setDropUp(side === 'top')
      return
    }
    const trigger = ref.current?.getBoundingClientRect()
    const list = listRef.current?.getBoundingClientRect()
    if (!trigger) return
    const needed = (list?.height ?? 240) + 16
    const below = window.innerHeight - trigger.bottom
    const above = trigger.top
    setDropUp(below < needed && above > below)
  }, [open, side, items.length])

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          ref={listRef}
          className={cx(
            'absolute z-40 max-h-[70vh] animate-scale-in overflow-y-auto overscroll-contain rounded-[20px] border border-line bg-surface p-2 shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
            dropUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top',
          )}
          style={{ width }}
        >
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} className="my-1.5 h-px bg-line" />
            ) : (
              <button
                key={i}
                onClick={() => {
                  setOpen(false)
                  item.onClick?.()
                }}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-pill px-3 py-2 text-left text-[13.5px] transition duration-200',
                  item.danger
                    ? 'text-[color:var(--cf-red-acc)] hover:bg-[color:var(--cf-red-bg)]'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                {item.icon && <item.icon size={15.5} className="shrink-0" />}
                <span className="flex-1 truncate">{item.label}</span>
                {item.checked && <span className="text-brand">✓</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
