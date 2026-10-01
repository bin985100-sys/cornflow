import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider } from '@/context/AppContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { CreateProvider } from '@/context/CreateContext'
import { RoleProvider } from '@/context/RoleContext'
import { ToastProvider } from '@/context/ToastContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { Logo } from '@/components/layout/Logo'
import { QuizzesPage } from '@/pages/QuizzesPage'
import { AssignmentsPage } from '@/pages/AssignmentsPage'
import { AuthPage } from '@/pages/AuthPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DiaryPage } from '@/pages/DiaryPage'
import { JoinPage } from '@/pages/JoinPage'
import { GradebookPage } from '@/pages/GradebookPage'
import { LandingPage } from '@/pages/LandingPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { ProgressPage } from '@/pages/ProgressPage'
import { AdminAuthPage } from '@/pages/admin/AdminAuthPage'
import { AdminGate } from '@/components/admin/AdminGate'
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage'
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage'
import {
  AdminClassesPage,
  AdminTermsPage,
  AdminCoursesPage,
  AdminDepartmentsPage,
  AdminGroupsPage,
  AdminStudentsPage,
  AdminSubjectsPage,
  AdminTeachersPage,
} from '@/pages/admin/sections'
import { PlatformGate } from '@/components/platform/PlatformGate'
import { PlatformProvider } from '@/context/PlatformContext'
import {
  PlatformAuditPage,
  PlatformOverviewPage,
  PlatformPeoplePage,
  PlatformSchoolsPage,
  PlatformSpacesPage,
} from '@/pages/platform/sections'
import { PlatformIncidentsPage, PlatformSearchPage } from '@/pages/platform/moderation'
import { SchoolProvider } from '@/context/SchoolContext'
import { SettingsPage } from '@/pages/SettingsPage'
import { StarredPage } from '@/pages/StarredPage'
import { TasksPage } from '@/pages/TasksPage'
import { TeachingPage } from '@/pages/TeachingPage'
import { useTheme } from '@/hooks/useTheme'

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ToastProvider>
  )
}

function Shell() {
  useTheme() // применяем сохранённую тему на старте

  return (
    <Routes>
      {/* ---------------------------- публичная часть --------------------- */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />

      {/* ------------------------- админ-панель школы --------------------- */}
      <Route path="/admin/login" element={<AdminAuthPage />} />
      <Route
        path="/admin"
        element={
          <Protected to="/admin/login">
            <SchoolProvider>
              <AdminGate />
            </SchoolProvider>
          </Protected>
        }
      >
        <Route index element={<AdminOverviewPage />} />
        <Route path="terms" element={<AdminTermsPage />} />
        <Route path="classes" element={<AdminClassesPage />} />
        <Route path="students" element={<AdminStudentsPage />} />
        <Route path="teachers" element={<AdminTeachersPage />} />
        <Route path="departments" element={<AdminDepartmentsPage />} />
        <Route path="subjects" element={<AdminSubjectsPage />} />
        <Route path="groups" element={<AdminGroupsPage />} />
        <Route path="courses" element={<AdminCoursesPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      {/* ---------------------- панель платформы (владелец) --------------- */}
      <Route
        path="/platform"
        element={
          <Protected>
            <PlatformProvider>
              <PlatformGate />
            </PlatformProvider>
          </Protected>
        }
      >
        <Route index element={<PlatformOverviewPage />} />
        <Route path="schools" element={<PlatformSchoolsPage />} />
        <Route path="spaces" element={<PlatformSpacesPage />} />
        <Route path="people" element={<PlatformPeoplePage />} />
        <Route path="search" element={<PlatformSearchPage />} />
        <Route path="incidents" element={<PlatformIncidentsPage />} />
        <Route path="audit" element={<PlatformAuditPage />} />
        <Route path="*" element={<Navigate to="/platform" replace />} />
      </Route>

      {/* ------------------------- приглашение по ссылке ------------------ */}
      <Route
        path="/join/:code"
        element={
          <Protected>
            <Workspace>
              <JoinPage />
            </Workspace>
          </Protected>
        }
      />

      {/* ----------------------------- приложение ------------------------- */}
      <Route
        path="/app"
        element={
          <Protected>
            <Workspace>
              <AppLayout />
            </Workspace>
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="quizzes" element={<QuizzesPage />} />
        <Route path="gradebook" element={<GradebookPage />} />
        {/* единый дневник ученика: все предметы на одном экране */}
        <Route path="diary" element={<DiaryPage />} />
        {/* учитель: все его группы, разложенные по предметам */}
        <Route path="teaching" element={<TeachingPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="starred" element={<StarredPage />} />
        <Route path="progress" element={<ProgressPage />} />
        {/* справочник школы переехал в админ-панель */}
        <Route path="school" element={<Navigate to="/admin" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Провайдеры данных нужны только внутри приложения. */
function Workspace({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <RoleProvider>
        <CreateProvider>{children}</CreateProvider>
      </RoleProvider>
    </AppProvider>
  )
}

/** Закрытый маршрут: без сессии уводим на вход и запоминаем, куда шли. */
function Protected({ children, to = '/auth' }: { children: ReactNode; to?: string }) {
  const { user, loading, offline, retry } = useAuth()
  const location = useLocation()

  if (loading) return <Splash />
  // сервер не ответил: на экран входа вести бессмысленно — войти всё равно
  // не выйдет, а бесконечный сплэш выглядит как сломанное приложение
  if (offline) return <Offline onRetry={retry} />
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    // у админ-панели своя дверь, туда и уводим
    return <Navigate to={to === '/auth' ? `/auth?next=${next}` : to} replace />
  }
  return <>{children}</>
}

/** Бэкенд недоступен: честный экран вместо вечной загрузки. */
function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="cf-collage flex h-screen flex-col items-center justify-center px-6 text-center">
      <div className="animate-fade-up w-full max-w-md rounded-[26px] border border-line bg-surface p-7 shadow-pop">
        <Logo size="md" />
        <h1 className="mt-5 text-[19px] font-semibold tracking-[-0.01em]">
          Не удаётся связаться с сервером
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
          Приложение загрузилось, но база данных не отвечает. Обычно это временно:
          проверьте соединение и попробуйте ещё раз. Если не помогает — сервер проекта
          сейчас недоступен, и остаётся подождать.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button className="cf-btn-brand px-5" onClick={onRetry}>
            Повторить
          </button>
          <a href="/" className="cf-btn-ghost px-5">
            На главную
          </a>
        </div>
      </div>
    </div>
  )
}

function Splash() {
  return (
    <div className="cf-collage flex h-screen flex-col items-center justify-center gap-4">
      <div className="animate-fade-up">
        <Logo size="lg" />
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-pill bg-surface-2">
        <div className="h-full w-1/2 animate-[fade-in_1s_ease-in-out_infinite_alternate] rounded-pill bg-brand" />
      </div>
    </div>
  )
}
