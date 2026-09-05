import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { db } from '@/lib/db'
import type { Folder } from '@/lib/types'
import { cardPalette, cx, plural } from '@/lib/utils'
import { useApp } from '@/context/AppContext'
import { useCreate } from '@/context/CreateContext'
import { useToast } from '@/context/ToastContext'
import { MaterialGrid, filterMaterials, sortMaterials } from '@/components/materials/MaterialGrid'
import { UploadZone, UploadList, useUploader } from '@/components/materials/UploadZone'
import { EmptyState, TagPill } from '@/components/ui/primitives'
import { Menu } from '@/components/ui/Menu'

export function LibraryPage() {
  const app = useApp()
  const { space, materials, folders, tags, loading, canEdit, query, activeTags, toggleTag, clearTags, sort, refresh } = app
  const create = useCreate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const folderId = params.get('folder')
  const currentFolder = folders.find((f) => f.id === folderId) ?? null

  const uploader = useUploader({
    spaceId: space?.id ?? null,
    folderId,
    onDone: () => void refresh(),
  })

  /* Материалы текущего уровня; при поиске или фильтре по тегам — по всему пространству */
  const searching = query.trim().length > 0 || activeTags.length > 0
  const visible = useMemo(() => {
    const filtered = filterMaterials(materials, {
      query,
      tagIds: activeTags,
      folderId: searching ? undefined : folderId,
    })
    return sortMaterials(filtered, sort)
  }, [materials, query, activeTags, folderId, searching, sort])

  const childFolders = useMemo(
    () => (searching ? [] : folders.filter((f) => (f.parent_id ?? null) === (folderId ?? null))),
    [folders, folderId, searching],
  )

  /* Теги, реально встречающиеся в пространстве */
  const usedTags = useMemo(() => {
    const ids = new Set(materials.flatMap((m) => m.tags.map((t) => t.id)))
    return tags.filter((t) => ids.has(t.id))
  }, [tags, materials])

  const breadcrumbs = useMemo(() => {
    const chain: Folder[] = []
    let cursor = currentFolder
    while (cursor) {
      chain.unshift(cursor)
      cursor = folders.find((f) => f.id === cursor?.parent_id) ?? null
    }
    return chain
  }, [currentFolder, folders])

  if (!space) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <EmptyState
          title="Нет активного пространства"
          description="Создайте своё пространство или присоединитесь к чужому по коду."
          action={
            <button className="cf-btn-brand" onClick={create.newSpace}>
              Создать пространство
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-5 py-6 lg:px-8">
      {/* --------------------------- заголовок раздела -------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <nav className="flex items-center gap-1 text-[13px] text-ink-3">
            <button
              onClick={() => setParams({})}
              className={cx('transition hover:text-ink', !currentFolder && 'font-semibold text-ink')}
            >
              {space.name}
            </button>
            {breadcrumbs.map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight size={13} />
                <button
                  onClick={() => setParams({ folder: f.id })}
                  className={cx('transition hover:text-ink', f.id === folderId && 'font-semibold text-ink')}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </nav>
          <h1 className="mt-1 text-[26px] font-bold tracking-[-0.02em]">
            {currentFolder ? currentFolder.name : 'Все материалы'}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {searching
              ? `Найдено: ${plural(visible.length, 'материал', 'материала', 'материалов')}`
              : `${plural(visible.length, 'материал', 'материала', 'материалов')}${childFolders.length ? ` · ${plural(childFolders.length, 'папка', 'папки', 'папок')}` : ''}`}
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button className="cf-btn-ghost" onClick={() => create.newFolder(folderId)}>
              <FolderPlus size={16} /> Папка
            </button>
            <Menu
              items={[
                { label: 'Загрузить файлы', onClick: () => create.newMaterial({ kind: 'file', folderId }) },
                { label: 'Написать конспект', onClick: () => create.newMaterial({ kind: 'note', folderId }) },
                { label: 'Добавить ссылку', onClick: () => create.newMaterial({ kind: 'link', folderId }) },
              ]}
              trigger={({ toggle }) => (
                <button className="cf-btn-brand" onClick={toggle}>
                  <Plus size={17} strokeWidth={2.6} /> Добавить
                </button>
              )}
            />
          </div>
        )}
      </div>

      {/* ------------------------------ фильтр по тегам ------------------------ */}
      {usedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {usedTags.map((t) => (
            <TagPill key={t.id} tag={t} active={activeTags.includes(t.id)} onClick={() => toggleTag(t.id)} />
          ))}
          {activeTags.length > 0 && (
            <button
              onClick={clearTags}
              className="cf-pill border-line px-2.5 py-[5px] text-[11.5px] text-ink-3 transition hover:text-ink"
            >
              <X size={11} /> Сбросить
            </button>
          )}
        </div>
      )}

      {/* -------------------------------- папки -------------------------------- */}
      {childFolders.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {childFolders.map((f, i) => (
            <FolderCard
              key={f.id}
              folder={f}
              index={i}
              count={materials.filter((m) => m.folder_id === f.id).length}
              canEdit={canEdit}
              onOpen={() => setParams({ folder: f.id })}
              onEdit={() => create.editFolder(f)}
              onDelete={async () => {
                if (!window.confirm(`Удалить папку «${f.name}»? Материалы останутся в пространстве.`)) return
                try {
                  await db.deleteFolder(f.id)
                  await refresh()
                  toast.success('Папка удалена')
                } catch (e) {
                  toast.error(e)
                }
              }}
            />
          ))}
        </div>
      )}

      {/* ------------------------------- материалы ----------------------------- */}
      <MaterialGrid
        materials={visible}
        loading={loading}
        empty={
          searching ? (
            <EmptyState
              art="search"
              title="Ничего не нашлось"
              description="Попробуйте изменить запрос или снять фильтры по тегам."
              action={
                activeTags.length > 0 ? (
                  <button className="cf-btn-ghost" onClick={clearTags}>
                    Сбросить фильтры
                  </button>
                ) : undefined
              }
            />
          ) : canEdit ? (
            <div className="space-y-3">
              <UploadZone onFiles={(files) => void uploader.upload(files)} />
              <UploadList items={uploader.items} onRemove={uploader.remove} />
            </div>
          ) : (
            <EmptyState title="В этой папке пусто" description="Преподаватель пока не добавил материалы." />
          )
        }
      />

      {/* Загрузка прямо на странице, когда материалы уже есть */}
      {canEdit && visible.length > 0 && !searching && (
        <div className="space-y-3 pt-2">
          <UploadZone
            compact
            onFiles={(files) => void uploader.upload(files)}
            hint="Файлы попадут в текущую папку"
          />
          <UploadList items={uploader.items} onRemove={uploader.remove} />
        </div>
      )}
    </div>
  )
}

function FolderCard({
  folder,
  index,
  count,
  canEdit,
  onOpen,
  onEdit,
  onDelete,
}: {
  folder: Folder
  index: number
  count: number
  canEdit: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const palette = cardPalette[folder.color]
  return (
    <button
      onClick={onOpen}
      className="cf-hoverable group flex animate-fade-up items-center gap-3 overflow-hidden rounded-card border p-3.5 text-left shadow-card"
      style={{
        background: palette.bg,
        borderColor: `color-mix(in srgb, ${palette.accent} 20%, transparent)`,
        animationDelay: `${index * 35}ms`,
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
        style={{ background: `color-mix(in srgb, ${palette.accent} 16%, transparent)`, color: palette.accent }}
      >
        <FolderIcon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-ink">{folder.name}</span>
        <span className="block text-[11.5px] text-ink-3">
          {plural(count, 'материал', 'материала', 'материалов')}
        </span>
      </span>
      {canEdit && (
        <Menu
          items={[
            { label: 'Переименовать', icon: Pencil, onClick: onEdit },
            { label: 'Удалить', icon: Trash2, danger: true, onClick: onDelete },
          ]}
          trigger={({ toggle }) => (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                toggle()
              }}
              onKeyDown={(e) => e.key === 'Enter' && toggle()}
              className="rounded-full p-1.5 opacity-0 transition hover:bg-black/5 group-hover:opacity-70"
            >
              <MoreHorizontal size={15} />
            </span>
          )}
        />
      )}
    </button>
  )
}
