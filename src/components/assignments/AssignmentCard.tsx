import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Paperclip,
  Repeat,
  Users,
  Video,
} from 'lucide-react'
import type { AssignmentView } from '@/lib/types'
import { cardPalette, cx, dueLabel, excerpt, formatDate, formatTime, stripHtml } from '@/lib/utils'
import { EventChip } from '@/components/ui/primitives'

/**
 * Карточка задания. Метаданные показаны теми же чипами, что и в календаре:
 * дата — синий, повтор — оранжевый, встреча — зелёный, место — синий,
 * участники — красный, время — фиолетовый.
 */
export function AssignmentCard({
  assignment,
  index = 0,
  isTeacher,
  onOpen,
}: {
  assignment: AssignmentView
  index?: number
  isTeacher: boolean
  onOpen: () => void
}) {
  const due = dueLabel(assignment.due_date)
  const palette = cardPalette[due.tone === 'late' ? 'red' : due.tone === 'soon' ? 'yellow' : 'blue']
  const submitted = assignment.submissions.filter((s) => s.status !== 'assigned').length
  const done = Boolean(assignment.mySubmission && assignment.mySubmission.status !== 'assigned')

  return (
    <article
      onClick={onOpen}
      className="cf-hoverable flex cursor-pointer animate-fade-up flex-col overflow-hidden rounded-card border shadow-card"
      style={{
        background: palette.bg,
        borderColor: `color-mix(in srgb, ${palette.accent} 20%, transparent)`,
        animationDelay: `${Math.min(index, 10) * 40}ms`,
      }}
    >
      <div className="h-[7px] w-full" style={{ background: palette.accent }} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{assignment.title}</h3>
          {!isTeacher && done && (
            <span
              className="flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold"
              style={{ background: 'var(--cf-green-bg)', color: 'var(--cf-green-acc)' }}
            >
              <CheckCircle2 size={11} /> Сдано
            </span>
          )}
        </div>

        {assignment.description && (
          <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2/90">
            {excerpt(stripHtml(assignment.description), 130)}
          </p>
        )}

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          <EventChip icon={CalendarDays} color="blue">
            {assignment.due_date ? formatDate(assignment.due_date) : 'Без срока'}
          </EventChip>
          {assignment.due_date && (
            <EventChip icon={Clock} color="purple">
              {formatTime(assignment.due_date)}
            </EventChip>
          )}
          <EventChip icon={Repeat} color="orange">
            {due.text}
          </EventChip>
          {assignment.attachedMaterials.length > 0 && (
            <EventChip icon={Paperclip} color="teal">
              {assignment.attachedMaterials.length} материал(ов)
            </EventChip>
          )}
          {isTeacher && (
            <EventChip icon={Users} color="red">
              Сдали: {submitted}
            </EventChip>
          )}
        </div>
      </div>
    </article>
  )
}

/** Компактный набор чипов — используется в модалке и на дашборде. */
export function AssignmentChips({ assignment }: { assignment: AssignmentView }) {
  const due = dueLabel(assignment.due_date)
  return (
    <div className="flex flex-wrap gap-1.5">
      <EventChip icon={CalendarDays} color="blue">
        {assignment.due_date ? formatDate(assignment.due_date) : 'Без срока'}
      </EventChip>
      {assignment.due_date && (
        <EventChip icon={Clock} color="purple">
          {formatTime(assignment.due_date)}
        </EventChip>
      )}
      <EventChip icon={Repeat} color="orange">
        {due.text}
      </EventChip>
      <EventChip icon={Users} color="red">
        {assignment.submissions.length} участник(ов)
      </EventChip>
      {assignment.attachedMaterials.length > 0 && (
        <EventChip icon={Paperclip} color="teal">
          {assignment.attachedMaterials.length} вложений
        </EventChip>
      )}
    </div>
  )
}

/** Мини-чип для календаря */
export function CalendarChip({
  label,
  tone,
  onClick,
  kind = 'assignment',
}: {
  label: string
  tone: 'late' | 'soon' | 'ok'
  onClick?: () => void
  kind?: 'assignment' | 'task' | 'grade'
}) {
  const color = tone === 'late' ? 'red' : tone === 'soon' ? 'orange' : kind === 'task' ? 'green' : 'blue'
  const Icon = kind === 'task' ? CheckCircle2 : kind === 'assignment' ? MapPin : Video
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cx('w-full text-left', onClick && 'cursor-pointer')}
    >
      <EventChip
        icon={Icon}
        color={color}
        compact
        title={label}
        className="w-full max-w-full overflow-hidden"
      >
        <span className="min-w-0 truncate">{label}</span>
      </EventChip>
    </button>
  )
}
