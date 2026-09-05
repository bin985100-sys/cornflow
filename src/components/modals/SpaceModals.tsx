import { useEffect, useState } from 'react'
import { Copy, Link2, Loader2, RefreshCw, Trash2, UserMinus } from 'lucide-react'
import { db } from '@/lib/db'
import type { CardColor, Folder } from '@/lib/types'
import { cx } from '@/lib/utils'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { Avatar, ColorPicker } from '@/components/ui/primitives'

/* ------------------------------ Папка ------------------------------------ */

export function FolderModal({
  open,
  onClose,
  parentId,
  editing,
}: {
  open: boolean
  onClose: () => void
  parentId: string | null
  editing: Folder | null
}) {
  const { space, folders, refresh } = useApp()
  const toast = useToast()
  const [name, setName] = useState('')
  const [color, setColor] = useState<CardColor>('blue')
  const [parent, setParent] = useState<string | null>(parentId)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setColor(editing?.color ?? 'green')
    setParent(editing?.parent_id ?? parentId)
  }, [open, editing, parentId])

  async function save() {
    if (!space || !name.trim()) return
    setBusy(true)
    try {
      if (editing) await db.updateFolder(editing.id, { name: name.trim(), color, parent_id: parent })
      else await db.createFolder({ space_id: space.id, name: name.trim(), color, parent_id: parent })
      await refresh()
      toast.success(editing ? 'Папка обновлена' : 'Папка создана')
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={editing ? 'Переименовать папку' : 'Новая папка'}
      footer={
        <>
          <button className="cf-btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand" onClick={save} disabled={busy || !name.trim()}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {editing ? 'Сохранить' : 'Создать'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Название</span>
          <input
            className="cf-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, «Лекции»"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Вложить в папку</span>
          <select className="cf-input" value={parent ?? ''} onChange={(e) => setParent(e.target.value || null)}>
            <option value="">Корень пространства</option>
            {folders
              .filter((f) => f.id !== editing?.id)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </label>

        <div>
          <span className="mb-2 block text-[13px] font-medium text-ink-2">Цвет</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>
    </Modal>
  )
}

/* --------------------------- Новое пространство --------------------------- */

export function SpaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refreshSpaces, setSpaceId } = useApp()
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<CardColor>('purple')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setColor('purple')
    }
  }, [open])

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const space = await db.createSpace({ name: name.trim(), description, color })
      await refreshSpaces()
      setSpaceId(space.id)
      toast.success('Пространство создано')
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Новое пространство"
      subtitle="Курс или предмет со своими материалами и участниками"
      footer={
        <>
          <button className="cf-btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand" onClick={save} disabled={busy || !name.trim()}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            Создать
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-soft bg-brand-soft px-3.5 py-2.5 text-[12.5px] leading-snug text-brand">
          В своём пространстве вы — преподаватель курса, независимо от роли аккаунта: добавляете
          материалы и задания, приглашаете участников и настраиваете, что им доступно. В чужих
          курсах права выдаёт их владелец.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Название</span>
          <input
            className="cf-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Математика 10-Б"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Описание</span>
          <textarea
            className="cf-input min-h-[64px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Что за курс и для кого"
          />
        </label>
        <div>
          <span className="mb-2 block text-[13px] font-medium text-ink-2">Цвет</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------ Вход по коду ------------------------------ */

export function JoinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refreshSpaces, setSpaceId } = useApp()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setCode('')
  }, [open])

  async function join() {
    if (!code.trim()) return
    setBusy(true)
    try {
      const space = await db.joinSpaceByCode(code)
      await refreshSpaces()
      setSpaceId(space.id)
      toast.success(`Вы присоединились к «${space.name}»`)
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Присоединиться к пространству"
      subtitle="Введите код приглашения от преподавателя"
      footer={
        <>
          <button className="cf-btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="cf-btn-brand" onClick={join} disabled={busy || !code.trim()}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            Присоединиться
          </button>
        </>
      }
    >
      <input
        className="cf-input text-center text-[22px] font-bold uppercase tracking-[0.25em]"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="MATH10"
        maxLength={12}
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && join()}
      />
      <p className="mt-3 text-center text-[12.5px] text-ink-3">
        Код состоит из 6 символов. Его можно получить у владельца пространства.
      </p>
    </Modal>
  )
}

/* --------------------------- Приглашение / доступ ------------------------- */

export function ShareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { space, refreshSpaces } = useApp()
  const { user } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  if (!space) return null

  const inviteLink = `${window.location.origin}/join/${space.invite_code}`
  const isOwner = space.owner_id === user?.id

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} скопирован`)
    } catch {
      toast.error('Не удалось скопировать — выделите текст вручную')
    }
  }

  async function regenerate() {
    if (!space) return
    setBusy(true)
    try {
      await db.regenerateInviteCode(space.id)
      await refreshSpaces()
      toast.success('Новый код создан')
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Доступ к пространству" subtitle={space.name}>
      <div className="space-y-5">
        <div className="rounded-card border border-line bg-surface-2/50 p-4 text-center">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Код приглашения</p>
          <p className="mt-2 text-[34px] font-extrabold tracking-[0.2em] text-ink">{space.invite_code}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button className="cf-btn-ghost py-2 text-[13px]" onClick={() => copy(space.invite_code, 'Код')}>
              <Copy size={14} /> Скопировать код
            </button>
            <button className="cf-btn-ghost py-2 text-[13px]" onClick={() => copy(inviteLink, 'Ссылка')}>
              <Link2 size={14} /> Скопировать ссылку
            </button>
            {isOwner && (
              <button className="cf-btn-ghost py-2 text-[13px]" onClick={regenerate} disabled={busy}>
                <RefreshCw size={14} className={cx(busy && 'animate-spin')} /> Обновить
              </button>
            )}
          </div>
        </div>

        {isOwner && (
          <div className="rounded-card border border-line">
            <p className="border-b border-line px-3.5 py-2.5 text-[13px] font-semibold text-ink">
              Что доступно ученикам
            </p>
            <ul className="divide-y divide-line">
              <SpaceToggle
                spaceId={space.id}
                field="join_open"
                value={space.join_open}
                title="Приём по коду"
                hint="Новые участники могут войти по коду приглашения"
              />
              <SpaceToggle
                spaceId={space.id}
                field="student_upload"
                value={space.student_upload}
                title="Ученики добавляют материалы"
                hint="Иначе загружать и править материалы могут только вы и редакторы"
              />
              <SpaceToggle
                spaceId={space.id}
                field="show_assignments"
                value={space.show_assignments}
                title="Раздел «Задания»"
                hint="Скрыть задания у учеников, пока курс не готов"
              />
              <SpaceToggle
                spaceId={space.id}
                field="show_calendar"
                value={space.show_calendar}
                title="Раздел «Календарь»"
                hint="Календарь дедлайнов у учеников"
              />
              <SpaceToggle
                spaceId={space.id}
                field="show_members"
                value={space.show_members}
                title="Список участников"
                hint="Ученики видят, кто ещё состоит в пространстве"
              />
              <SpaceToggle
                spaceId={space.id}
                field="is_locked"
                value={space.is_locked}
                title="Закрыть пространство"
                hint="Ученики не видят содержимое, пока вы не откроете его снова"
                danger
              />
            </ul>
          </div>
        )}

        {(isOwner || space.show_members) && (
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Участники ({space.members.length})</p>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
            {space.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 bg-surface px-3.5 py-2.5">
                <Avatar name={m.name} src={m.avatar} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">
                    {m.name}
                    {m.id === space.owner_id && <span className="ml-1.5 text-[11px] text-ink-3">владелец</span>}
                  </p>
                  <p className="text-[11.5px] text-ink-3">{m.role === 'teacher' ? 'Учитель' : 'Ученик'}</p>
                </div>
                {isOwner && m.id !== space.owner_id ? (
                  <>
                    <select
                      className="rounded-pill border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-2"
                      value={m.permission}
                      onChange={async (e) => {
                        try {
                          await db.setMemberPermission(space.id, m.id, e.target.value as 'view' | 'edit')
                          await refreshSpaces()
                        } catch (err) {
                          toast.error(err)
                        }
                      }}
                    >
                      <option value="view">Просмотр</option>
                      <option value="edit">Редактирование</option>
                    </select>
                    <button
                      className="cf-icon-btn"
                      title="Исключить"
                      onClick={async () => {
                        try {
                          await db.removeMember(space.id, m.id)
                          await refreshSpaces()
                          toast.success('Участник исключён')
                        } catch (err) {
                          toast.error(err)
                        }
                      }}
                    >
                      <UserMinus size={15} />
                    </button>
                  </>
                ) : (
                  <span className="rounded-pill border border-line px-2.5 py-1 text-[12px] text-ink-3">
                    {m.permission === 'edit' ? 'Редактирование' : 'Просмотр'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        )}

        {isOwner && (
          <button
            className="flex items-center gap-2 text-[13px] font-medium transition hover:underline"
            style={{ color: 'var(--cf-red-acc)' }}
            onClick={async () => {
              if (!window.confirm(`Удалить пространство «${space.name}» со всеми материалами?`)) return
              try {
                await db.deleteSpace(space.id)
                await refreshSpaces()
                toast.success('Пространство удалено')
                onClose()
              } catch (e) {
                toast.error(e)
              }
            }}
          >
            <Trash2 size={15} /> Удалить пространство
          </button>
        )}
      </div>
    </Modal>
  )
}


/* --------------------- тумблер настройки пространства --------------------- */

function SpaceToggle({
  spaceId,
  field,
  value,
  title,
  hint,
  danger,
}: {
  spaceId: string
  field:
    | 'join_open'
    | 'is_locked'
    | 'student_upload'
    | 'show_assignments'
    | 'show_calendar'
    | 'show_members'
  value: boolean
  title: string
  hint: string
  danger?: boolean
}) {
  const { refreshSpaces } = useApp()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [on, setOn] = useState(value)

  useEffect(() => setOn(value), [value])

  async function toggle() {
    const next = !on
    setOn(next)
    setBusy(true)
    try {
      await db.updateSpace(spaceId, { [field]: next })
      await refreshSpaces()
    } catch (e) {
      setOn(!next)
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex items-center gap-3 bg-surface px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-ink">{title}</p>
        <p className="text-[11.5px] leading-snug text-ink-3">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={busy}
        onClick={toggle}
        className={cx(
          'relative h-[24px] w-[42px] shrink-0 rounded-full border transition disabled:opacity-60',
          on ? 'border-transparent' : 'border-line bg-surface-2',
        )}
        style={on ? { background: danger ? 'var(--cf-red-acc)' : 'rgb(var(--cf-brand))' } : undefined}
      >
        <span
          className={cx(
            'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all',
            on ? 'left-[21px]' : 'left-[2px]',
          )}
        />
      </button>
    </li>
  )
}
