import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider } from '@/context/AppContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { CreateProvider } from '@/context/CreateContext'
import { ToastProvider } from '@/context/ToastContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { Logo } from '@/components/layout/Logo'
import { QuizzesPage } from '@/pages/QuizzesPage'
import { AssignmentsPage } from '@/pages/AssignmentsPage'
import { AuthPage } from '@/pages/AuthPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { JoinPage } from '@/pages/JoinPage'
import { GradebookPage } from '@/pages/GradebookPage'
import { LandingPage } from '@/pages/LandingPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { ProgressPage } from '@/pages/ProgressPage'
import { SchoolPage } from '@/pages/SchoolPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { StarredPage } from '@/pages/StarredPage'
import { TasksPage } from '@/pages/TasksPage'
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
        <Route path="tasks" element={<TasksPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="starred" element={<StarredPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="school" element={<SchoolPage />} />
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
      <CreateProvider>{children}</CreateProvider>
    </AppProvider>
  )
}

/** Закрытый маршрут: без сессии уводим на вход и запоминаем, куда шли. */
function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Splash />
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/auth?next=${next}`} replace />
  }
  return <>{children}</>
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
