import { useState } from 'react'
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { ColorPicker, EmptyState } from '@/components/ui/primitives'
import { cardPalette } from '@/lib/utils'
import type { SchoolApi } from '@/hooks/useSchool'
import type { CardColor, SchoolDepartment } from '@/lib/types'

/**
 * МО — методические объединения. Предмет относится к одному МО:
 * «Алгебра и начала математического анализа», «Геометрия», «Математика»
 * входят в МО «Математика». МО ничего не ограничивает — это группировка
 * предметов, по которой удобно смотреть школу целиком.
 */
export function DepartmentsSection({ school }: { school: SchoolApi }) {
  const [creating, setCreating] = useState(false)

  return (
    <section className="space-y-4">
      {school.isAdmin && (
        <div className="cf-card flex flex-wrap items-center gap-2 p-3">
          <span className="text-[13px] text-ink-2">МО: {school.departments.length}</span>
          <button className="cf-btn-brand ml-auto px-4" onClick={() => setCreating(true)}>
            <Plus size={15} /> Новое МО
          </button>
        </div>
      )}

      {school.departments.length === 0 ? (
        <EmptyState
          title="МО пока нет"
          description="МО собирает родственные предметы: «Алгебра», «Геометрия» и «Математика» — в МО «Математика»."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {school.departments.map((dept) => (
            <DepartmentCard key={dept.id} dept={dept} school={school} />
          ))}
        </div>
      )}

      {school.subjectsByDepartment(null).length > 0 && (
        <div className="cf-card p-4">
          <p className="text-[13px] font-semibold text-ink-2">Предметы без МО</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {school.subjectsByDepartment(null).map((s) => (
              <span key={s.id} className="cf-pill px-2.5 py-[3px] text-[11.5px] font-semibold">
                {s.name}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            МО задаётся в карточке предмета — раздел «Предметы».
          </p>
        </div>
      )}

      {creating && <DepartmentModal school={school} onClose={() => setCreating(false)} />}
    </section>
  )
}

function DepartmentCard({ dept, school }: { dept: SchoolDepartment; school: SchoolApi }) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const subjects = school.subjectsByDepartment(dept.id)
  const palette = cardPalette[dept.color]

  return (
    <div className="cf-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-[10px]"
          style={{ background: palette.bg, color: palette.accent }}
        >
          <Boxes size={15} />
        </span>
        <h3 className="text-[15px] font-semibold">{dept.name}</h3>
        <span className="cf-pill px-2 py-[2px] text-[11px] text-ink-3">
          предметов: {subjects.length}
        </span>
        {school.isAdmin && (
          <div className="ml-auto flex items-center gap-1.5">
            <button className="cf-icon-btn" onClick={() => setEditing(true)} title="Изменить">
              <Pencil size={14} />
            </button>
            <button className="cf-icon-btn" onClick={() => setConfirm(true)} title="Удалить">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </header>

      {subjects.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-ink-3">
          Пока пусто — привяжите предметы к этому МО в разделе «Предметы».
        </p>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {subjects.map((s) => (
            <span
              key={s.id}
              className="cf-pill px-2.5 py-[3px] text-[11.5px] font-semibold"
              style={{ background: cardPalette[s.color].bg, color: cardPalette[s.color].accent }}
            >
              {s.name}
            </span>
          ))}
        </div>
      )}

      {editing && <DepartmentModal school={school} dept={dept} onClose={() => setEditing(false)} />}

      <ConfirmDialog
        open={confirm}
        title={`Удалить МО «${dept.name}»?`}
        description="Предметы останутся на месте — у них просто пропадёт привязка к МО."
        confirmLabel="Удалить"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false)
          try {
            await db.deleteDepartment(dept.id)
            await school.refresh()
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </div>
  )
}

function DepartmentModal({
  school,
  dept,
  onClose,
}: {
  school: SchoolApi
  dept?: SchoolDepartment
  onClose: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState(dept?.name ?? '')
  const [color, setColor] = useState<CardColor>(dept?.color ?? 'blue')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!school.schoolId || !name.trim()) return
    setBusy(true)
    try {
      if (dept) await db.updateDepartment(dept.id, { name: name.trim(), color })
      else await db.createDepartment(school.schoolId, name.trim(), color)
      await school.refresh()
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={dept ? 'МО' : 'Новое МО'} size="sm">
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-[12.5px] text-ink-2">Название</span>
          <input
            className="cf-input w-full"
            placeholder="Математика"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <span className="mb-1.5 block text-[12.5px] text-ink-2">Цвет</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand px-4" disabled={busy || !name.trim()} onClick={() => void save()}>
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}
