import { useRef, useState } from 'react'
import {
  BookOpen,
  Database,
  Download,
  GraduationCap,
  Loader2,
  Moon,
  Sun,
  Upload,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useCreate } from '@/context/CreateContext'
import { useToast } from '@/context/ToastContext'
import { useTheme } from '@/hooks/useTheme'
import { IS_MOCK, db } from '@/lib/db'
import { cardPalette, cx, download } from '@/lib/utils'
import { Avatar, Segmented } from '@/components/ui/primitives'
import { useNavigate } from 'react-router-dom'

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, updateProfile, signOut, isTeacher } = useAuth()
  const { spaces, setSpaceId, space } = useApp()
  const create = useCreate()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const [name, setName] = useState(user?.name ?? '')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Выгрузка всех локальных данных одним файлом. */
  function exportBackup() {
    if (!db.snapshot) return
    const blob = new Blob([db.snapshot()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 10)
    download(url, `cornflow-backup-${stamp}.json`)
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    toast.success('Резервная копия сохранена')
  }

  /** Восстановление из ранее выгруженного файла. */
  async function importBackup(file: File) {
    if (!db.restore) return
    try {
      db.restore(await file.text())
      toast.success('Данные восстановлены')
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      toast.error(e)
    }
  }

  async function saveProfile() {
    setBusy(true)
    try {
      await updateProfile({ name: name.trim() || user!.name })
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
        <p className="mt-0.5 text-[13px] text-ink-3">Профиль, роль, тема и пространства</p>
      </header>

      {/* профиль */}
      <section className="cf-card p-5">
        <h2 className="mb-4 text-[15px]">Профиль</h2>
        <div className="flex items-center gap-4">
          <Avatar name={user?.name ?? '?'} src={user?.avatar} size={56} />
          <div className="flex-1 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Имя</span>
              <input className="cf-input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <p className="text-[12.5px] text-ink-3">{user?.email}</p>
          </div>
        </div>
        <button className="cf-btn-brand mt-4" onClick={saveProfile} disabled={busy}>
          {busy && <Loader2 size={15} className="animate-spin" />} Сохранить
        </button>
      </section>

      {/* роль */}
      <section className="cf-card p-5">
        <h2 className="mb-1 text-[15px]">Роль</h2>
        <p className="mb-4 text-[13px] text-ink-3">
          От роли зависит набор доступных действий: учитель создаёт задания и видит прогресс,
          ученик сдаёт работы и отмечает изученное.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              { value: 'teacher', label: 'Учитель', icon: GraduationCap },
              { value: 'student', label: 'Ученик', icon: BookOpen },
            ] as const
          ).map((r) => (
            <button
              key={r.value}
              onClick={async () => {
                try {
                  await updateProfile({ role: r.value })
                  toast.success(`Роль изменена: ${r.label}`)
                } catch (e) {
                  toast.error(e)
                }
              }}
              className={cx(
                'flex items-center gap-2.5 rounded-soft border-2 p-3.5 transition',
                (r.value === 'teacher') === isTeacher
                  ? 'border-brand bg-brand-soft'
                  : 'border-line hover:bg-surface-2',
              )}
            >
              <r.icon size={18} className={(r.value === 'teacher') === isTeacher ? 'text-brand' : 'text-ink-3'} />
              <span className="text-[14px] font-semibold text-ink">{r.label}</span>
            </button>
          ))}
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

      {/* режим хранения */}
      <section className="cf-card p-5">
        <div className="flex items-start gap-3">
          <Database size={18} className="mt-0.5 shrink-0 text-brand" />
          <div className="flex-1">
            <h2 className="text-[15px]">Хранилище данных</h2>
            <p className="mt-1 text-[13px] text-ink-3">
              {IS_MOCK
                ? 'Локальный режим: записи хранятся в этом браузере, файлы — в IndexedDB. Данные сохраняются между визитами; чтобы они жили на сервере и открывались с любого устройства, задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env и выполните supabase/migrations/0001_init.sql.'
                : 'Подключён Supabase: авторизация, PostgreSQL с политиками доступа, Storage и realtime-обновления. Резервные копии делает провайдер.'}
            </p>
          </div>
        </div>

        {IS_MOCK && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-[13px] font-medium text-ink">Резервная копия</p>
            <p className="mt-1 text-[12.5px] text-ink-3">
              Выгрузите все пространства, материалы и задания одним файлом — его можно
              перенести в другой браузер или восстановить после очистки данных.
              Загруженные файлы в копию не входят.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="cf-btn-ghost px-3.5 py-2 text-[13px]" onClick={exportBackup}>
                <Download size={15} /> Выгрузить
              </button>
              <button
                className="cf-btn-ghost px-3.5 py-2 text-[13px]"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={15} /> Восстановить
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void importBackup(file)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        )}
      </section>

      <button
        className="text-[13.5px] font-medium transition hover:underline"
        style={{ color: 'var(--cf-red-acc)' }}
        onClick={() => void signOut().then(() => navigate('/'))}
      >
        Выйти из аккаунта
      </button>
    </div>
  )
}
