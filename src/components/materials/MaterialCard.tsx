import { memo } from 'react'
import {
  CheckCircle2,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react'
import type { MaterialView } from '@/lib/types'
import { MATERIAL_ICON } from '@/lib/icons'
import {
  MATERIAL_TYPE_LABEL,
  cardPalette,
  cx,
  excerpt,
  formatBytes,
  formatRelative,
  hostOf,
  stripHtml,
} from '@/lib/utils'
import { Avatar, TagPill } from '@/components/ui/primitives'
import { Menu } from '@/components/ui/Menu'

interface Props {
  material: MaterialView
  index?: number
  canEdit: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleStar: () => void
  onToggleStudied: () => void
  onDownload: () => void
  onTagClick?: (tagId: string) => void
}

/** Карточка-стикер: цветная плашка сверху, тонированный фон, теги-пилюли. */
export const MaterialCard = memo(function MaterialCard({
  material,
  index = 0,
  canEdit,
  onOpen,
  onEdit,
  onDelete,
  onToggleStar,
  onToggleStudied,
  onDownload,
  onTagClick,
}: Props) {
  const palette = cardPalette[material.color]
  const Icon = MATERIAL_ICON[material.type]
  const preview =
    material.description ||
    excerpt(stripHtml(material.content), 130) ||
    (material.type === 'link' && material.file_url ? hostOf(material.file_url) : '') ||
    (material.file_name ?? '')

  return (
    <article
      onClick={onOpen}
      className="cf-hoverable group flex cursor-pointer animate-fade-up flex-col overflow-hidden rounded-card border shadow-card"
      style={{
        background: palette.bg,
        borderColor: `color-mix(in srgb, ${palette.accent} 20%, transparent)`,
        animationDelay: `${Math.min(index, 12) * 35}ms`,
      }}
    >
      {/* цветная плашка */}
      <div className="h-[7px] w-full" style={{ background: palette.accent }} />

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
            style={{ background: `color-mix(in srgb, ${palette.accent} 15%, transparent)`, color: palette.accent }}
          >
            <Icon size={17} />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-ink">
              {material.title}
            </h3>
            <p className="mt-0.5 text-[11.5px] font-medium" style={{ color: palette.accent }}>
              {MATERIAL_TYPE_LABEL[material.type]}
              {material.file_size ? ` · ${formatBytes(material.file_size)}` : ''}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleStar()
              }}
              className={cx(
                'rounded-full p-1.5 transition hover:bg-black/5',
                material.starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-70 focus:opacity-100',
              )}
              aria-label={material.starred ? 'Убрать из избранного' : 'В избранное'}
            >
              <Star
                size={15}
                className={material.starred ? 'fill-current' : ''}
                style={{ color: material.starred ? 'var(--cf-yellow-acc)' : 'currentColor' }}
              />
            </button>

            <Menu
              items={[
                { label: 'Открыть', icon: Eye, onClick: onOpen },
                ...(material.file_url ? [{ label: 'Скачать', icon: Download, onClick: onDownload }] : []),
                {
                  label: material.progress === 'studied' ? 'Снять «Изучено»' : 'Отметить «Изучено»',
                  icon: CheckCircle2,
                  onClick: onToggleStudied,
                },
                ...(canEdit
                  ? [
                      { label: '', separator: true },
                      { label: 'Редактировать', icon: Pencil, onClick: onEdit },
                      { label: 'Удалить', icon: Trash2, danger: true, onClick: onDelete },
                    ]
                  : []),
              ]}
              trigger={({ toggle }) => (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle()
                  }}
                  className="rounded-full p-1.5 opacity-0 transition hover:bg-black/5 group-hover:opacity-70 focus:opacity-100"
                  aria-label="Действия"
                >
                  <MoreHorizontal size={15} />
                </button>
              )}
            />
          </div>
        </div>

        {preview && (
          <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2/90">{preview}</p>
        )}

        {material.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {material.tags.slice(0, 3).map((t) => (
              <TagPill key={t.id} tag={t} size="sm" onClick={onTagClick ? () => onTagClick(t.id) : undefined} />
            ))}
            {material.tags.length > 3 && (
              <span className="cf-pill border-transparent bg-black/5 px-2 py-[3px] text-[11px] text-ink-3">
                +{material.tags.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-3.5">
          {material.author && <Avatar name={material.author.name} src={material.author.avatar} size={20} />}
          <span className="truncate text-[11.5px] text-ink-3">
            {material.author?.name ?? 'Автор'} · {formatRelative(material.created_at)}
          </span>
          {material.progress === 'studied' && (
            <span
              className="ml-auto flex shrink-0 items-center gap-1 rounded-pill px-1.5 py-0.5 text-[10.5px] font-semibold"
              style={{ background: 'var(--cf-green-bg)', color: 'var(--cf-green-acc)' }}
            >
              <CheckCircle2 size={10} /> Изучено
            </span>
          )}
        </div>
      </div>
    </article>
  )
})

/** Строка списка — компактная альтернатива карточке. */
export const MaterialRow = memo(function MaterialRow({
  material,
  canEdit,
  onOpen,
  onEdit,
  onDelete,
  onToggleStar,
  onToggleStudied,
  onDownload,
  onTagClick,
}: Props) {
  const palette = cardPalette[material.color]
  const Icon = MATERIAL_ICON[material.type]

  return (
    <div
      onClick={onOpen}
      className="group flex animate-fade-in cursor-pointer items-center gap-3 px-4 py-3 transition duration-200 hover:bg-surface-2"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
        style={{ background: palette.bg, color: palette.accent }}
      >
        <Icon size={16} />
      </span>

      <div className="min-w-0 flex-[2]">
        <p className="truncate text-[13.5px] font-medium text-ink">{material.title}</p>
        <p className="truncate text-[11.5px] text-ink-3">
          {MATERIAL_TYPE_LABEL[material.type]}
          {material.file_size ? ` · ${formatBytes(material.file_size)}` : ''}
          {material.description ? ` · ${material.description}` : ''}
        </p>
      </div>

      <div className="hidden flex-1 flex-wrap gap-1.5 md:flex">
        {material.tags.slice(0, 2).map((t) => (
          <TagPill key={t.id} tag={t} size="sm" onClick={onTagClick ? () => onTagClick(t.id) : undefined} />
        ))}
      </div>

      <span className="hidden w-[110px] shrink-0 text-[12px] text-ink-3 lg:block">
        {formatRelative(material.created_at)}
      </span>

      {material.author && (
        <span className="hidden shrink-0 lg:block">
          <Avatar name={material.author.name} src={material.author.avatar} size={24} />
        </span>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleStar()
          }}
          className="rounded-full p-1.5 transition hover:bg-black/5"
          aria-label="В избранное"
        >
          <Star
            size={15}
            className={material.starred ? 'fill-current' : 'text-ink-3'}
            style={material.starred ? { color: 'var(--cf-yellow-acc)' } : undefined}
          />
        </button>
        <Menu
          items={[
            { label: 'Открыть', icon: Eye, onClick: onOpen },
            ...(material.file_url ? [{ label: 'Скачать', icon: Download, onClick: onDownload }] : []),
            {
              label: material.progress === 'studied' ? 'Снять «Изучено»' : 'Отметить «Изучено»',
              icon: CheckCircle2,
              onClick: onToggleStudied,
            },
            ...(canEdit
              ? [
                  { label: '', separator: true },
                  { label: 'Редактировать', icon: Pencil, onClick: onEdit },
                  { label: 'Удалить', icon: Trash2, danger: true, onClick: onDelete },
                ]
              : []),
          ]}
          trigger={({ toggle }) => (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggle()
              }}
              className="rounded-full p-1.5 text-ink-3 transition hover:bg-black/5 hover:text-ink"
              aria-label="Действия"
            >
              <MoreHorizontal size={15} />
            </button>
          )}
        />
      </div>
    </div>
  )
})
