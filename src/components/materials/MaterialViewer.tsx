import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileDown,
  Loader2,
  Pencil,
  Star,
} from 'lucide-react'
import { db } from '@/lib/db'
import type { MaterialView } from '@/lib/types'
import { MATERIAL_ICON } from '@/lib/icons'
import {
  MATERIAL_TYPE_LABEL,
  cardPalette,
  cx,
  download,
  formatBytes,
  formatDateFull,
  hostOf,
  isInlineViewable,
  mimeByName,
} from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { CommentThread } from '@/components/comments/CommentThread'
import { Avatar, TagPill } from '@/components/ui/primitives'
import { useToast } from '@/context/ToastContext'

/** Достаём id ролика YouTube, чтобы показывать видео внутри приложения. */
function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/)
  return m ? m[1] : null
}

export function MaterialViewer({
  material,
  open,
  onClose,
  canEdit,
  onEdit,
  onChanged,
}: {
  material: MaterialView | null
  open: boolean
  onClose: () => void
  canEdit: boolean
  onEdit: (m: MaterialView) => void
  onChanged: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!material || !open) return
    let alive = true
    setUrl(null)
    if (material.file_url) {
      setLoading(true)
      db.resolveFileUrl(material)
        .then((u) => alive && setUrl(u))
        .catch(() => alive && setUrl(null))
        .finally(() => alive && setLoading(false))
    }
    // отмечаем просмотр
    db.setProgress(material.id, 'viewed')
      .then(onChanged)
      .catch(() => undefined)
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material?.id, open])

  if (!material) return null

  const palette = cardPalette[material.color]
  const Icon = MATERIAL_ICON[material.type]

  async function toggleStar() {
    if (!material) return
    try {
      await db.toggleStar(material.id)
      onChanged()
    } catch (e) {
      toast.error(e)
    }
  }

  async function toggleStudied() {
    if (!material) return
    try {
      await db.setProgress(material.id, material.progress === 'studied' ? 'viewed' : 'studied')
      toast.success(material.progress === 'studied' ? 'Отметка снята' : 'Отмечено как изученное')
      onChanged()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={material.type === 'note' ? 'lg' : 'full'}
      title={
        <span className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[10px]"
            style={{ background: palette.bg, color: palette.accent }}
          >
            <Icon size={16} />
          </span>
          {material.title}
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {MATERIAL_TYPE_LABEL[material.type]}
          {material.file_size ? ` · ${formatBytes(material.file_size)}` : ''}
          {` · ${formatDateFull(material.created_at)}`}
          {material.author ? ` · ${material.author.name}` : ''}
        </span>
      }
      footer={
        <>
          <div className="mr-auto flex flex-wrap items-center gap-1.5">
            {material.tags.map((t) => (
              <TagPill key={t.id} tag={t} size="sm" />
            ))}
          </div>
          <button className="cf-btn-ghost" onClick={toggleStar}>
            <Star size={15} className={material.starred ? 'fill-current' : ''} />
            {material.starred ? 'В избранном' : 'В избранное'}
          </button>
          <button
            className={cx('cf-btn-ghost', material.progress === 'studied' && 'border-[color:var(--cf-green-acc)]')}
            onClick={toggleStudied}
          >
            <CheckCircle2
              size={15}
              style={material.progress === 'studied' ? { color: 'var(--cf-green-acc)' } : undefined}
            />
            Изучено
          </button>
          {url && material.type !== 'link' && (
            <>
              <a href={url} target="_blank" rel="noopener noreferrer" className="cf-btn-ghost">
                <ExternalLink size={15} /> Открыть
              </a>
              <button
                className="cf-btn-ghost"
                onClick={() => download(url, material.file_name ?? material.title)}
              >
                <Download size={15} /> Скачать
              </button>
            </>
          )}
          {canEdit && (
            <button className="cf-btn-brand" onClick={() => onEdit(material)}>
              <Pencil size={15} /> Редактировать
            </button>
          )}
        </>
      }
    >
      <Body material={material} url={url} loading={loading} />

      <div className="mx-auto mt-8 max-w-3xl border-t border-line pt-6">
        <CommentThread materialId={material.id} />
      </div>
    </Modal>
  )
}

function Body({
  material,
  url,
  loading,
}: {
  material: MaterialView
  url: string | null
  loading: boolean
}) {
  if (material.type === 'note') {
    return (
      <div className="cf-prose mx-auto max-w-3xl" dangerouslySetInnerHTML={{ __html: material.content ?? '' }} />
    )
  }

  if (material.type === 'link' && material.file_url) {
    const yt = youtubeId(material.file_url)
    if (yt) {
      return (
        <div className="mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-card border border-line">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${yt}`}
            title={material.title}
            allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )
    }
    return <LinkPreview url={material.file_url} description={material.description} />
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-ink-3">
        <Loader2 className="animate-spin" size={22} />
      </div>
    )
  }

  if (!url) {
    // Файл был, но не нашёлся: локальный режим хранит файлы в этом браузере
    const lost = !!material.file_url
    return (
      <div className="flex h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center">
        <span
          className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: 'var(--cf-yellow-bg)', color: 'var(--cf-yellow-acc)' }}
        >
          <AlertTriangle size={22} />
        </span>
        <p className="text-[15px] font-semibold text-ink">
          {lost ? 'Файл не найден в хранилище' : 'Материал без файла'}
        </p>
        <p className="max-w-md text-[13px] text-ink-3">
          {lost
            ? 'В локальном режиме файлы лежат в этом браузере: они не переносятся на другое устройство, ' +
              'теряются при очистке данных сайта и не восстанавливаются из JSON-копии. ' +
              'Загрузите файл заново через «Редактировать» — или подключите Supabase, тогда файлы будут на сервере.'
            : 'Это запись без вложения — добавьте файл через «Редактировать».'}
        </p>
      </div>
    )
  }

  if (material.type === 'image') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center rounded-card bg-surface-2/50 p-4">
        <img src={url} alt={material.title} className="max-h-[75vh] rounded-soft object-contain" />
      </div>
    )
  }

  if (material.type === 'video') {
    const yt = youtubeId(material.file_url ?? '')
    if (yt) {
      return (
        <div className="mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-card border border-line">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${yt}`}
            title={material.title}
            allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )
    }
    return (
      <video src={url} controls className="mx-auto max-h-[74vh] w-full rounded-card bg-black">
        Ваш браузер не поддерживает видео.
      </video>
    )
  }

  if (material.type === 'audio') {
    return (
      <div className="mx-auto max-w-xl rounded-card border border-line bg-surface-2/50 p-8">
        <audio src={url} controls className="w-full">
          Ваш браузер не поддерживает аудио.
        </audio>
      </div>
    )
  }

  // pdf, презентации, документы — встроенный просмотрщик браузера
  return <DocumentView material={material} url={url} />
}

/**
 * PDF и офисные файлы. Встроенный просмотрщик есть не везде: iOS Safari и часть
 * мобильных браузеров не рисуют PDF внутри страницы, офисные форматы не умеет
 * никто. Поэтому — <object> с честным запасным вариантом: открыть или скачать.
 */
function DocumentView({ material, url }: { material: MaterialView; url: string }) {
  const [failed, setFailed] = useState(false)
  const mime = material.mime_type || mimeByName(material.file_name ?? material.title)
  const inline = isInlineViewable(mime)

  if (!inline || failed) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-card border border-line bg-surface-2/40 p-10 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: 'var(--cf-blue-bg)', color: 'var(--cf-blue-acc)' }}
        >
          <FileDown size={24} />
        </span>
        <p className="mt-4 text-[16px] font-semibold text-ink">
          {material.file_name ?? material.title}
        </p>
        <p className="mt-1.5 text-[13.5px] text-ink-3">
          Этот формат браузер не показывает внутри страницы
          {material.file_size ? ` · ${formatBytes(material.file_size)}` : ''}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="cf-btn-brand">
            Открыть в новой вкладке <ExternalLink size={15} />
          </a>
          <button
            className="cf-btn-ghost"
            onClick={() => download(url, material.file_name ?? material.title)}
          >
            <Download size={15} /> Скачать
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <object
        data={url}
        type={mime}
        title={material.title}
        className="h-[70vh] w-full rounded-card border border-line bg-surface-2"
        onError={() => setFailed(true)}
      >
        <iframe
          src={url}
          title={material.title}
          className="h-[70vh] w-full rounded-card border border-line bg-surface-2"
        />
      </object>
      <p className="text-center text-[12px] text-ink-3">
        Не отображается?{' '}
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
          Открыть в новой вкладке
        </a>
      </p>
    </div>
  )
}

function LinkPreview({ url, description }: { url: string; description?: string | null }) {
  return (
    <div className="mx-auto max-w-xl rounded-card border border-line bg-surface-2/40 p-8 text-center">
      <span
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'var(--cf-blue-bg)', color: 'var(--cf-blue-acc)' }}
      >
        <ExternalLink size={24} />
      </span>
      <p className="mt-4 text-[16px] font-semibold text-ink">{hostOf(url)}</p>
      {description && <p className="mt-1.5 text-[13.5px] text-ink-3">{description}</p>}
      <p className="mt-2 break-all text-[12px] text-ink-3">{url}</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="cf-btn-brand mt-5">
        Открыть ссылку <ExternalLink size={15} />
      </a>
    </div>
  )
}

export { Avatar }
