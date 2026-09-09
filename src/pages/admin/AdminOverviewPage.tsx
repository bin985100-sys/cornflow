import { Link } from 'react-router-dom'
import { BookOpen, Building2, GraduationCap, KeyRound, Layers, Users } from 'lucide-react'
import { useSchoolCtx } from '@/context/SchoolContext'

/** Обзор: сколько чего заведено и что делать дальше. */
export function AdminOverviewPage() {
  const school = useSchoolCtx()

  const withoutAccount = school.people.filter((p) => !p.user_id && p.role !== 'admin').length
  const cards = [
    { to: '/admin/classes', icon: Layers, label: 'Классы', value: school.classes.length, hint: `параллелей: ${school.parallels.length}` },
    { to: '/admin/students', icon: Users, label: 'Ученики', value: school.students.length, hint: withoutAccount ? `без аккаунта: ${withoutAccount}` : 'у всех есть доступ' },
    { to: '/admin/teachers', icon: Users, label: 'Учителя', value: school.teachers.length, hint: 'включая администраторов' },
    { to: '/admin/subjects', icon: BookOpen, label: 'Предметы', value: school.subjects.length, hint: 'с типами оценивания' },
    { to: '/admin/groups', icon: GraduationCap, label: 'Группы', value: school.groups.length, hint: `смешанных: ${school.groups.filter((g) => g.kind === 'mixed').length}` },
    { to: '/admin/courses', icon: Building2, label: 'Курсы', value: school.assignments.length, hint: 'предмет × группа × учитель' },
  ]

  return (
    <div className="animate-fade-up space-y-5">
      <header>
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">{school.school.name}</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Код школы <b className="font-mono">{school.school.code}</b> — его вводят на экране входа
          вместе с логином и паролем, которые выдали вы.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="cf-card cf-hoverable p-4">
            <c.icon size={17} className="text-ink-3" />
            <p className="mt-2 text-[26px] font-semibold leading-none">{c.value}</p>
            <p className="mt-1.5 text-[13.5px] font-medium">{c.label}</p>
            <p className="text-[12px] text-ink-3">{c.hint}</p>
          </Link>
        ))}
      </div>

      {school.parallels.length === 0 && (
        <Next
          title="Начните с параллелей и классов"
          body="Без классов некуда распределять учеников и не к чему привязывать предметы."
          to="/admin/classes"
          action="К классам"
        />
      )}
      {school.parallels.length > 0 && school.students.length === 0 && (
        <Next
          title="Добавьте учеников"
          body="По одному или вставкой списка из таблицы — по человеку на строку."
          to="/admin/students"
          action="К ученикам"
        />
      )}
      {withoutAccount > 0 && (
        <Next
          icon={KeyRound}
          title={`Без аккаунта: ${withoutAccount}`}
          body="Пока не выдан логин и пароль, человек не может войти в школу."
          to="/admin/students"
          action="Выдать доступ"
        />
      )}
      {school.students.length > 0 && school.subjects.length === 0 && (
        <Next
          title="Заведите предметы"
          body="У предмета — название, классы где он идёт, и типы оценивания для журнала."
          to="/admin/subjects"
          action="К предметам"
        />
      )}
      {school.subjects.length > 0 && school.groups.length > 0 && school.assignments.length === 0 && (
        <Next
          title="Соберите курс"
          body="Предмет + группа + учитель — журнал создастся сам, ученики группы окажутся в нём."
          to="/admin/courses"
          action="К курсам"
        />
      )}
    </div>
  )
}

function Next({
  title,
  body,
  to,
  action,
  icon: Icon = Building2,
}: {
  title: string
  body: string
  to: string
  action: string
  icon?: typeof Building2
}) {
  return (
    <div className="cf-card flex flex-wrap items-center gap-3 border-brand/25 bg-brand-soft/40 p-4">
      <Icon size={18} className="text-brand" />
      <div className="min-w-[200px] flex-1">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="text-[12.5px] text-ink-3">{body}</p>
      </div>
      <Link to={to} className="cf-btn-brand px-4">
        {action}
      </Link>
    </div>
  )
}
