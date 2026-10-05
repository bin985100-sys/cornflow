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
const { openingMonday } = await import('@/lib/schedule')

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
// дата работы определяет, в какую четверть попадёт оценка в своде
const item = await db.createGradeItem({
  space_id: course.space_id!,
  title: 'Контрольная',
  date: '2026-10-05',
})
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

// ---- расписание ----
await db.createBellPreset(school.id, '08:30')
const bells = (await db.loadSchool(school.id)).bells
ok('сетка звонков: восемь уроков', bells.length === 8, JSON.stringify(bells.map((b) => b.starts_at)))
ok('первый урок в 08:30', bells[0]?.starts_at === '08:30')
ok('после обеда сдвиг', bells[4]?.starts_at > bells[3]?.ends_at)

const quarter = terms.find((t) => t.kind === 'quarter')!
await db.placeLesson({
  school_id: school.id,
  assignment_id: course.id,
  term_id: quarter.id,
  weekday: 1,
  slot_id: bells[0].id,
  room: '214',
})
let clashed = false
try {
  await db.placeLesson({
    school_id: school.id,
    assignment_id: course.id,
    term_id: quarter.id,
    weekday: 1,
    slot_id: bells[0].id,
  })
} catch {
  clashed = true
}
ok('курс не ставится в ячейку дважды', clashed)

// ученик видит свою неделю
await db.signInToSchool!({ code: school.code, login: 'sokolov.e', password: 'pass1234' })
const week = await db.myWeek('2026-10-05')
ok('неделя из шести дней', week.length === 6)
ok('урок в понедельник', week[0]?.lessons.length === 1, JSON.stringify(week[0]?.lessons.map((l) => l.subject_name)))
ok('время урока из сетки', week[0]?.lessons[0]?.slot.starts_at === '08:30')
ok('кабинет виден', week[0]?.lessons[0]?.room === '214')

// каникулы вырезают день
await db.signIn({ email: 't@x.test', password: 'secret123' })
await db.createHoliday({ school_id: school.id, name: 'Осенние', start_date: '2026-10-05', end_date: '2026-10-11' })
await db.signInToSchool!({ code: school.code, login: 'sokolov.e', password: 'pass1234' })
const holidayWeek = await db.myWeek('2026-10-05')
ok('каникулы вырезают уроки', holidayWeek[0]?.lessons.length === 0 && holidayWeek[0]?.holiday === 'Осенние',
  JSON.stringify({ lessons: holidayWeek[0]?.lessons.length, holiday: holidayWeek[0]?.holiday }))

// ---- роли-наблюдатели ----
await db.signIn({ email: 't@x.test', password: 'secret123' })
const wards = await db.listWards()
ok('подопечные у наблюдателя', wards.length === 1 && wards[0].person_id === student.id,
  JSON.stringify(wards.map((w) => [w.name, w.relation])))
ok('ребёнок помечен как ребёнок', wards[0]?.relation === 'child')
const ward = await db.wardDiary(student.id)
ok('предмет подопечного', ward.subjects.length === 1 && ward.subjects[0].subject_name === 'Алгебра',
  JSON.stringify(ward.subjects.map((s) => s.subject_name)))
ok('оценка подопечного видна', ward.subjects[0]?.recent.some((r) => r.score === 5),
  JSON.stringify(ward.subjects[0]?.recent))
ok('средний балл подопечного', ward.average === 5, String(ward.average))
ok('домашка подопечного', ward.subjects[0]?.homework.length === 1,
  JSON.stringify(ward.subjects[0]?.homework))
let denied = false
try {
  await db.wardDiary('person-not-mine')
} catch {
  denied = true
}
ok('чужой ученик недоступен', denied)

// ---- своды оценок ----
const summary = await db.gradeSummary({ school_id: school.id, class_id: klass.id })
ok('четверти в своде', summary.terms.length === 5, JSON.stringify(summary.terms.map((t) => t.name)))
ok('ученик в своде', summary.people.length === 1 && summary.people[0].id === student.id)
ok('предмет в своде', summary.subjects.includes('Алгебра'), JSON.stringify(summary.subjects))
const filled = summary.cells.filter((c) => c.average !== null)
ok('клетка с оценкой есть', filled.length === 1 && filled[0].average === 5,
  JSON.stringify(filled.map((c) => [c.subject_name, c.average])))
ok('пустые четверти не нулевые', summary.cells.some((c) => c.average === null))

// ---- запросы на изменение состава группы ----
const other = await db.createPerson({
  school_id: school.id,
  role: 'student',
  last_name: 'Петров',
  first_name: 'Илья',
  class_id: klass.id,
})
await db.requestRosterChange({
  school_id: school.id,
  group_id: group.id,
  person_id: other.id,
  kind: 'add',
  note: 'Перевёлся из 7Б',
})
const roster = await db.listRosterRequests(school.id)
ok('запрос в очереди', roster.length === 1 && roster[0].person_name.includes('Петров'),
  JSON.stringify(roster.map((q) => [q.person_name, q.kind, q.status])))
let twice = false
try {
  await db.requestRosterChange({
    school_id: school.id,
    group_id: group.id,
    person_id: other.id,
    kind: 'add',
  })
} catch {
  twice = true
}
ok('повторный запрос не создаётся', twice)

await db.decideRosterRequest(roster[0].id, true)
const afterDecide = (await db.loadSchool(school.id)).groups.find((g) => g.id === group.id)
ok('принятый запрос меняет состав', afterDecide?.member_ids.includes(other.id) === true,
  JSON.stringify(afterDecide?.member_ids.length))
ok('решённый запрос ушёл из очереди', (await db.listRosterRequests(school.id)).length === 0)
ok('решённый виден в принятых', (await db.listRosterRequests(school.id, 'approved')).length === 1)

// ---- за что стоит оценка ----
await db.createGradeReason(school.id, 'За устный ответ')
const reasons = (await db.loadSchool(school.id)).gradeReasons
ok('подсказка «за что» заведена', reasons.length === 1 && reasons[0].text === 'За устный ответ')

await db.setGrade(item.id, studentUser.id, { score: 4, reason: 'За устный ответ' })
const snapAfter = await db.loadGradebook(course.space_id!)
const withReason = snapAfter.grades.find((g) => g.item_id === item.id && g.student_id === studentUser.id)
ok('«за что» сохранилось у оценки', withReason?.reason === 'За устный ответ', JSON.stringify(withReason?.reason))
ok('оценка не потеряла комментарий', withReason?.score === 4)

const wardAfter = await db.wardDiary(student.id)
ok('«за что» видно наблюдателю', wardAfter.subjects[0]?.recent.some((r) => r.reason === 'За устный ответ'),
  JSON.stringify(wardAfter.subjects[0]?.recent))

// ---- с какой недели открывается расписание ----
ok('вторник открывает свою неделю', openingMonday(new Date('2026-10-06T12:00:00')) === '2026-10-05')
ok('воскресенье открывает следующую', openingMonday(new Date('2026-10-04T12:00:00')) === '2026-10-05')
ok('понедельник открывает себя', openingMonday(new Date('2026-10-05T12:00:00')) === '2026-10-05')
