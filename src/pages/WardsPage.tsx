import { useCallback, useEffect, useMemo, useState } from 'react'
import { Baby, CalendarClock, GraduationCap, UserMinus, Users } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { useRoles } from '@/context/RoleContext'
import { ROLE_LABEL } from '@/hooks/useSchool'
import { Avatar, CardSkeletonGrid, EmptyState, ProgressBar } from '@/components/ui/primitives'
import { trimNumber } from '@/lib/grading'
import { cx, formatDate, plural } from '@/lib/utils'
import type { Ward, WardDiary } from '@/lib/types'

/**
 * Экран наблюдателя: родителя, классного руководителя и завуча.
 *
 * Все трое смотрят на одно и то же — успеваемость подопечных, — и разница
 * только в том, кто попадает в список: дети у родителя, ученики закреплённых
 * классов у классрука и завуча. Поэтому экран один, а не три похожих.
 */
export function WardsPage() {
  const toast = useToast()
  const roles = useRoles()
  const [wards, setWards] = useState<Ward[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [diary, setDiary] = useState<WardDiary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await db.listWards()
      setWards(list)
      setOpenId((id) => id ?? list[0]?.person_id ?? null)
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!openId) return
    let alive = true
    setBusy(true)
    db.wardDiary(openId)
      .then((d) => alive && setDiary(d))
      .catch(() => alive && setDiary(null))
      .finally(() => alive && setBusy(false))
    return () => {
      alive = false
    }
  }, [openId])

  // заголовок подстраивается под роль: родителю «Мои дети», классруку «Мой класс»
  const title = useMemo(() => {
    if (roles.active === 'parent') return 'Мои дети'
    if (roles.active === 'homeroom') return 'Мой класс'
    if (roles.active === 'headteacher') return 'Мои классы'
    return 'Подопечные'
  }, [roles.active])

  if (loading) return <CardSkeletonGrid count={3} />

  if (!wards.length) {
    return (
      <EmptyState
        title="Подопечных пока нет"
        description="Детей родителю и классы классному руководителю или завучу назначает администратор школы — в разделе «Ученики» или «Учителя», кнопкой «Роли»."
      />
    )
  }

  return (
    <div className="animate-fade-up space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">{title}</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Оценки, домашние задания и пропуски. Сдавать работы за ученика нельзя — только смотреть и
          писать учителю.
        </p>
      </header>

      <div className="cf-no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {wards.map((w) => (
          <button
            key={w.person_id}
            onClick={() => setOpenId(w.person_id)}
            className={cx(
              'flex shrink-0 items-center gap-2 rounded-pill border px-3 py-1.5 text-[13px] transition-colors',
              w.person_id === openId
                ? 'border-brand/30 bg-brand-soft font-medium text-brand'
                : 'border-line text-ink-2 hover:bg-surface-2',
            )}
          >
            {w.relation === 'child' ? <Baby size={14} /> : <Users size={14} />}
            {w.name}
            <span className="text-[11.5px] opacity-70">{w.class_label}</span>
          </button>
        ))}
      </div>

      {busy ? (
        <CardSkeletonGrid count={2} />
      ) : !diary ? (
        <EmptyState title="Не удалось открыть" description="Попробуйте выбрать ученика ещё раз." />
      ) : (
        <WardBody diary={diary} />
      )}
    </div>
  )
}

function WardBody({ diary }: { diary: WardDiary }) {
  const withGrades = diary.subjects.filter((s) => s.average !== null)
  const absences = diary.subjects.reduce((n, s) => n + s.absences, 0)
  const lates = diary.subjects.reduce((n, s) => n + s.lates, 0)

  return (
    <div className="space-y-4">
      <section className="cf-card flex flex-wrap items-center gap-4 p-4">
        <Avatar name={diary.ward.name} size={40} />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{diary.ward.name}</p>
          <p className="text-[12.5px] text-ink-3">
            {diary.ward.class_label} ·{' '}
            {diary.ward.relation === 'child' ? 'ваш ребёнок' : ROLE_LABEL.student.toLowerCase()}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-4">
          <Stat
            label="Средний балл"
            value={diary.average !== null ? trimNumber(diary.average) : '—'}
            hint={`по ${plural(withGrades.length, 'предмету', 'предметам', 'предметам')}`}
          />
          <Stat label="Пропуски" value={String(absences)} hint="без уважительной" />
          <Stat label="Опоздания" value={String(lates)} hint="за всё время" />
        </div>
      </section>

      {diary.subjects.length === 0 ? (
        <EmptyState
          title="Предметов пока нет"
          description="Они появятся, когда администратор добавит ученика в группу и назначит ей предмет."
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {diary.subjects.map((s) => (
            <article key={s.space_id} className="cf-card space-y-2 p-3.5">
              <header className="flex items-baseline gap-2">
                <GraduationCap size={15} className="shrink-0 text-ink-3" />
                <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{s.subject_name}</h2>
                <span className="text-[14px] font-semibold">
                  {s.average !== null ? trimNumber(s.average) : '—'}
                </span>
              </header>

              {s.average !== null && s.scale_max && (
                <ProgressBar value={Math.round((s.average / s.scale_max) * 100)} />
              )}

              {s.recent.length > 0 && (
                <ul className="flex flex-wrap gap-1">
                  {s.recent.map((g, i) => (
                    <li
                      key={i}
                      className="cf-pill px-2 py-[2px] text-[11.5px]"
                      title={[g.title, g.reason, formatDate(g.date)].filter(Boolean).join(' · ')}
                    >
                      {g.score ?? '—'}
                    </li>
                  ))}
                </ul>
              )}

              {s.homework.length > 0 && (
                <div className="space-y-1">
                  {s.homework.map((h, i) => (
                    <p key={i} className="flex items-start gap-1.5 text-[12px] text-ink-2">
                      <CalendarClock size={12} className="mt-[3px] shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1">
                        {h.text}
                        {h.due && <span className="text-ink-3"> · до {formatDate(h.due)}</span>}
                      </span>
                    </p>
                  ))}
                </div>
              )}

              {(s.absences > 0 || s.lates > 0) && (
                <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
                  <UserMinus size={12} />
                  {s.absences > 0 && `пропусков: ${s.absences}`}
                  {s.absences > 0 && s.lates > 0 && ' · '}
                  {s.lates > 0 && `опозданий: ${s.lates}`}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <span className="block text-[11px] uppercase tracking-[0.06em] text-ink-3">{label}</span>
      <span className="block text-[18px] font-bold leading-tight">{value}</span>
      <span className="block text-[11px] text-ink-3">{hint}</span>
    </div>
  )
}
