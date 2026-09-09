import { useState } from 'react'
import { Building2, Check, Copy, Plus, RefreshCw } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { useSchool } from '@/hooks/useSchool'
import { ClassesSection } from '@/components/school/ClassesSection'
import { GroupsSection } from '@/components/school/GroupsSection'
import { PeopleSection } from '@/components/school/PeopleSection'
import { SubjectsSection } from '@/components/school/SubjectsSection'
import { TeachingSection } from '@/components/school/TeachingSection'
import { EmptyState, RowSkeleton } from '@/components/ui/primitives'
import { cx, inviteCode } from '@/lib/utils'

type Tab = 'classes' | 'students' | 'teachers' | 'subjects' | 'groups' | 'teaching'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'classes', label: 'Классы' },
  { id: 'students', label: 'Ученики' },
  { id: 'teachers', label: 'Учителя' },
  { id: 'subjects', label: 'Предметы' },
  { id: 'groups', label: 'Группы' },
  { id: 'teaching', label: 'Курсы' },
]

/**
 * Школа — отдельный интерфейс над пространствами. Здесь администратор
 * держит весь справочник: параллели и классы, учеников и учителей,
 * предметы, группы и назначения предметов группам.
 */
export function SchoolPage() {
  const school = useSchool()
  const [tab, setTab] = useState<Tab>('classes')

  if (school.loading) {
    return (
      <div className="space-y-4">
        <RowSkeleton count={5} />
      </div>
    )
  }

  if (!school.schoolId) return <NoSchool onCreated={school.refresh} />

  return (
    <div className="animate-fade-up space-y-4">
      <SchoolHeader school={school} />

      <div className="cf-no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'cf-pill shrink-0 px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              tab === t.id ? 'border-brand/30 bg-brand-soft text-brand' : 'text-ink-2 hover:bg-surface-2',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'classes' && <ClassesSection school={school} />}
      {tab === 'students' && <PeopleSection school={school} role="student" />}
      {tab === 'teachers' && <PeopleSection school={school} role="teacher" />}
      {tab === 'subjects' && <SubjectsSection school={school} />}
      {tab === 'groups' && <GroupsSection school={school} />}
      {tab === 'teaching' && <TeachingSection school={school} />}
    </div>
  )
}

function SchoolHeader({ school }: { school: ReturnType<typeof useSchool> }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  async function regenerate() {
    if (!school.schoolId) return
    try {
      await db.updateSchool(school.schoolId, { code: inviteCode() })
      await school.refresh()
      toast.success('Код школы обновлён — старый больше не работает')
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <header className="cf-card flex flex-wrap items-center gap-3 p-4">
      <Building2 size={18} className="text-brand" />
      <div>
        <h1 className="text-[17px] font-semibold">{school.school.name}</h1>
        <p className="text-[12.5px] text-ink-3">
          {school.isAdmin ? 'Вы администратор школы' : 'Справочник ведёт администратор'} ·
          учеников: {school.students.length} · учителей: {school.teachers.length}
        </p>
      </div>

      {school.schools.length > 1 && (
        <select
          className="cf-input h-9 w-44 py-0 text-[12.5px]"
          value={school.schoolId ?? ''}
          onChange={(e) => school.setSchoolId(e.target.value)}
        >
          {school.schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          className="cf-pill flex items-center gap-1.5 px-3 py-1.5 font-mono text-[13px] font-semibold"
          title="Код школы — его вводят на экране «Войти в школу»"
          onClick={async () => {
            await navigator.clipboard.writeText(school.school.code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {school.school.code}
        </button>
        {school.isAdmin && (
          <button className="cf-icon-btn" onClick={() => void regenerate()} title="Сменить код школы">
            <RefreshCw size={15} />
          </button>
        )}
      </div>
    </header>
  )
}

function NoSchool({ onCreated }: { onCreated: () => Promise<void> }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await db.createSchool(name)
      await onCreated()
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <EmptyState
        title="Школы пока нет"
        description="Школа — это уровень над пространствами: классы, ученики, учителя, предметы и группы. Всё заводит администратор, он же выдаёт логины и пароли."
      />
      <div className="cf-card mx-auto max-w-md p-4">
        <span className="mb-1 block text-[12.5px] text-ink-2">Название школы</span>
        <div className="flex flex-wrap gap-2">
          <input
            className="cf-input min-w-[180px] flex-1"
            placeholder="Школа №5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
          />
          <button className="cf-btn-brand px-4" disabled={busy || !name.trim()} onClick={() => void create()}>
            <Plus size={15} /> Создать
          </button>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">
          Создатель школы становится её администратором.
        </p>
      </div>
    </div>
  )
}
