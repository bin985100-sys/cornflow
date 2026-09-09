import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/primitives'
import type { SchoolApi } from '@/hooks/useSchool'
import type { SchoolClass, SchoolParallel } from '@/lib/types'

/**
 * Параллели и классы.
 *
 * Название параллели произвольное: «9», «11», «Начальная школа» — требование
 * «параллель может быть указана как номером, так и названием» выполняется тем,
 * что это обычное текстовое поле без проверки на число.
 */
export function ClassesSection({ school }: { school: SchoolApi }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function addParallel() {
    if (!school.schoolId || !name.trim()) return
    setBusy(true)
    try {
      await db.createParallel(school.schoolId, name)
      setName('')
      await school.refresh()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="cf-card p-4">
        <h3 className="text-[15px] font-semibold">Новая параллель</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Название любое: «9», «11», «Начальная школа». Классы заводятся внутри параллели.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="cf-input min-w-[180px] flex-1"
            placeholder="9"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addParallel()}
          />
          <button className="cf-btn-brand px-4" disabled={busy || !name.trim()} onClick={() => void addParallel()}>
            <Plus size={15} /> Добавить
          </button>
        </div>
      </div>

      {school.parallels.length === 0 ? (
        <EmptyState
          title="Параллелей пока нет"
          description="Начните с параллели — например «9». Потом добавьте в неё классы А, Б, В."
        />
      ) : (
        <div className="space-y-3">
          {school.parallels.map((parallel) => (
            <ParallelCard key={parallel.id} parallel={parallel} school={school} />
          ))}
        </div>
      )}
    </section>
  )
}

function ParallelCard({ parallel, school }: { parallel: SchoolParallel; school: SchoolApi }) {
  const toast = useToast()
  const [className, setClassName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(parallel.name)
  const [confirm, setConfirm] = useState(false)
  const classes = school.classesByParallel(parallel.id)

  async function addClass() {
    if (!school.schoolId || !className.trim()) return
    try {
      await db.createClass(school.schoolId, parallel.id, className)
      setClassName('')
      await school.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  async function rename() {
    try {
      await db.updateParallel(parallel.id, { name: draft.trim() })
      setRenaming(false)
      await school.refresh()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div className="cf-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <>
            <input
              className="cf-input w-40"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void rename()}
              autoFocus
            />
            <button className="cf-icon-btn" onClick={() => void rename()} title="Сохранить">
              <Check size={15} />
            </button>
            <button className="cf-icon-btn" onClick={() => setRenaming(false)} title="Отмена">
              <X size={15} />
            </button>
          </>
        ) : (
          <>
            <h3 className="text-[15px] font-semibold">Параллель {parallel.name}</h3>
            <span className="text-[12px] text-ink-3">
              {classes.length === 0 ? 'без классов' : `классов: ${classes.length}`}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button className="cf-icon-btn" onClick={() => setRenaming(true)} title="Переименовать">
                <Pencil size={15} />
              </button>
              <button className="cf-icon-btn" onClick={() => setConfirm(true)} title="Удалить">
                <Trash2 size={15} />
              </button>
            </div>
          </>
        )}
      </header>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {classes.map((klass) => (
          <ClassChip key={klass.id} klass={klass} parallel={parallel} school={school} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="cf-input w-32"
          placeholder="А"
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void addClass()}
        />
        <button className="cf-btn-ghost px-3 text-[12.5px]" disabled={!className.trim()} onClick={() => void addClass()}>
          <Plus size={14} /> Класс
        </button>
      </div>

      <ConfirmDialog
        open={confirm}
        title={`Удалить параллель ${parallel.name}?`}
        description="Вместе с ней удалятся её классы. Ученики останутся в школе, но без класса."
        confirmLabel="Удалить"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false)
          try {
            await db.deleteParallel(parallel.id)
            await school.refresh()
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </div>
  )
}

function ClassChip({
  klass,
  parallel,
  school,
}: {
  klass: SchoolClass
  parallel: SchoolParallel
  school: SchoolApi
}) {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const count = school.students.filter((s) => s.class_id === klass.id).length

  return (
    <>
      <span className="cf-pill flex items-center gap-1.5 px-2.5 py-[3px] text-[12.5px] font-semibold">
        {parallel.name}
        {klass.name}
        <span className="font-normal text-ink-3">{count}</span>
        <button className="text-ink-3 transition-colors hover:text-red-500" onClick={() => setConfirm(true)} title="Удалить класс">
          <X size={13} />
        </button>
      </span>
      <ConfirmDialog
        open={confirm}
        title={`Удалить класс ${parallel.name}${klass.name}?`}
        description={count ? `Учеников в классе: ${count}. Они останутся в школе, но без класса.` : undefined}
        confirmLabel="Удалить"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false)
          try {
            await db.deleteClass(klass.id)
            await school.refresh()
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </>
  )
}
