import { useEffect, useMemo, useState } from 'react'
import { BarChart3, BookOpen, CalendarCheck2, Grid3x3, Settings2 } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useGradebook } from '@/hooks/useGradebook'
import { GradeGrid } from '@/components/gradebook/GradeGrid'
import { DiaryView } from '@/components/gradebook/DiaryView'
import { AttendanceBoard } from '@/components/gradebook/AttendanceBoard'
import { AnalyticsView } from '@/components/gradebook/AnalyticsView'
import { GradebookSettings } from '@/components/gradebook/GradebookSettings'
import { ItemModal } from '@/components/gradebook/ItemModal'
import { EmptyState, RowSkeleton, Segmented } from '@/components/ui/primitives'
import { Avatar } from '@/components/ui/primitives'
import type { GradeItem } from '@/lib/types'

type Tab = 'grid' | 'diary' | 'attendance' | 'analytics' | 'settings'

/**
 * Журнал пространства. Для учителя — сетка «ученики × работы», посещаемость,
 * аналитика и настройки шкалы. Для ученика — личный дневник.
 */
export function GradebookPage() {
  const { space } = useApp()
  const { user } = useAuth()
  const gb = useGradebook()
  const [tab, setTab] = useState<Tab>(gb.canEdit ? 'grid' : 'diary')
  const [itemModal, setItemModal] = useState<{ open: boolean; item: GradeItem | null }>({
    open: false,
    item: null,
  })
  const [diaryStudent, setDiaryStudent] = useState<string | null>(null)

  useEffect(() => {
    setTab(gb.canEdit ? 'grid' : 'diary')
  }, [gb.canEdit])

  const tabs = useMemo(() => {
    const base: Array<{ value: Tab; label: React.ReactNode }> = []
    if (gb.canEdit) base.push({ value: 'grid', label: <><Grid3x3 size={14} /> Журнал</> })
    base.push({ value: 'diary', label: <><BookOpen size={14} /> Дневник</> })
    base.push({ value: 'attendance', label: <><CalendarCheck2 size={14} /> Посещаемость</> })
    if (gb.canEdit) {
      base.push({ value: 'analytics', label: <><BarChart3 size={14} /> Аналитика</> })
      base.push({ value: 'settings', label: <><Settings2 size={14} /> Настройки</> })
    }
    return base
  }, [gb.canEdit])

  const activeStudent = gb.canEdit
    ? diaryStudent ?? gb.students[0]?.id ?? null
    : user?.id ?? gb.students[0]?.id ?? null

  if (!space) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <EmptyState
          title="Нет активного пространства"
          description="Создайте пространство или войдите в чужое по коду — журнал живёт внутри пространства."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 px-5 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">
            {gb.canEdit ? 'Журнал' : 'Дневник'}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {space.name} · шкала «{gb.defaultScale.name}»
            {gb.period ? ` · ${gb.period.name}` : ' · весь год'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="cf-input py-2 text-[13px]"
            value={gb.periodId ?? ''}
            onChange={(e) => gb.setPeriodId(e.target.value || null)}
          >
            <option value="">Весь год</option>
            {gb.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="overflow-x-auto pb-1">
        <Segmented value={tab} onChange={setTab} options={tabs} size="sm" />
      </div>

      {gb.loading ? (
        <RowSkeleton count={6} />
      ) : (
        <>
          {tab === 'grid' && (
            <GradeGrid
              gb={gb}
              onCreateItem={() => setItemModal({ open: true, item: null })}
              onEditItem={(item) => setItemModal({ open: true, item })}
            />
          )}

          {tab === 'diary' && (
            <div className="space-y-4">
              {gb.canEdit && gb.students.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {gb.students.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setDiaryStudent(s.id)}
                      className={
                        'inline-flex items-center gap-2 rounded-pill border px-2.5 py-1.5 text-[12.5px] transition ' +
                        (activeStudent === s.id
                          ? 'border-brand bg-brand-soft text-brand'
                          : 'border-line bg-surface text-ink-2 hover:bg-surface-2')
                      }
                    >
                      <Avatar name={s.name} src={s.avatar} size={20} />
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              {activeStudent ? (
                <DiaryView gb={gb} studentId={activeStudent} />
              ) : (
                <EmptyState title="Нет учеников" art="tasks" />
              )}
            </div>
          )}

          {tab === 'attendance' && <AttendanceBoard gb={gb} />}
          {tab === 'analytics' && <AnalyticsView gb={gb} />}
          {tab === 'settings' && <GradebookSettings gb={gb} />}
        </>
      )}

      <ItemModal
        gb={gb}
        open={itemModal.open}
        item={itemModal.item}
        onClose={() => setItemModal({ open: false, item: null })}
      />
    </div>
  )
}
