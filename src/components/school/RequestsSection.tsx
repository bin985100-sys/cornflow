import { useCallback, useEffect, useState } from 'react'
import { Check, Inbox, UserMinus, UserPlus, X } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { EmptyState, RowSkeleton, Segmented } from '@/components/ui/primitives'
import { cx, formatDate } from '@/lib/utils'
import type { SchoolApi } from '@/hooks/useSchool'
import type { RosterRequestStatus, RosterRequestView } from '@/lib/types'

const STATUS_LABEL: Record<RosterRequestStatus, string> = {
  pending: 'Ждут решения',
  approved: 'Приняты',
  declined: 'Отклонены',
}

/**
 * Очередь запросов на изменение состава групп.
 *
 * Решение применяется прямо отсюда: принять — значит сразу добавить или убрать
 * ученика, иначе админу пришлось бы повторять то же самое в справочнике.
 */
export function RequestsSection({ school }: { school: SchoolApi }) {
  const toast = useToast()
  const [status, setStatus] = useState<RosterRequestStatus>('pending')
  const [rows, setRows] = useState<RosterRequestView[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!school.schoolId) return
    setLoading(true)
    try {
      setRows(await db.listRosterRequests(school.schoolId, status))
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }, [school.schoolId, status, toast])

  useEffect(() => {
    void load()
  }, [load])

  async function decide(row: RosterRequestView, approve: boolean) {
    setBusy(row.id)
    try {
      await db.decideRosterRequest(row.id, approve)
      await Promise.all([load(), school.refresh()])
      toast.success(approve ? 'Принято и применено' : 'Отклонено')
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-4">
      <Segmented
        value={status}
        onChange={(v) => setStatus(v as RosterRequestStatus)}
        options={(Object.keys(STATUS_LABEL) as RosterRequestStatus[]).map((k) => ({
          value: k,
          label: STATUS_LABEL[k],
        }))}
      />

      {loading ? (
        <RowSkeleton count={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={status === 'pending' ? 'Запросов нет' : 'Здесь пусто'}
          description="Учитель просит изменить состав своей группы из раздела «Мои группы». Решение применяется сразу — отдельно править справочник не нужно."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="cf-card flex flex-wrap items-center gap-3 p-3.5">
              <span
                className={cx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  row.kind === 'add' ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-ink-2',
                )}
              >
                {row.kind === 'add' ? <UserPlus size={15} /> : <UserMinus size={15} />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">
                  {row.kind === 'add' ? 'Добавить' : 'Убрать'} {row.person_name}
                  <span className="text-ink-3"> · {row.group_name}</span>
                </p>
                <p className="text-[12px] text-ink-3">
                  {row.requested_by_name} · {formatDate(row.created_at)}
                  {row.note ? ` · ${row.note}` : ''}
                </p>
              </div>

              {row.status === 'pending' && school.isAdmin ? (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    className="cf-btn-ghost px-3 text-[12.5px]"
                    disabled={busy === row.id}
                    onClick={() => void decide(row, false)}
                  >
                    <X size={14} /> Отклонить
                  </button>
                  <button
                    className="cf-btn-brand px-3 text-[12.5px]"
                    disabled={busy === row.id}
                    onClick={() => void decide(row, true)}
                  >
                    <Check size={14} /> Принять
                  </button>
                </div>
              ) : (
                <span className="cf-pill shrink-0 px-2.5 py-[3px] text-[11.5px] text-ink-3">
                  {row.status === 'approved' ? 'принят' : 'отклонён'}
                  {row.decided_at ? ` · ${formatDate(row.decided_at)}` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-1.5 text-[12px] text-ink-3">
        <Inbox size={13} className="mt-[2px] shrink-0" />
        Принятый запрос сразу меняет состав группы. Ученик появится в журнале курса или исчезнет из
        него — без второго захода в справочник.
      </p>
    </section>
  )
}
