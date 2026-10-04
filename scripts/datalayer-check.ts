/**
 * Проверка слоя данных без браузера: тот же mock-провайдер, что и в приложении.
 *
 * Запуск: npm run check:data
 *
 * Сквозной сценарий школы — класс со ступенью, группа, курс, занятие с теорией
 * и дедлайном, автоматическое КТП, сдача работы, чат, возврат на доработку,
 * оповещения, закрытие с оценкой в журнал, роли и отчётные периоды. Браузерный
 * прогон этого же пути долгий и хрупкий, а здесь он занимает секунду.
 */
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
} as Storage

// провайдер подписывается на события окна — в Node его надо подменить
;(globalThis as unknown as { window: unknown }).window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
  setInterval: () => 0,
  clearInterval: () => undefined,
}

const { MockProvider } = await import('@/lib/db/mock')

const ok = (name: string, cond: boolean, extra = '') =>
  console.log(`${cond ? 'ОК  ' : 'ПРОВАЛ'} ${name}${cond || !extra ? '' : ' — ' + extra}`)

const db = new MockProvider()

const teacher = await db.signUp({ name: 'Учитель', email: 't@x.test', password: 'secret123', role: 'teacher' })
const school = await db.createSchool('Лицей')
const parallel = await db.createParallel(school.id, '7')
const klass = await db.createClass(school.id, parallel.id, 'А', 'middle')
ok('ступень класса сохранилась', klass.level === 'middle')

const subject = await db.createSubject({ school_id: school.id, name: 'Алгебра' })
const student = await db.createPerson({
  school_id: school.id,
  role: 'student',
  last_name: 'Соколов',
  first_name: 'Егор',
  class_id: klass.id,
  login: 'sokolov.e',
})
const [acc] = await db.createAccounts(school.id, [
  { person_id: student.id, login: 'sokolov.e', password: 'pass1234' },
])
ok('аккаунт ученика заведён', acc.ok, acc.error ?? '')

const teacherPerson = (await db.loadSchool(school.id)).people.find((p) => p.user_id === teacher.id)!
const group = await db.createGroup({
  school_id: school.id,
  name: '7А алгебра',
  kind: 'class',
  class_id: klass.id,
  member_ids: [student.id],
  teacher_ids: [teacherPerson.id],
})
ok('ученик в группе', group.member_ids.includes(student.id))

const course = await db.createTeaching({
  school_id: school.id,
  subject_id: subject.id,
  group_id: group.id,
  teacher_ids: [teacherPerson.id],
})
ok('курс создал пространство', Boolean(course.space_id))

// ---- КТП заводится само при первом занятии ----
const lesson = await db.createLesson({
  space_id: course.space_id!,
  title: 'Урок 1',
  date: '2026-10-05',
  theory: 'Квадратный трёхчлен',
  task: 'Разобрать №12',
  homework: '№19–24',
  homework_due: '2026-10-20',
})
ok('теория у занятия', lesson.theory === 'Квадратный трёхчлен')
ok('срок домашки', lesson.homework_due === '2026-10-20')
await db.attachLessonToPlan(lesson.id)

const plans = await db.listCurricula(school.id)
ok('авто-КТП заведено', plans.length === 1 && plans[0].is_auto, JSON.stringify(plans.map((x) => x.name)))
ok('занятие попало в план', plans[0]?.loose.length === 1, JSON.stringify(plans[0]?.loose.map((l) => l.title)))

const topic = await db.createTopic(plans[0].id, 'Квадратные уравнения')
await db.createPlanLesson({ curriculum_id: plans[0].id, topic_id: topic.id, title: 'Дискриминант' })
const withTopic = (await db.listCurricula(school.id))[0]
ok('тема с уроком', withTopic.topics[0]?.lessons.length === 1)

// копия чужого плана
const copyId = await db.copyCurriculum(plans[0].id, teacherPerson.id, 'Мой вариант')
const copy = (await db.listCurricula(school.id)).find((c) => c.id === copyId)!
ok('копия плана с темами', copy.topics.length === 1 && copy.topics[0].lessons.length === 1)
ok('копия не трогает оригинал', copy.source_id === plans[0].id)

// ---- задание и проверка работ ----
const assignment = await db.createAssignment({
  space_id: course.space_id!,
  title: 'Контрольная №1',
  due_date: '2026-10-25T20:00:00.000Z',
})

// ученик сдаёт
await db.signIn({ email: 'sokolov.e', password: 'pass1234' }).catch(() => undefined)
const studentUser = await db.signInToSchool!({ code: school.code, login: 'sokolov.e', password: 'pass1234' })
ok('ученик вошёл по школьному логину', Boolean(studentUser.id))
const sub = await db.submitAssignment(assignment.id, { comment: 'Сделал' })
ok('работа сдана', sub.status === 'submitted')

// учитель смотрит очередь
await db.signIn({ email: 't@x.test', password: 'secret123' })
const queue = await db.listReviewQueue()
ok('работа в очереди проверки', queue.length === 1 && queue[0].state === 'submitted', JSON.stringify(queue.map((q) => q.state)))
ok('в очереди видно имя ученика', queue[0]?.student_name.includes('Соколов'), queue[0]?.student_name)

// чат
await db.sendSubmissionMessage(sub.id, 'Задачу 5 переделайте')
const msgs = await db.listSubmissionMessages(sub.id)
ok('сообщение в чате работы', msgs.length === 1 && msgs[0].body === 'Задачу 5 переделайте')

// возврат на доработку
const returned = await db.returnSubmission(sub.id, 'В задаче 5 перепутан знак')
ok('работа возвращена', returned.status === 'returned')
ok('счётчик возвратов', returned.revision_count === 1)

// оповещения у ученика
await db.signInToSchool!({ code: school.code, login: 'sokolov.e', password: 'pass1234' })
const notes = await db.listNotifications()
ok('оповещение о возврате', notes.some((n) => n.kind === 'submission_returned'), JSON.stringify(notes.map((n) => n.kind)))
ok('оповещение о сообщении', notes.some((n) => n.kind === 'message'))
await db.markNotificationsRead()
ok('оповещения прочитаны', (await db.listNotifications()).every((n) => n.read_at))

// ученик пересдаёт, учитель закрывает с оценкой в журнал
await db.submitAssignment(assignment.id, { comment: 'Переделал' })
await db.signIn({ email: 't@x.test', password: 'secret123' })
const gb = await db.ensureGradebook(course.space_id!)
const item = await db.createGradeItem({ space_id: course.space_id!, title: 'Контрольная' })
await db.reviewSubmission(sub.id, { grade: 5, comment: 'Теперь верно', grade_item_id: item.id })
const after = await db.listReviewQueue()
ok('работа закрыта', after[0]?.state === 'graded', after[0]?.state)
const snap = await db.loadGradebook(course.space_id!)
const grade = snap.grades.find((g) => g.item_id === item.id && g.student_id === studentUser.id)
ok('оценка ушла в журнал', grade?.score === 5, JSON.stringify(grade))
void gb

// ---- роли ----
await db.setPersonRoles(teacherPerson.id, ['teacher', 'homeroom'])
await db.setPersonClasses(teacherPerson.id, [klass.id])
await db.setParentChildren(teacherPerson.id, [student.id])
const access = (await db.loadSchool(school.id)).access.find((a) => a.person_id === teacherPerson.id)
ok('несколько ролей', access?.roles.includes('teacher') && access?.roles.includes('homeroom'), JSON.stringify(access?.roles))
ok('класс классрука', access?.class_ids.includes(klass.id))
ok('дети родителя', access?.child_ids.includes(student.id))
const memberships = await db.myMemberships()
ok('школы пользователя', memberships.length === 1 && memberships[0].roles.includes('admin'), JSON.stringify(memberships))

// ---- периоды ----
await db.createTermPreset(school.id, '2026-09-01')
const terms = (await db.loadSchool(school.id)).terms
ok('год + 2 полугодия + 5 четвертей', terms.filter((t) => t.kind === 'quarter').length === 5 && terms.filter((t) => t.kind === 'semester').length === 2,
  JSON.stringify(terms.map((t) => t.name)))
ok('летний период есть', terms.some((t) => t.name === 'Летний период'))
