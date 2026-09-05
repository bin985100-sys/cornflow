import { useRef, useState } from 'react'
import {
  BookOpen,
  Camera,
  ImagePlus,
  GraduationCap,
  Loader2,
  LogOut,
  Trash2,
  Moon,
  Sun,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useCreate } from '@/context/CreateContext'
import { useToast } from '@/context/ToastContext'
import { useTheme } from '@/hooks/useTheme'

import { db } from '@/lib/db'
import { cardPalette, cx } from '@/lib/utils'
import { Avatar, Segmented } from '@/components/ui/primitives'
import { useNavigate } from 'react-router-dom'

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, updateProfile, signOut, isTeacher, setPassword } = useAuth()
  const { spaces, setSpaceId, space, refresh } = useApp()
  // членство в чужом курсе фиксирует роль
  const inOtherCourse = spaces.some((s) => s.owner_id !== user?.id)
  const create = useCreate()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const [name, setName] = useState(user?.name ?? '')
  const [avatar, setAvatar] = useState(user?.avatar ?? '')
  const [busy, setBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [password, setPasswordValue] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)
  const [roleBusy, setRoleBusy] = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)

  async function changeRole(role: 'teacher' | 'student') {
    await db.setRole(role)
    await refresh()
    window.location.reload()
  }

  async function saveProfile() {
    setBusy(true)
    try {
      await updateProfile({
        name: name.trim() || user!.name,
        avatar: avatar.trim() || null,
      })
      toast.success('Профиль обновлён')
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 py-6">
      <header>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Настройки</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">Профиль, пароль, тема и пространства</p>
      </header>

      {/* профиль */}
      <section className="cf-card p-5">
        <h2 className="mb-4 text-[15px]">Профиль</h2>
        <div className="flex flex-wrap items-start gap-4">
          <div className="group relative">
            <Avatar name={name || user?.name || '?'} src={avatar || undefined} size={72} />
            <button
              type="button"
              onClick={() => avatarRef.current?.click()}
              disabled={avatarBusy}
              aria-label="Выбрать фото профиля"
              className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/55 text-white opacity-0 backdrop-blur-[1px] transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 disabled:opacity-100"
            >
              {avatarBusy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            </button>
          </div>

          <div className="min-w-[220px] flex-1 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Имя</span>
              <input className="cf-input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="cf-btn-ghost px-3.5 py-2 text-[13px]"
                onClick={() => avatarRef.current?.click()}
                disabled={avatarBusy}
              >
                <ImagePlus size={15} /> {avatar ? 'Заменить фото' : 'Выбрать фото'}
              </button>
              {avatar && (
                <button
                  type="button"
                  className="cf-btn-ghost px-3.5 py-2 text-[13px]"
                  onClick={() => setAvatar('')}
                  disabled={avatarBusy}
                >
                  <Trash2 size={15} /> Убрать
                </button>
              )}
            </div>
            <input
              ref={avatarRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                if (file.size > 5 * 1024 * 1024) {
                  toast.error('Файл больше 5 МБ — выберите изображение поменьше')
                  return
                }
                setAvatarBusy(true)
                try {
                  const url = await db.uploadAvatar(file)
                  setAvatar(url)
                  await updateProfile({ name: name.trim() || user!.name, avatar: url })
                  toast.success('Фото профиля обновлено')
                } catch (err) {
                  toast.error(err)
                } finally {
                  setAvatarBusy(false)
                }
              }}
            />
            <p className="text-[12.5px] text-ink-3">Почта: {user?.email} — её сменить нельзя</p>
          </div>
        </div>
        <button className="cf-btn-brand mt-4" onClick={saveProfile} disabled={busy}>
          {busy && <Loader2 size={15} className="animate-spin" />} Сохранить
        </button>
      </section>

      {/* роль */}
      <section className="cf-card p-5">
        <h2 className="mb-1 text-[15px]">Роль аккаунта</h2>
        <p className="mb-4 text-[13px] text-ink-3">
          {inOtherCourse
            ? 'Роль выбрана при регистрации. Сменить её нельзя, пока вы состоите в чужом курсе — иначе ученик мог бы сам выдать себе учительские права.'
            : 'Роль выбрана при регистрации. Пока вы не вступили ни в один чужой курс, её ещё можно исправить — потом она зафиксируется.'}
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              { value: 'teacher', label: 'Учитель', icon: GraduationCap },
              { value: 'student', label: 'Ученик', icon: BookOpen },
            ] as const
          ).map((r) => {
            const active = (r.value === 'teacher') === isTeacher
            return (
              <button
                key={r.value}
                disabled={inOtherCourse || active || roleBusy}
                onClick={async () => {
                  setRoleBusy(true)
                  try {
                    await changeRole(r.value)
                    toast.success(`Роль изменена: ${r.label}`)
                  } catch (e) {
                    toast.error(e)
                  } finally {
                    setRoleBusy(false)
                  }
                }}
                className={cx(
                  'flex items-center gap-2.5 rounded-soft border-2 p-3.5 transition duration-300',
                  active
                    ? 'border-brand bg-brand-soft'
                    : inOtherCourse
                      ? 'cursor-not-allowed border-line opacity-50'
                      : 'border-line hover:-translate-y-0.5 hover:bg-surface-2',
                )}
              >
                <r.icon size={18} className={active ? 'text-brand' : 'text-ink-3'} />
                <span className="text-[14px] font-semibold text-ink">{r.label}</span>
                {active && <span className="ml-auto text-[12px] text-ink-3">сейчас</span>}
              </button>
            )
          })}
        </div>
      </section>

      {/* тема */}
      <section className="cf-card flex items-center justify-between p-5">
        <div>
          <h2 className="text-[15px]">Оформление</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">Светлая или тёмная тема интерфейса</p>
        </div>
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: <><Sun size={14} /> Светлая</> },
            { value: 'dark', label: <><Moon size={14} /> Тёмная</> },
          ]}
        />
      </section>

      {/* пространства */}
      <section className="cf-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px]">Пространства</h2>
          <div className="flex gap-2">
            <button className="cf-btn-ghost px-3 py-1.5 text-[13px]" onClick={create.joinSpace}>
              По коду
            </button>
            <button className="cf-btn-brand px-3 py-1.5 text-[13px]" onClick={create.newSpace}>
              Создать
            </button>
          </div>
        </div>
        <ul className="divide-y divide-line overflow-hidden rounded-soft border border-line">
          {spaces.map((s) => (
            <li key={s.id} className="flex items-center gap-3 bg-surface px-3.5 py-2.5">
              <span
                className="h-8 w-8 shrink-0 rounded-[10px]"
                style={{ background: cardPalette[s.color].bg, boxShadow: `inset 0 0 0 2px ${cardPalette[s.color].accent}` }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{s.name}</p>
                <p className="text-[11.5px] text-ink-3">
                  {s.members.length} участник(ов) · код {s.invite_code}
                </p>
              </div>
              {s.id === space?.id ? (
                <span className="rounded-pill bg-brand-soft px-2.5 py-1 text-[12px] font-medium text-brand">
                  текущее
                </span>
              ) : (
                <button
                  className="rounded-pill border border-line px-2.5 py-1 text-[12px] text-ink-2 transition hover:bg-surface-2"
                  onClick={() => setSpaceId(s.id)}
                >
                  выбрать
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* пароль */}
      {setPassword && (
        <section className="cf-card p-5">
          <h2 className="mb-1 text-[15px]">Пароль</h2>
          <p className="mb-4 text-[13px] text-ink-3">
            Задайте пароль, чтобы входить по почте. Если аккаунт заведён через Google, пароля
            у него ещё нет — вход кнопкой Google продолжит работать в любом случае.
          </p>
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="min-w-[220px] flex-1">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Новый пароль</span>
              <input
                className="cf-input"
                type="password"
                value={password}
                onChange={(e) => setPasswordValue(e.target.value)}
                placeholder="Минимум 6 символов"
              />
            </label>
            <button
              className="cf-btn-brand"
              disabled={pwdBusy || password.trim().length < 6}
              onClick={async () => {
                setPwdBusy(true)
                try {
                  await setPassword(password.trim())
                  setPasswordValue('')
                  toast.success('Пароль сохранён — теперь можно входить по почте')
                } catch (e) {
                  toast.error(e)
                } finally {
                  setPwdBusy(false)
                }
              }}
            >
              {pwdBusy && <Loader2 size={15} className="animate-spin" />} Сохранить пароль
            </button>
          </div>
        </section>
      )}

      {/* аккаунт */}
      <section className="cf-card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-[15px]">Аккаунт</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Вы вошли как {user?.name} ({user?.email})
          </p>
        </div>
        <button
          className="cf-btn-ghost"
          style={{ color: 'var(--cf-red-acc)' }}
          onClick={() => void signOut().then(() => navigate('/'))}
        >
          <LogOut size={15} /> Выйти из аккаунта
        </button>
      </section>
    </div>
  )
}
