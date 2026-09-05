import { useMemo, type ReactNode } from 'react'
import { db } from '@/lib/db'
import type { MaterialView } from '@/lib/types'
import { MATERIAL_TYPE_LABEL, normalize, stripHtml } from '@/lib/utils'
import { useApp, type SortMode, type ViewMode } from '@/context/AppContext'
import { useCreate } from '@/context/CreateContext'
import { useToast } from '@/context/ToastContext'
import { CardSkeletonGrid, EmptyState, RowSkeleton } from '@/components/ui/primitives'
import { MaterialCard, MaterialRow } from './MaterialCard'

export function filterMaterials(
  items: MaterialView[],
  { query, tagIds, folderId }: { query: string; tagIds: string[]; folderId?: string | null },
): MaterialView[] {
  const q = normalize(query)
  return items.filter((m) => {
    if (folderId !== undefined && folderId !== null && m.folder_id !== folderId) return false
    if (tagIds.length && !tagIds.every((t) => m.tags.some((x) => x.id === t))) return false
    if (!q) return true
    const haystack = [
      m.title,
      m.description ?? '',
      stripHtml(m.content),
      m.file_name ?? '',
      MATERIAL_TYPE_LABEL[m.type],
      ...m.tags.map((t) => t.name),
    ]
      .map(normalize)
      .join(' ')
    return haystack.includes(q)
  })
}

export function sortMaterials(items: MaterialView[], sort: SortMode): MaterialView[] {
  const copy = [...items]
  switch (sort) {
    case 'old':
      return copy.sort((a, b) => a.created_at.localeCompare(b.created_at))
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
    case 'type':
      return copy.sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title, 'ru'))
    default:
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
}

export function MaterialGrid({
  materials,
  loading,
  view,
  empty,
  columns = 'wide',
}: {
  materials: MaterialView[]
  loading?: boolean
  view?: ViewMode
  empty?: ReactNode
  /** 'wide' — во всю рабочую область, 'narrow' — в колонке дашборда */
  columns?: 'wide' | 'narrow'
}) {
  const app = useApp()
  const create = useCreate()
  const toast = useToast()
  const mode = view ?? app.view

  const handlers = useMemo(
    () => ({
      star: async (m: MaterialView) => {
        try {
          await db.toggleStar(m.id)
          await app.refresh()
        } catch (e) {
          toast.error(e)
        }
      },
      studied: async (m: MaterialView) => {
        try {
          await db.setProgress(m.id, m.progress === 'studied' ? 'viewed' : 'studied')
          await app.refresh()
        } catch (e) {
          toast.error(e)
        }
      },
    }),
    [app, toast],
  )

  if (loading) return mode === 'grid' ? <CardSkeletonGrid /> : <RowSkeleton />

  if (!materials.length) {
    return (
      <>
        {empty ?? (
          <EmptyState
            title="Пока пусто"
            description="Загрузите файлы, напишите конспект или добавьте ссылку — материалы появятся здесь цветными карточками."
            art="materials"
          />
        )}
      </>
    )
  }

  const props = (m: MaterialView, index: number) => ({
    material: m,
    index,
    canEdit: app.canEdit,
    onOpen: () => create.openMaterial(m),
    onEdit: () => create.editMaterial(m),
    onDelete: () => create.deleteMaterial(m),
    onDownload: () => create.downloadMaterial(m),
    onToggleStar: () => void handlers.star(m),
    onToggleStudied: () => void handlers.studied(m),
    onTagClick: (tagId: string) => app.toggleTag(tagId),
  })

  if (mode === 'list') {
    return (
      <div className="cf-card divide-y divide-line overflow-hidden">
        {materials.map((m, i) => (
          <MaterialRow key={m.id} {...props(m, i)} />
        ))}
      </div>
    )
  }

  return (
    <div
      className={
        columns === 'narrow'
          ? 'grid grid-cols-1 gap-4 md:grid-cols-2'
          : 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
      }
    >
      {materials.map((m, i) => (
        <MaterialCard key={m.id} {...props(m, i)} />
      ))}
    </div>
  )
}
