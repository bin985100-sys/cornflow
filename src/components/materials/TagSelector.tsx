import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { ICON_NAMES, iconByName } from '@/lib/icons'
import type { Tag, TagColor } from '@/lib/types'
import { TAG_COLORS, cx, tagPalette } from '@/lib/utils'
import { TagPill } from '@/components/ui/primitives'
import { useToast } from '@/context/ToastContext'

export function TagSelector({
  tags,
  selected,
  onChange,
  onCreated,
}: {
  tags: Tag[]
  selected: string[]
  onChange: (ids: string[]) => void
  onCreated?: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<TagColor>('blue')
  const [icon, setIcon] = useState('Hash')
  const toast = useToast()

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  async function create() {
    if (!name.trim()) return
    try {
      const tag = await db.createTag({ name: name.trim(), color, icon })
      onChange([...selected, tag.id])
      setName('')
      setCreating(false)
      onCreated?.()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <TagPill key={t.id} tag={t} size="sm" active={selected.includes(t.id)} onClick={() => toggle(t.id)} />
        ))}
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="cf-pill border-dashed border-line px-2.5 py-[5px] text-[11.5px] text-ink-3 transition hover:border-brand hover:text-brand"
        >
          <Plus size={11} /> Новый тег
        </button>
      </div>

      {creating && (
        <div className="animate-scale-in space-y-3 rounded-soft border border-line bg-surface-2/50 p-3">
          <div className="flex gap-2">
            <input
              className="cf-input py-2 text-[13px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название тега"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), create())}
            />
            <button type="button" className="cf-btn-brand shrink-0 px-3.5 py-2" onClick={create}>
              <Check size={15} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={tagPalette[c].label}
                className={cx(
                  'h-6 w-6 rounded-full border-2 transition',
                  color === c ? 'scale-110' : 'border-transparent',
                )}
                style={{
                  background: tagPalette[c].bg,
                  borderColor: color === c ? tagPalette[c].fg : 'transparent',
                  boxShadow: `inset 0 0 0 2.5px ${tagPalette[c].fg}`,
                }}
              />
            ))}
          </div>

          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
            {ICON_NAMES.slice(0, 28).map((n) => {
              const Icon = iconByName(n)
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setIcon(n)}
                  className={cx(
                    'flex h-7 w-7 items-center justify-center rounded-lg border transition',
                    icon === n ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-3 hover:bg-surface',
                  )}
                >
                  <Icon size={14} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
