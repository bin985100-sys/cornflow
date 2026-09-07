import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CheckSquare,
  ClipboardList,
  FileUp,
  FolderPlus,
  Link2,
  Notebook,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useCreate } from '@/context/CreateContext'
import { db } from '@/lib/db'
import { cardPalette, dueLabel, plural } from '@/lib/utils'
import { AssignmentCard } from '@/components/assignments/AssignmentCard'
import { GradebookWidget } from '@/components/gradebook/GradebookWidget'
import { MaterialGrid } from '@/components/materials/MaterialGrid'
import { CardSkeletonGrid, EmptyState, ProgressBar } from '@/components/ui/primitives'
import { useToast } from '@/context/ToastContext'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

export function DashboardPage() {
  const { space, materials, assignments, tasks, loading, canEdit, refresh } = useApp()
  const { user, isTeacher } = useAuth()
  const create = useCreate()
  const toast = useToast()

  const recent = useMemo(() => materials.slice(0, 6), [materials])
  const upcoming = useMemo(
    () =>
      assignments
        .filter((a) => a.due_date && dueLabel(a.due_date).tone !== 'ok')
        .slice(0, 3),
    [assignments],
  )
  const openTasks = useMemo(() => tasks.filter((t) => !t.done).slice(0, 5), [tasks])

  const studied = materials.filter((m) => m.progress === 'studied').length
  const percent = materials.length ? Math.round((studied / materials.length) * 100) : 0

  const stats = [
    { label: 'Материалов', value: materials.length, color: 'blue' as const, icon: BookOpen },
    { label: 'Заданий', value: assignments.length, color: 'purple' as const, icon: ClipboardList },
    { label: 'В избранном', value: materials.filter((m) => m.starred).length, color: 'yellow' as const, icon: Star },
    { label: 'Задач открыто', value: tasks.filter((t) => !t.done).length, color: 'green' as const, icon: CheckSquare },
  ]

  if (!space) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <EmptyState
          title="Пока нет ни одного пространства"
          description="Создайте пространство для своего курса или присоединитесь к существующему по коду приглашения."
          action={
            <div className="flex gap-2">
              <button className="cf-btn-brand" onClick={create.newSpace}>
                Создать пространство
              </button>
              <button className="cf-btn-ghost" onClick={create.joinSpace}>
                Войти по коду
              </button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="cf-collage min-h-full">
      <div className="mx-auto max-w-[1400px] space-y-8 px-5 py-7 lg:px-8">
        {/* --------------------------- приветствие --------------------------- */}
        <header className="animate-fade-up">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-3">
            <Sparkles size={14} className="text-brand" />
            {space.name}
          </p>
          <h1 className="mt-1.5 text-[32px] font-extrabold leading-tight tracking-[-0.03em] lg:text-[38px]">
            {greeting()}, {user?.name.split(' ')[0]}
          </h1>
          <p className="mt-1.5 text-[14.5px] text-ink-2">
            {isTeacher
              ? `В пространстве ${plural(materials.length, 'материал', 'материала', 'материалов')} и ${plural(assignments.length, 'задание', 'задания', 'заданий')}.`
              : `Изучено ${studied} из ${materials.length} материалов. ${upcoming.length ? `Ближайших дедлайнов: ${upcoming.length}.` : 'Дедлайнов пока нет.'}`}
          </p>
        </header>

        {/* ------------------------- быстрые действия ------------------------ */}
        {canEdit && (
          <div className="flex flex-wrap gap-2.5">
            <QuickAction icon={FileUp} label="Загрузить файлы" onClick={() => create.newMaterial({ kind: 'file' })} color="blue" />
            <QuickAction icon={Notebook} label="Написать конспект" onClick={() => create.newMaterial({ kind: 'note' })} color="yellow" />
            <QuickAction icon={Link2} label="Добавить ссылку" onClick={() => create.newMaterial({ kind: 'link' })} color="green" />
            <QuickAction icon={FolderPlus} label="Новая папка" onClick={() => create.newFolder(null)} color="purple" />
            {isTeacher && (
              <QuickAction icon={ClipboardList} label="Новое задание" onClick={create.newAssignment} color="red" />
            )}
          </div>
        )}

        {/* ------------------------------ статистика -------------------------- */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s, i) => {
            const palette = cardPalette[s.color]
            return (
              <div
                key={s.label}
                className="cf-hoverable animate-fade-up overflow-hidden rounded-card border shadow-card"
                style={{
                  background: palette.bg,
                  borderColor: `color-mix(in srgb, ${palette.accent} 20%, transparent)`,
                  animationDelay: `${i * 50}ms`,
                }}
              >
                <div className="h-[6px]" style={{ background: palette.accent }} />
                <div className="p-4">
                  <s.icon size={18} style={{ color: palette.accent }} />
                  <p className="mt-2.5 text-[28px] font-extrabold leading-none text-ink">{s.value}</p>
                  <p className="mt-1 text-[12.5px] text-ink-2">{s.label}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* ---------------------------- журнал ------------------------------- */}
        <GradebookWidget />

        {/* ------------------------- прогресс изучения ------------------------ */}
        {!isTeacher && materials.length > 0 && (
          <section className="cf-card animate-fade-up p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[15px]">
                <TrendingUp size={16} className="text-brand" /> Прогресс по материалам
              </h2>
              <span className="text-[13px] font-semibold text-ink">{percent}%</span>
            </div>
            <ProgressBar value={percent} color="green" />
            <p className="mt-2 text-[12.5px] text-ink-3">
              Изучено {studied} из {materials.length}. Отмечайте материалы как «Изучено» — прогресс виден преподавателю.
            </p>
          </section>
        )}

        {/* ----------------------------- дедлайны ----------------------------- */}
        {upcoming.length > 0 && (
          <section>
            <SectionHeader title="Ближайшие дедлайны" to="/app/assignments" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {upcoming.map((a, i) => (
                <AssignmentCard
                  key={a.id}
                  assignment={a}
                  index={i}
                  isTeacher={isTeacher}
                  onOpen={() => create.openAssignment(a)}
                />
              ))}
            </div>
          </section>
        )}

        {/* --------------------------- задачи и материалы --------------------- */}
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <section>
            <SectionHeader title="Недавние материалы" to="/app/library" />
            {loading ? (
              <CardSkeletonGrid count={4} />
            ) : (
              <MaterialGrid
                materials={recent}
                view="grid"
                columns="narrow"
                empty={
                  <EmptyState
                    title="Здесь появятся ваши материалы"
                    description="Перетащите файлы в окно приложения или нажмите «Создать» в левом меню."
                    action={
                      canEdit ? (
                        <button className="cf-btn-brand" onClick={() => create.newMaterial({ kind: 'file' })}>
                          Загрузить первый файл
                        </button>
                      ) : undefined
                    }
                  />
                }
              />
            )}
          </section>

          <section>
            <SectionHeader title="Мои задачи" to="/app/tasks" />
            <div className="cf-card divide-y divide-line overflow-hidden">
              {openTasks.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-ink-3">Все задачи выполнены 🎉</p>
              ) : (
                openTasks.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-start gap-2.5 px-4 py-3 transition duration-200 hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={async () => {
                        try {
                          await db.updateTask(t.id, { done: !t.done })
                          await refresh()
                        } catch (e) {
                          toast.error(e)
                        }
                      }}
                      className="mt-0.5 h-[17px] w-[17px] shrink-0 accent-[rgb(var(--cf-brand))]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] text-ink">{t.title}</span>
                      {t.due_date && (
                        <span className="block text-[11.5px] text-ink-3">{dueLabel(t.due_date).text}</span>
                      )}
                    </span>
                  </label>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, to }: { title: string; to: string }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <h2 className="text-[18px] tracking-[-0.02em]">{title}</h2>
      <Link
        to={to}
        className="flex items-center gap-1 rounded-pill px-2.5 py-1 text-[13px] font-medium text-brand transition duration-200 hover:bg-brand-soft"
      >
        Все <ArrowRight size={13} />
      </Link>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  color,
}: {
  icon: typeof FileUp
  label: string
  onClick: () => void
  color: 'blue' | 'yellow' | 'green' | 'purple' | 'red'
}) {
  const palette = cardPalette[color]
  return (
    <button
      onClick={onClick}
      className="cf-hoverable flex items-center gap-2.5 rounded-pill border px-4 py-2.5 text-[13.5px] font-medium shadow-card"
      style={{
        background: palette.bg,
        borderColor: `color-mix(in srgb, ${palette.accent} 24%, transparent)`,
        color: palette.accent,
      }}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}
