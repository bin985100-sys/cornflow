import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, Link2, Loader2, Notebook } from 'lucide-react'
import { db } from '@/lib/db'
import type { CardColor, MaterialView } from '@/lib/types'
import { colorFromString, cx, isExternalUrl } from '@/lib/utils'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { ColorPicker } from '@/components/ui/primitives'
import { NoteEditor } from '@/components/materials/NoteEditor'
import { TagSelector } from '@/components/materials/TagSelector'
import { UploadList, UploadZone, useUploader } from '@/components/materials/UploadZone'

export type MaterialKind = 'file' | 'link' | 'note'

export function MaterialModal({
  open,
  onClose,
  kind: initialKind,
  folderId,
  editing,
  initialFiles,
}: {
  open: boolean
  onClose: () => void
  kind: MaterialKind
  folderId: string | null
  editing: MaterialView | null
  initialFiles?: File[]
}) {
  const { space, folders, tags, refresh } = useApp()
  const { user } = useAuth()
  const toast = useToast()

  const [kind, setKind] = useState<MaterialKind>(initialKind)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [color, setColor] = useState<CardColor>('blue')
  const [folder, setFolder] = useState<string | null>(folderId)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [coEditor, setCoEditor] = useState<string | null>(null)
  const noteChannel = useRef<{ send: (html: string) => void; leave: () => void } | null>(null)
  const coTimer = useRef<number | undefined>(undefined)

  const uploader = useUploader({
    spaceId: space?.id ?? null,
    folderId: folder,
    tagIds,
    onDone: () => {
      refresh().catch(() => undefined)
    },
  })

  /* Инициализация при открытии */
  useEffect(() => {
    if (!open) return
    setKind(editing ? (editing.type === 'note' ? 'note' : editing.type === 'link' ? 'link' : 'file') : initialKind)
    setTitle(editing?.title ?? '')
    setDescription(editing?.description ?? '')
    setUrl(editing?.type === 'link' ? (editing.file_url ?? '') : '')
    setContent(editing?.content ?? '')
    setColor(editing?.color ?? 'blue')
    setFolder(editing?.folder_id ?? folderId)
    setTagIds(editing?.tags.map((t) => t.id) ?? [])
    uploader.clear()
    if (initialFiles?.length) void uploader.upload(initialFiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  const folderOptions = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]))
    const path = (id: string): string => {
      const f = byId.get(id)
      if (!f) return ''
      return f.parent_id ? `${path(f.parent_id)} / ${f.name}` : f.name
    }
    return folders.map((f) => ({ id: f.id, label: path(f.id) })).sort((a, b) => a.label.localeCompare(b.label, 'ru'))
  }, [folders])

  /* Совместное редактирование конспекта: текст соавтора приходит сразу */
  useEffect(() => {
    if (!open || kind !== 'note' || !editing || !user || !db.joinNoteChannel) return
    const channel = db.joinNoteChannel(editing.id, { id: user.id, name: user.name }, (payload) => {
      setContent(payload.html)
      setCoEditor(payload.byName)
      window.clearTimeout(coTimer.current)
      coTimer.current = window.setTimeout(() => setCoEditor(null), 3000)
    })
    noteChannel.current = channel
    return () => {
      channel.leave()
      noteChannel.current = null
      setCoEditor(null)
    }
  }, [open, kind, editing, user])

  async function save() {
    if (!space) return
    setBusy(true)
    try {
      if (editing) {
        await db.updateMaterial(editing.id, {
          title: title.trim() || editing.title,
          description: description.trim() || null,
          content: kind === 'note' ? content : editing.content,
          file_url: kind === 'link' ? url.trim() : editing.file_url,
          color,
          folder_id: folder,
          tagIds,
        })
        toast.success('Материал обновлён')
      } else if (kind === 'note') {
        await db.createMaterial({
          space_id: space.id,
          folder_id: folder,
          title: title.trim() || 'Новый конспект',
          description: description.trim() || null,
          type: 'note',
          content,
          color,
          tagIds,
        })
        toast.success('Конспект создан')
      } else if (kind === 'link') {
        if (!isExternalUrl(url)) throw new Error('Введите корректную ссылку, начинающуюся с http(s)://')
        await db.createMaterial({
          space_id: space.id,
          folder_id: folder,
          title: title.trim() || url,
          description: description.trim() || null,
          type: 'link',
          file_url: url.trim(),
          color: color ?? colorFromString(url),
          tagIds,
        })
        toast.success('Ссылка добавлена')
      } else {
        // Файлы уже созданы загрузчиком; здесь просто закрываем
        if (!uploader.items.length) throw new Error('Добавьте хотя бы один файл')
      }
      await refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  const kinds: Array<{ value: MaterialKind; label: string; icon: typeof FileUp }> = [
    { value: 'file', label: 'Файлы', icon: FileUp },
    { value: 'note', label: 'Конспект', icon: Notebook },
    { value: 'link', label: 'Ссылка', icon: Link2 },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={kind === 'note' ? 'lg' : 'md'}
      title={editing ? 'Редактировать материал' : 'Новый материал'}
      subtitle={space?.name}
      footer={
        <>
          <button className="cf-btn-ghost" onClick={onClose}>
            {kind === 'file' && !editing ? 'Готово' : 'Отмена'}
          </button>
          {(kind !== 'file' || editing) && (
            <button className="cf-btn-brand" onClick={save} disabled={busy}>
              {busy && <Loader2 size={15} className="animate-spin" />}
              {editing ? 'Сохранить' : 'Создать'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!editing && (
          <div className="grid grid-cols-3 gap-2">
            {kinds.map((k) => (
              <button
                key={k.value}
                onClick={() => setKind(k.value)}
                className={cx(
                  'flex items-center justify-center gap-2 rounded-soft border-2 px-3 py-2.5 text-[13.5px] font-medium transition',
                  kind === k.value ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-2 hover:bg-surface-2',
                )}
              >
                <k.icon size={16} /> {k.label}
              </button>
            ))}
          </div>
        )}

        {kind === 'file' && !editing && (
          <>
            <UploadZone onFiles={(files) => void uploader.upload(files)} />
            <UploadList items={uploader.items} onRemove={uploader.remove} />
          </>
        )}

        {(kind !== 'file' || editing) && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Название</span>
            <input
              className="cf-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'note' ? 'Конспект: тема урока' : 'Название материала'}
              autoFocus
            />
          </label>
        )}

        {kind === 'link' && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Ссылка</span>
            <input
              className="cf-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          </label>
        )}

        {(kind !== 'file' || editing) && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">
              Короткое описание <span className="text-ink-3">— видно на карточке</span>
            </span>
            <textarea
              className="cf-input min-h-[64px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="О чём этот материал"
            />
          </label>
        )}

        {kind === 'note' && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-2">Содержимое</span>
              {coEditor && (
                <span className="flex animate-fade-in items-center gap-1.5 rounded-pill bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-2">
                  <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-[color:var(--cf-green-acc)]" />
                  {coEditor} редактирует прямо сейчас
                </span>
              )}
            </div>
            <NoteEditor
              value={content}
              onChange={(html) => {
                setContent(html)
                noteChannel.current?.send(html)
              }}
              minHeight={260}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Папка</span>
            <select
              className="cf-input"
              value={folder ?? ''}
              onChange={(e) => setFolder(e.target.value || null)}
            >
              <option value="">Корень пространства</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Цвет карточки</span>
            <div className="pt-1.5">
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Теги</span>
          <TagSelector tags={tags} selected={tagIds} onChange={setTagIds} onCreated={() => void refresh()} />
        </div>
      </div>
    </Modal>
  )
}
