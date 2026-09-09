import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useSchoolCtx } from '@/context/SchoolContext'
import { ConfirmDialog } from '@/components/ui/Modal'
import { inviteCode } from '@/lib/utils'

/** Настройки школы: имя, код доступа, список школ, удаление. */
export function AdminSettingsPage() {
  const school = useSchoolCtx()
  const toast = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(school.school.name)
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const isOwner = school.school.owner_id === user?.id

  async function rename() {
    if (!school.schoolId || !name.trim()) return
    try {
      await db.updateSchool(school.schoolId, { name: name.trim() })
      await school.refresh()
      toast.success('Название сохранено')
    } catch (e) {
      toast.error(e)
    }
  }

  async function regenerate() {
    if (!school.schoolId) return
    try {
      await db.updateSchool(school.schoolId, { code: inviteCode() })
      await school.refresh()
      toast.success('Код обновлён — старый больше не работает')
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <div className="animate-fade-up space-y-4">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">Настройки школы</h1>

      <section className="cf-card p-4">
        <h2 className="text-[15px] font-semibold">Название</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="cf-input min-w-[200px] flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void rename()}
          />
          <button
            className="cf-btn-brand px-4"
            disabled={!name.trim() || name.trim() === school.school.name}
            onClick={() => void rename()}
          >
            Сохранить
          </button>
        </div>
      </section>

      <section className="cf-card p-4">
        <h2 className="text-[15px] font-semibold">Код школы</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Ученики и учителя вводят его на экране входа вместе со своим логином. Если код утёк —
          смените: старый перестанет работать сразу, логины и пароли останутся прежними.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="cf-pill flex items-center gap-2 px-3.5 py-2 font-mono text-[15px] font-semibold"
            onClick={async () => {
              await navigator.clipboard.writeText(school.school.code)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {school.school.code}
          </button>
          <button className="cf-btn-ghost px-3 text-[12.5px]" onClick={() => void regenerate()}>
            <RefreshCw size={14} /> Сменить код
          </button>
        </div>
      </section>

      {school.schools.length > 1 && (
        <section className="cf-card p-4">
          <h2 className="text-[15px] font-semibold">Школа</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-3">Вы администратор нескольких школ</p>
          <select
            className="cf-input mt-3 w-full max-w-sm"
            value={school.schoolId ?? ''}
            onChange={(e) => school.setSchoolId(e.target.value)}
          >
            {school.schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </section>
      )}

      {isOwner && (
        <section className="cf-card border-red-500/25 p-4">
          <h2 className="text-[15px] font-semibold">Удалить школу</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            Удалятся параллели, классы, ученики, учителя, предметы, группы и назначения.
            Пространства с журналами и оценками останутся — их удаляют отдельно.
            Аккаунты, выданные ученикам, тоже останутся; их отключают в Supabase.
          </p>
          <button className="cf-btn-ghost mt-3 px-4 text-red-500" onClick={() => setConfirm(true)}>
            <Trash2 size={15} /> Удалить школу
          </button>
        </section>
      )}

      <ConfirmDialog
        open={confirm}
        title={`Удалить школу «${school.school.name}»?`}
        description="Это действие нельзя отменить."
        confirmLabel="Удалить"
        danger
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false)
          if (!school.schoolId) return
          try {
            await db.deleteSchool(school.schoolId)
            school.setSchoolId(null)
            await school.refresh()
            navigate('/admin', { replace: true })
          } catch (e) {
            toast.error(e)
          }
        }}
      />
    </div>
  )
}
