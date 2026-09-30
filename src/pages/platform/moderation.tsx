import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  FolderOpen,
  MessageSquare,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/context/ToastContext'
import { usePlatformCtx } from '@/context/PlatformContext'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/primitives'
import { cx } from '@/lib/utils'
import type { PlatformFinding, PlatformIncident } from '@/lib/types'

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

const KIND_ICON = { material: FileText, comment: MessageSquare, assignment: FolderOpen } as const
const KIND_LABEL = { material: 'материал', comment: 'комментарий', assignment: 'задание' } as const

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

/* ------------------------- поиск по содержимому --------------------------- */

export function PlatformSearchPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlatformFinding[]>([])
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const [incident, setIncident] = useState<PlatformFinding | null>(null)

  async function run() {
    if (query.trim().length < 2) return
    setBusy(true)
    setTouched(true)
    try {
      setResults(await db.platformSearch(query))
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  async function hide(f: PlatformFinding, hidden: boolean) {
    if (f.kind === 'assignment') {
      toast.error('Задание скрывается через пространство — откройте его')
      return
    }
    const reason = hidden ? window.prompt('Причина (попадёт в журнал)') : null
    if (hidden && reason === null) return
    try {
      await db.platformHide(f.kind, f.id, hidden, reason, f.title)
      setResults((list) => list.map((x) => (x.id === f.id ? { ...x, is_hidden: hidden } : x)))
      toast.success(hidden ? 'Скрыто из доступа' : 'Снова доступно')
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <Page
      title="Поиск по содержимому"
      subtitle="Материалы, конспекты, комментарии и задания всех школ сразу. Скрытое остаётся в базе — исчезает только из доступа."
    >
      <div className="cf-card flex flex-wrap items-center gap-2 p-3">
        <span className="relative flex-1 min-w-[220px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="cf-input w-full pl-9"
            placeholder="Слово или фраза — минимум два символа"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void run()}
            autoFocus
          />
        </span>
        <button className="cf-btn-brand px-5" disabled={busy || query.trim().length < 2} onClick={() => void run()}>
          Искать
        </button>
        {touched && <span className="text-[13px] text-ink-3">{busy ? 'ищем…' : `найдено: ${results.length}`}</span>}
      </div>

      {!touched ? (
        <EmptyState
          title="Что ищем"
          description="Поиск идёт по названиям и текстам материалов, содержимому конспектов, комментариям и заданиям во всех пространствах платформы."
        />
      ) : results.length === 0 && !busy ? (
        <EmptyState title="Ничего не нашлось" description="Попробуйте другое слово или его часть." />
      ) : (
        <div className="space-y-2">
          {results.map((f) => {
            const Icon = KIND_ICON[f.kind]
            return (
              <div key={`${f.kind}-${f.id}`} className={cx('cf-card p-4', f.is_hidden && 'border-[#E5484D]/25 bg-[#FDECEC]/40')}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon size={15} className="text-ink-3" />
                  <span className="cf-pill px-2 py-[2px] text-[11px] text-ink-3">{KIND_LABEL[f.kind]}</span>
                  <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{f.title}</h3>
                  {f.is_hidden && (
                    <span className="cf-pill border-[#E5484D]/30 bg-[#FDECEC] px-2 py-[2px] text-[11px] font-semibold text-[#8E2226]">
                      скрыто
                    </span>
                  )}
                </div>

                {f.excerpt.trim() && (
                  <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-ink-2">{f.excerpt}</p>
                )}

                <p className="mt-2 text-[12px] text-ink-3">
                  {f.author_name ?? 'автор неизвестен'} · {f.space_name ?? 'пространство удалено'}
                  {f.school_name ? ` · ${f.school_name}` : ''} · {dateLabel(f.created_at)}
                </p>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button
                    className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
                    onClick={() => {
                      localStorage.setItem('cornflow.space', f.space_id)
                      void db.platformLog({
                        action: 'space.open',
                        target_type: 'space',
                        target_id: f.space_id,
                        target_label: f.space_name,
                      })
                      navigate('/app')
                    }}
                  >
                    <ExternalLink size={14} /> В пространство
                  </button>
                  {f.kind !== 'assignment' && (
                    <button className="cf-btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => void hide(f, !f.is_hidden)}>
                      {f.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      {f.is_hidden ? 'Вернуть' : 'Скрыть'}
                    </button>
                  )}
                  <button className="cf-btn-ghost px-3 py-1.5 text-[12.5px]" onClick={() => setIncident(f)}>
                    <ShieldAlert size={14} /> Зафиксировать
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {incident && <IncidentModal finding={incident} onClose={() => setIncident(null)} />}
    </Page>
  )
}

function IncidentModal({ finding, onClose }: { finding: PlatformFinding; onClose: () => void }) {
  const toast = useToast()
  const [title, setTitle] = useState(`${KIND_LABEL[finding.kind]} · ${finding.title}`.slice(0, 120))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Modal open onClose={onClose} title="Зафиксировать находку" size="sm">
      <div className="space-y-3">
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Сохраняется снимок: текст, автор, пространство, школа и время. Если
          оригинал потом изменят или удалят, снимок останется прежним — его
          нельзя отредактировать даже отсюда.
        </p>
        <div>
          <span className="mb-1 block text-[12.5px] text-ink-2">Название</span>
          <input className="cf-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div>
          <span className="mb-1 block text-[12.5px] text-ink-2">Заметка</span>
          <textarea
            className="cf-input h-24 w-full resize-none"
            placeholder="Что именно насторожило"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button className="cf-btn-ghost px-4" onClick={onClose}>
            Отмена
          </button>
          <button
            className="cf-btn-brand px-4"
            disabled={busy || !title.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                await db.platformOpenIncident({ title: title.trim(), note: note.trim() || null, finding })
                toast.success('Снимок сохранён')
                onClose()
              } catch (e) {
                toast.error(e)
              } finally {
                setBusy(false)
              }
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------- инциденты -------------------------------- */

export function PlatformIncidentsPage() {
  const toast = useToast()
  const platform = usePlatformCtx()
  const [rows, setRows] = useState<PlatformIncident[]>([])
  const [busy, setBusy] = useState(true)

  const load = async () => {
    try {
      setRows(await db.platformIncidents())
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function exportAll() {
    const text = JSON.stringify(rows, null, 2)
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `cornflow-incidents-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <Page
      title="Инциденты"
      subtitle="Зафиксированные находки со снимком содержимого. Снимок неизменяем: правка возвращается к исходному значению на уровне базы."
    >
      {rows.length > 0 && (
        <div className="cf-card flex flex-wrap items-center gap-2 p-3">
          <span className="text-[13px] text-ink-2">
            Всего: {rows.length} · открытых: {rows.filter((r) => r.status === 'open').length}
          </span>
          <button className="cf-btn-ghost ml-auto px-4" onClick={exportAll}>
            Выгрузить всё
          </button>
        </div>
      )}

      {busy ? null : rows.length === 0 ? (
        <EmptyState
          title="Инцидентов нет"
          description="Находки фиксируются кнопкой «Зафиксировать» в поиске по содержимому."
          art="tasks"
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const snap = r.snapshot as Record<string, string | undefined>
            return (
              <div key={r.id} className="cf-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle size={15} className={r.status === 'open' ? 'text-[#8E2226]' : 'text-ink-3'} />
                  <h3 className="min-w-0 flex-1 text-[14.5px] font-semibold">{r.title}</h3>
                  <span
                    className={cx(
                      'cf-pill px-2 py-[2px] text-[11px] font-semibold',
                      r.status === 'open'
                        ? 'border-[#E5484D]/30 bg-[#FDECEC] text-[#8E2226]'
                        : 'text-ink-3',
                    )}
                  >
                    {r.status === 'open' ? 'открыт' : 'закрыт'}
                  </span>
                  <button
                    className="cf-btn-ghost px-3 py-1.5 text-[12.5px]"
                    onClick={async () => {
                      try {
                        await db.platformCloseIncident(r.id, r.status === 'open')
                        await load()
                        await platform.refresh()
                      } catch (e) {
                        toast.error(e)
                      }
                    }}
                  >
                    <Check size={14} /> {r.status === 'open' ? 'Закрыть' : 'Открыть'}
                  </button>
                </div>

                {r.note && <p className="mt-2 text-[12.5px] text-ink-2">{r.note}</p>}

                <div className="mt-2.5 rounded-[14px] border border-line bg-surface-2 p-3">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                    Снимок на момент находки
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{snap.excerpt || snap.title}</p>
                  <p className="mt-2 text-[12px] text-ink-3">
                    {snap.author_name ?? 'автор неизвестен'} · {snap.space_name ?? '—'}
                    {snap.school_name ? ` · ${snap.school_name}` : ''}
                    {snap.captured_at ? ` · зафиксировано ${dateLabel(snap.captured_at)}` : ''}
                  </p>
                </div>

                <p className="mt-2 text-[12px] text-ink-3">
                  открыл {r.opened_by_name ?? '—'} · {dateLabel(r.created_at)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </Page>
  )
}
