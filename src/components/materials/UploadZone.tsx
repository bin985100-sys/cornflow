import { useCallback, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, CloudUpload, File as FileIcon, X } from 'lucide-react'
import { db } from '@/lib/db'
import { MATERIAL_ICON } from '@/lib/icons'
import type { CardColor, UploadProgressItem } from '@/lib/types'
import { cardPalette, colorFromString, cx, detectType, formatBytes, uid } from '@/lib/utils'
import { useToast } from '@/context/ToastContext'
import { ProgressBar } from '@/components/ui/primitives'

interface UploaderOptions {
  spaceId: string | null
  folderId?: string | null
  tagIds?: string[]
  color?: CardColor
  onDone?: () => void
}

/** Загрузка файлов с прогресс-баром и созданием материалов. */
export function useUploader({ spaceId, folderId = null, tagIds = [], color, onDone }: UploaderOptions) {
  const [items, setItems] = useState<UploadProgressItem[]>([])
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const upload = useCallback(
    async (files: File[]) => {
      if (!spaceId) {
        toast.error('Сначала выберите пространство')
        return
      }
      if (!files.length) return

      const queued: UploadProgressItem[] = files.map((f) => ({
        id: uid('upl'),
        name: f.name,
        size: f.size,
        progress: 0,
        status: 'pending',
        previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      }))
      setItems((prev) => [...prev, ...queued])
      setBusy(true)

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const item = queued[i]
        setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: 'uploading' } : x)))
        try {
          const result = await db.uploadFile(spaceId, file, (pct) =>
            setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, progress: pct } : x))),
          )
          await db.createMaterial({
            space_id: spaceId,
            folder_id: folderId,
            title: file.name.replace(/\.[^.]+$/, ''),
            type: detectType(file),
            color: color ?? colorFromString(file.name),
            tagIds,
            ...result,
          })
          setItems((prev) =>
            prev.map((x) => (x.id === item.id ? { ...x, status: 'done', progress: 100 } : x)),
          )
        } catch (e) {
          setItems((prev) =>
            prev.map((x) =>
              x.id === item.id
                ? { ...x, status: 'error', error: e instanceof Error ? e.message : 'Ошибка загрузки' }
                : x,
            ),
          )
        }
      }

      setBusy(false)
      onDone?.()
      const ok = queued.length
      toast.success(ok === 1 ? 'Файл загружен' : `Загружено файлов: ${ok}`)
    },
    [spaceId, folderId, tagIds, color, onDone, toast],
  )

  const clear = useCallback(() => setItems([]), [])
  const remove = useCallback((id: string) => setItems((prev) => prev.filter((x) => x.id !== id)), [])

  return { items, busy, upload, clear, remove }
}

export function UploadZone({
  onFiles,
  compact = false,
  hint,
}: {
  onFiles: (files: File[]) => void
  compact?: boolean
  hint?: string
}) {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length) onFiles(files)
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      className={cx(
        'flex cursor-pointer flex-col items-center justify-center rounded-[26px] border-2 border-dashed text-center transition duration-200 ease-out',
        compact ? 'px-4 py-7' : 'px-6 py-11',
        over
          ? 'scale-[1.01] border-brand bg-brand-soft'
          : 'border-line bg-surface/60 hover:border-brand/50 hover:bg-surface',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) onFiles(files)
          e.target.value = ''
        }}
      />
      <span
        className={cx(
          'flex items-center justify-center rounded-2xl transition',
          compact ? 'h-10 w-10' : 'h-14 w-14',
        )}
        style={{ background: 'var(--cf-blue-bg)', color: 'var(--cf-blue-acc)' }}
      >
        <CloudUpload size={compact ? 20 : 26} />
      </span>
      <p className={cx('mt-3 font-semibold text-ink', compact ? 'text-[13.5px]' : 'text-[15px]')}>
        Перетащите файлы сюда
      </p>
      <p className="mt-1 text-[12.5px] text-ink-3">
        {hint ?? 'или нажмите, чтобы выбрать · PDF, презентации, видео, изображения, аудио'}
      </p>
    </div>
  )
}

export function UploadList({
  items,
  onRemove,
}: {
  items: UploadProgressItem[]
  onRemove?: (id: string) => void
}) {
  if (!items.length) return null
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const type = detectType({ name: it.name })
        const Icon = MATERIAL_ICON[type]
        const palette = cardPalette[colorFromString(it.name)]
        return (
          <li key={it.id} className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-2.5">
            {it.previewUrl ? (
              <img src={it.previewUrl} alt="" className="h-9 w-9 shrink-0 rounded-[10px] object-cover" />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                style={{ background: palette.bg, color: palette.accent }}
              >
                <Icon size={16} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[13px] font-medium text-ink">{it.name}</p>
                <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">{formatBytes(it.size)}</span>
              </div>
              <div className="mt-1.5">
                {it.status === 'error' ? (
                  <p className="flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--cf-red-acc)' }}>
                    <AlertCircle size={12} /> {it.error}
                  </p>
                ) : it.status === 'done' ? (
                  <p className="flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--cf-green-acc)' }}>
                    <CheckCircle2 size={12} /> Готово
                  </p>
                ) : (
                  <ProgressBar value={it.progress} />
                )}
              </div>
            </div>
            {onRemove && it.status !== 'uploading' && (
              <button
                className="shrink-0 text-ink-3 transition hover:text-ink"
                onClick={() => onRemove(it.id)}
                aria-label="Убрать"
              >
                <X size={14} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export { FileIcon }
