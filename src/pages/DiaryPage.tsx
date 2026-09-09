import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, CalendarDays, ChevronRight, MessageSquare, TrendingUp } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useSchoolDiary, type SubjectDiary } from '@/hooks/useSchoolDiary'
import { CardSkeletonGrid, EmptyState, ProgressBar, Segmented } from '@/components/ui/primitives'
import { colorForGrade, gradePalette, levelFor, trimNumber } from '@/lib/grading'
import { formatDate, plural } from '@/lib/utils'

/**
 * Единый дневник ученика: все предметы на одном экране.
 *
 * Каждый предмет живёт в своём пространстве — там его ведёт учитель. Ученику
 * незачем ходить по пространствам: здесь собраны средний балл по каждому
 * предмету, свежие оценки, домашние задания и посещаемость.
 */
export function DiaryPage() {
  const diary = useSchoolDiary()
  const app = useApp()
  const navigate = useNavigate()

  if (diary.loading) {
    return (
      <div className="space-y-4">
        <CardSkeletonGrid count={4} />
      </div>
    )
  }

  if (!diary.subjects.length) {
    return (
      <EmptyState
        title="Предметов пока нет"
        description="Дневник наполнится, когда администратор школы добавит вас в группу и назначит ей предмет. Либо когда вы войдёте в курс по коду приглашения."
      />
    )
  }

  const { overall } = diary
  const scale = diary.subjects[0]?.scale ?? null
  const level = overall.percent !== null && scale ? levelFor(overall.percent, scale) : null

  const openSubject = (subject: SubjectDiary) => {
    app.setSpaceId(subject.space.id)
    navigate('/app/gradebook')
  }

  return (
    <div className="animate-fade-up space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">Дневник</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {plural(diary.subjects.length, 'предмет', 'предмета', 'предметов')} ·{' '}
            {diary.wholeYear ? 'весь год' : 'текущий период'}
          </p>
        </div>
        <Segmented
          size="sm"
          value={diary.wholeYear ? 'year' : 'period'}
          onChange={(v) => diary.setWholeYear(v === 'year')}
          options={[
            { value: 'period', label: 'Текущий период' },
            { value: 'year', label: 'Весь год' },
          ]}
        />
      </header>

      {/* ------------------------------ сводка ---------------------------- */}
      <section className="cf-card grid gap-4 p-4 sm:grid-cols-3">
        <Stat
          label="Средний балл"
          value={
            overall.average !== null
              ? trimNumber(overall.average)
              : overall.percent !== null
                ? `${Math.round(overall.percent)}%`
                : '—'
          }
          hint={
            overall.average !== null && overall.scaleMax
              ? `из ${overall.scaleMax} по ${plural(overall.subjects, 'предмету', 'предметам', 'предметам')}`
              : overall.percent !== null
                ? 'шкалы предметов различаются'
                : 'оценок пока нет'
          }
          icon={TrendingUp}
        />
        <Stat
          label="Итоговая отметка"
          value={level ? level.label : '—'}
          hint={overall.percent !== null ? `${Math.round(overall.percent)}% в среднем` : 'нет данных'}
          icon={BookOpen}
          tone={level ? gradePalette[level.color].bg : undefined}
          toneFg={level ? gradePalette[level.color].fg : undefined}
        />
        <Stat
          label="Домашних заданий"
          value={String(diary.subjects.reduce((n, s) => n + s.homework.length, 0))}
          hint="на ближайшие занятия"
          icon={CalendarDays}
        />
      </section>

      {/* ----------------------------- предметы --------------------------- */}
      <section className="grid gap-3 sm:grid-cols-2">
        {diary.subjects.map((subject) => (
          <SubjectCard key={subject.space.id} subject={subject} onOpen={() => openSubject(subject)} />
        ))}
      </section>

      {/* --------------------------- домашние задания --------------------- */}
      <Homework diary={diary.subjects} onOpen={openSubject} />

      {/* ---------------------------- лента оценок ------------------------ */}
      <RecentGrades diary={diary.subjects} />
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  toneFg,
}: {
  label: string
  value: string
  hint: string
  icon: typeof TrendingUp
  tone?: string
  toneFg?: string
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11.5px] uppercase tracking-wide text-ink-3">
        <Icon size={13} /> {label}
      </p>
      <p
        className="mt-1.5 inline-flex min-w-[52px] justify-center rounded-[12px] px-2.5 py-1 text-[26px] font-semibold leading-none"
        style={tone ? { background: tone, color: toneFg } : undefined}
      >
        {value}
      </p>
      <p className="mt-1 text-[12px] text-ink-3">{hint}</p>
    </div>
  )
}

function SubjectCard({ subject, onOpen }: { subject: SubjectDiary; onOpen: () => void }) {
  const { aggregate, scale } = subject
  const level = aggregate.level
  const last = subject.grades.slice(0, 6)

  return (
    <button onClick={onOpen} className="cf-card cf-hoverable p-4 text-left">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{subject.space.name}</h3>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {aggregate.counted
              ? `${plural(aggregate.counted, 'работа', 'работы', 'работ')} · шкала «${scale.name}»`
              : 'оценок пока нет'}
            {subject.pending.length ? ` · впереди: ${subject.pending.length}` : ''}
          </p>
        </div>
        <span
          className="shrink-0 rounded-[12px] px-2.5 py-1 text-[20px] font-semibold leading-none"
          style={
            level
              ? { background: gradePalette[level.color].bg, color: gradePalette[level.color].fg }
              : undefined
          }
        >
          {aggregate.average !== null ? trimNumber(aggregate.average) : '—'}
        </span>
      </header>

      {aggregate.percent !== null && (
        <div className="mt-3">
          <ProgressBar value={aggregate.percent} color={level?.color === 'red' ? 'red' : 'blue'} />
        </div>
      )}

      {last.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {last.map(({ item, grade }) => {
            const tone = colorForGrade(grade, item, scale)
            return (
              <span
                key={item.id}
                title={`${item.title} · ${formatDate(item.date)}`}
                className="rounded-[9px] px-1.5 py-[2px] text-[12px] font-semibold"
                style={tone ? { background: gradePalette[tone].bg, color: gradePalette[tone].fg } : undefined}
              >
                {grade.flag === 'absent' ? 'н' : grade.flag === 'excused' ? 'осв' : trimNumber(grade.score ?? 0)}
              </span>
            )
          })}
        </div>
      )}

      <p className="mt-3 flex items-center gap-1 text-[12.5px] font-medium text-brand">
        Открыть предмет <ChevronRight size={14} />
      </p>
    </button>
  )
}

function Homework({
  diary,
  onOpen,
}: {
  diary: SubjectDiary[]
  onOpen: (s: SubjectDiary) => void
}) {
  const rows = diary
    .flatMap((subject) => subject.homework.map((lesson) => ({ subject, lesson })))
    .sort((a, b) => a.lesson.date.localeCompare(b.lesson.date))
    .slice(0, 12)

  if (!rows.length) return null

  return (
    <section className="cf-card p-4">
      <h2 className="text-[15px] font-semibold">Домашние задания</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-3">По всем предметам, ближайшие сверху</p>
      <div className="mt-3 space-y-2">
        {rows.map(({ subject, lesson }) => (
          <button
            key={lesson.id}
            onClick={() => onOpen(subject)}
            className="flex w-full items-start gap-3 rounded-[14px] border border-line p-3 text-left transition-colors hover:bg-surface-2"
          >
            <span className="shrink-0 rounded-[10px] bg-surface-2 px-2 py-1 text-[11.5px] font-semibold">
              {formatDate(lesson.date)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{subject.space.name}</span>
              <span className="block text-[12.5px] text-ink-2">{lesson.homework}</span>
              {lesson.title && <span className="block text-[11.5px] text-ink-3">{lesson.title}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function RecentGrades({ diary }: { diary: SubjectDiary[] }) {
  const [limit, setLimit] = useState(15)
  const rows = diary
    .flatMap((subject) => subject.grades.map((g) => ({ subject, ...g })))
    .sort((a, b) => b.item.date.localeCompare(a.item.date))

  if (!rows.length) return null

  return (
    <section className="cf-card p-4">
      <h2 className="text-[15px] font-semibold">Последние оценки</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-3">Со всех предметов сразу</p>

      <div className="mt-3 space-y-1.5">
        {rows.slice(0, limit).map(({ subject, item, grade }) => {
          const tone = colorForGrade(grade, item, subject.scale)
          return (
            <div key={item.id + grade.id} className="flex items-start gap-3 rounded-[14px] px-1 py-1.5">
              <span
                className="mt-[1px] w-9 shrink-0 rounded-[10px] py-1 text-center text-[14px] font-semibold"
                style={tone ? { background: gradePalette[tone].bg, color: gradePalette[tone].fg } : undefined}
              >
                {grade.flag === 'absent' ? 'н' : grade.flag === 'excused' ? 'осв' : trimNumber(grade.score ?? 0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{item.title}</span>
                <span className="block text-[12px] text-ink-3">
                  {subject.space.name} · {formatDate(item.date)}
                </span>
                {grade.comment && (
                  <span className="mt-0.5 flex items-start gap-1 text-[12px] text-ink-2">
                    <MessageSquare size={12} className="mt-[2px] shrink-0 text-ink-3" />
                    {grade.comment}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {rows.length > limit && (
        <button
          className="mt-2 w-full rounded-[14px] border border-line py-2 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2"
          onClick={() => setLimit((v) => v + 15)}
        >
          Показать ещё
        </button>
      )}
    </section>
  )
}
