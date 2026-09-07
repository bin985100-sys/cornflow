import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

/**
 * Выпадающее меню. Панель рендерится порталом в <body> с фиксированными
 * координатами — поэтому её не обрезают карточки с overflow:hidden и не
 * перекрывают соседние элементы с трансформациями.
 */
export function Menu({
  trigger,
  items,
  align = 'right',
  width = 216,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const place = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const height = panelRef.current?.offsetHeight ?? Math.min(items.length * 38 + 16, 320)
    const gap = 8

    let left = align === 'right' ? rect.right - width : rect.left
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8)

    let top = rect.bottom + gap
    // не помещается снизу — раскрываем вверх
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - gap - height)
    }
    setPos({ left, top })
  }, [align, width, items.length])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    // закрываем при прокрутке любого контейнера — панель не «уплывает»
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, place])

  return (
    <>
      <div className="relative" ref={anchorRef}>
        {trigger({ open, toggle: () => setOpen((v) => !v) })}
      </div>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            className="fixed z-[60] animate-scale-in overflow-hidden rounded-[20px] border border-line bg-surface p-2 shadow-pop"
            style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
          >
            {items.map((item, i) =>
              item.separator ? (
                <div key={i} className="my-1.5 h-px bg-line" />
              ) : (
                <button
                  key={i}
                  role="menuitem"
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
          </div>,
          document.body,
        )}
    </>
  )
}
