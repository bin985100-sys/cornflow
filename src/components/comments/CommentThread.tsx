import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle, Send, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import type { CommentView } from '@/lib/types'
import { formatRelative } from '@/lib/utils'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/primitives'

/**
 * Обсуждение под материалом или заданием. Новые сообщения других участников
 * подхватываются подпиской на изменения — перезагружать страницу не нужно.
 */
export function CommentThread({
  materialId,
  assignmentId,
}: {
  materialId?: string
  assignmentId?: string
}) {
  const { space, canManage } = useApp()
  const { user } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState<CommentView[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      setItems(await db.listComments({ materialId, assignmentId }))
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }, [materialId, assignmentId, toast])

  useEffect(() => {
    void load()
  }, [load])

  /* живое обновление: кто-то написал — ветка обновляется сама */
  useEffect(() => {
    const off = db.subscribe?.((e) => {
      if (e.table === 'comments' || e.table === 'materials') void load()
    })
    return () => off?.()
  }, [load])

  async function send() {
    const body = text.trim()
    if (!body || !space) return
    setBusy(true)
    try {
      await db.addComment({ space_id: space.id, material_id: materialId, assignment_id: assignmentId, body })
      setText('')
      await load()
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch (e) {
      toast.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h4 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <MessageCircle size={14} /> Обсуждение
        {items.length > 0 && <span className="text-ink-3">({items.length})</span>}
      </h4>

      {loading ? (
        <div className="flex justify-center py-5">
          <Loader2 size={18} className="animate-spin text-ink-3" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-soft border border-dashed border-line px-3 py-4 text-center text-[13px] text-ink-3">
          Вопросов пока нет. Спросите — участники курса увидят сообщение сразу.
        </p>
      ) : (
        <ul className="cf-stagger max-h-64 space-y-2 overflow-y-auto pr-1">
          {items.map((c) => (
            <li key={c.id} className="group flex items-start gap-2.5 rounded-card bg-surface-2/50 px-3 py-2.5">
              <Avatar name={c.author?.name ?? '?'} src={c.author?.avatar} size={28} />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="font-semibold text-ink">{c.author?.name ?? 'Участник'}</span>
                  <span className="text-ink-3">{formatRelative(c.created_at)}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">{c.body}</p>
              </div>
              {(c.author_id === user?.id || canManage) && (
                <button
                  className="shrink-0 rounded-full p-1 text-ink-3 opacity-0 transition duration-200 hover:text-[color:var(--cf-red-acc)] group-hover:opacity-100"
                  title="Удалить"
                  onClick={async () => {
                    try {
                      await db.deleteComment(c.id)
                      await load()
                    } catch (e) {
                      toast.error(e)
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
          <div ref={bottomRef} />
        </ul>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          className="cf-input min-h-[44px] resize-y py-2.5"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
          }}
          placeholder="Написать сообщение…  ⌘/Ctrl + Enter — отправить"
        />
        <button className="cf-btn-brand h-11 w-11 shrink-0 px-0" onClick={send} disabled={busy || !text.trim()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </section>
  )
}
