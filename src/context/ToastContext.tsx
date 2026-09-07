import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cx, uid } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: string
  kind: ToastKind
  text: string
}

interface ToastApi {
  push: (text: string, kind?: ToastKind) => void
  success: (text: string) => void
  error: (text: string | unknown) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (text: string, kind: ToastKind = 'info') => {
      const id = uid('tst')
      setItems((prev) => [...prev.slice(-3), { id, kind, text }])
      setTimeout(() => remove(id), kind === 'error' ? 6000 : 3600)
    },
    [remove],
  )

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (t: string) => push(t, 'success'),
      error: (e: string | unknown) =>
        push(typeof e === 'string' ? e : e instanceof Error ? e.message : 'Что-то пошло не так', 'error'),
    }),
    [push],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {items.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertTriangle : Info
          return (
            <div
              key={t.id}
              role="status"
              className={cx(
                'pointer-events-auto flex animate-scale-in items-start gap-2.5 rounded-[18px] border px-4 py-3 shadow-pop backdrop-blur',
                t.kind === 'success' && 'border-[color:var(--cf-green-acc)]/30 bg-[color:var(--cf-green-bg)]',
                t.kind === 'error' && 'border-[color:var(--cf-red-acc)]/30 bg-[color:var(--cf-red-bg)]',
                t.kind === 'info' && 'border-line bg-surface',
              )}
            >
              <Icon
                size={17}
                className="mt-0.5 shrink-0"
                style={{
                  color:
                    t.kind === 'success'
                      ? 'var(--cf-green-acc)'
                      : t.kind === 'error'
                        ? 'var(--cf-red-acc)'
                        : 'var(--cf-blue-acc)',
                }}
              />
              <p className="flex-1 text-[13.5px] leading-snug text-ink">{t.text}</p>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 rounded-full p-0.5 text-ink-3 transition hover:text-ink"
                aria-label="Закрыть"
              >
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast должен использоваться внутри ToastProvider')
  return ctx
}
