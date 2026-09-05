import { useMemo } from 'react'
import { X } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { MaterialGrid, filterMaterials, sortMaterials } from '@/components/materials/MaterialGrid'
import { EmptyState, TagPill } from '@/components/ui/primitives'
import { plural } from '@/lib/utils'

export function StarredPage() {
  const { allMaterials, tags, loading, query, activeTags, toggleTag, clearTags, sort } = useApp()

  const starred = useMemo(() => allMaterials.filter((m) => m.starred), [allMaterials])

  const visible = useMemo(
    () => sortMaterials(filterMaterials(starred, { query, tagIds: activeTags }), sort),
    [starred, query, activeTags, sort],
  )

  const usedTags = useMemo(() => {
    const ids = new Set(starred.flatMap((m) => m.tags.map((t) => t.id)))
    return tags.filter((t) => ids.has(t.id))
  }, [tags, starred])

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-5 py-6 lg:px-8">
      <header>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Избранное</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {plural(visible.length, 'материал', 'материала', 'материалов')} со звёздочкой — из всех пространств
        </p>
      </header>

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

      <MaterialGrid
        materials={visible}
        loading={loading}
        empty={
          <EmptyState
            art="star"
            title="В избранном пока пусто"
            description="Нажмите на звёздочку в углу карточки — материал появится здесь и в боковом меню."
          />
        }
      />
    </div>
  )
}
