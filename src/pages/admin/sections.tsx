import { ClassesSection } from '@/components/school/ClassesSection'
import { DepartmentsSection } from '@/components/school/DepartmentsSection'
import { GroupsSection } from '@/components/school/GroupsSection'
import { PeopleSection } from '@/components/school/PeopleSection'
import { GradeReasonsSection, LessonKindsSection } from '@/components/school/LessonKindsSection'
import { SubjectsSection } from '@/components/school/SubjectsSection'
import { RequestsSection } from '@/components/school/RequestsSection'
import { ScheduleSection } from '@/components/school/ScheduleSection'
import { SummarySection } from '@/components/school/SummarySection'
import { TermsSection } from '@/components/school/TermsSection'
import { TeachingSection } from '@/components/school/TeachingSection'
import { useSchoolCtx } from '@/context/SchoolContext'

/* Разделы панели: заголовок плюс уже готовый блок справочника. */

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">{title}</h1>
        <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>
      </header>
      {children}
    </div>
  )
}

export function AdminTermsPage() {
  return (
    <Page
      title="Периоды"
      subtitle="Учебный год, полугодия и четверти — по ним считаются своды оценок. Плюс каникулы: на эти дни расписание не ставится."
    >
      <TermsSection school={useSchoolCtx()} />
    </Page>
  )
}

export function AdminSchedulePage() {
  return (
    <Page
      title="Расписание"
      subtitle="Сетка звонков и курсы по ячейкам «день × номер урока». Из неё собирается расписание и ученика, и учителя."
    >
      <ScheduleSection school={useSchoolCtx()} />
    </Page>
  )
}

export function AdminSummaryPage() {
  return (
    <Page
      title="Своды оценок"
      subtitle="Средний балл класса по четвертям и за год. Считается из журналов курсов — отдельно ничего вводить не нужно."
    >
      <SummarySection school={useSchoolCtx()} />
    </Page>
  )
}

export function AdminRequestsPage() {
  return (
    <Page
      title="Запросы"
      subtitle="Учителя просят изменить состав своих групп. Принятый запрос сразу меняет состав — второй раз в справочник заходить не нужно."
    >
      <RequestsSection school={useSchoolCtx()} />
    </Page>
  )
}

export function AdminClassesPage() {
  return (
    <Page title="Классы" subtitle="Параллели и классы внутри них. Название параллели любое — «9» или «Начальная школа».">
      <ClassesSection school={useSchoolCtx()} />
    </Page>
  )
}

export function AdminStudentsPage() {
  return (
    <Page title="Ученики" subtitle="Список школы. Добавляйте по одному или вставкой из таблицы, доступ выдаётся логином и паролем.">
      <PeopleSection school={useSchoolCtx()} role="student" />
    </Page>
  )
}

export function AdminTeachersPage() {
  return (
    <Page title="Учителя" subtitle="Те, кто ведёт курсы. Логин и пароль выдаются так же, как ученикам.">
      <PeopleSection school={useSchoolCtx()} role="teacher" />
    </Page>
  )
}

export function AdminDepartmentsPage() {
  return (
    <Page
      title="МО"
      subtitle="Методические объединения. «Алгебра», «Геометрия» и «Математика» — это МО «Математика»."
    >
      <DepartmentsSection school={useSchoolCtx()} />
    </Page>
  )
}

export function AdminSubjectsPage() {
  return (
    <Page title="Предметы" subtitle="МО, название, классы где предмет можно проводить, и типы оценивания для журнала.">
      <SubjectsSection school={useSchoolCtx()} />
      <LessonKindsSection school={useSchoolCtx()} />
      <GradeReasonsSection school={useSchoolCtx()} />
    </Page>
  )
}

export function AdminGroupsPage() {
  return (
    <Page title="Группы" subtitle="Ученики и ведущие их учителя. Группа класса или параллели ограничена ими, смешанная берёт кого угодно.">
      <GroupsSection school={useSchoolCtx()} />
    </Page>
  )
}

export function AdminCoursesPage() {
  return (
    <Page title="Курсы" subtitle="Предмет × группа × учителя. Журнал создаётся сам и общий для всех учителей курса, ученики группы уже внутри.">
      <TeachingSection school={useSchoolCtx()} />
    </Page>
  )
}
