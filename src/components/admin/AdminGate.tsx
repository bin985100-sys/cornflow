import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useSchoolCtx } from '@/context/SchoolContext'
import { AdminSetupPage } from '@/pages/admin/AdminSetupPage'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { RowSkeleton } from '@/components/ui/primitives'

/**
 * Что показать администратору: справочник ещё грузится, школы нет, прав нет
 * или всё в порядке и можно открывать панель.
 */
export function AdminGate() {
  const school = useSchoolCtx()

  if (school.loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <RowSkeleton count={6} />
      </div>
    )
  }

  if (!school.schoolId) return <AdminSetupPage onCreated={school.refresh} />

  if (!school.isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="cf-card max-w-md p-6 text-center">
          <ShieldAlert size={22} className="mx-auto text-ink-3" />
          <h1 className="mt-3 text-[18px] font-semibold">Панель только для администраторов</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            Вы состоите в школе «{school.school.name}», но управлять справочником может только её
            администратор.
          </p>
          <Link to="/app" className="cf-btn-brand mt-4 inline-flex px-4">
            В приложение
          </Link>
        </div>
      </div>
    )
  }

  return <AdminLayout />
}
