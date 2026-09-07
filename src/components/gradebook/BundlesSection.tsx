import { useCallback, useEffect, useState } from 'react'
import { Copy, Layers, Link2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { ConfirmDialog } from '@/components/ui/Modal'
import { cx } from '@/lib/utils'
import type { Permission, SpaceBundleView } from '@/lib/types'

/**
 * Наборы пространств: администратор собирает несколько пространств и выдаёт
 * один код. Ученик вводит его один раз и попадает сразу во все пространства.
 *
 * Чужое пространство в набор добавляет только тот, кто вправе его
 * редактировать: администратор передаёт код другому учителю, а тот
 * подключает своё пространство сам.
 */
export function BundlesSection() {
  const { spaces, refreshSpaces } = useApp()
  const toast = useToast()
  const [bundles, setBundles] = useState<SpaceBundleView[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [permission, setPermission] = useState<Permission>('view')
  const [attachCode, setAttachCode] = useState('')
  const [attachSpace, setAttachSpace] = useState('')
  const [confirm, setConfirm] = useState<SpaceBundleView | null>(null)

  const load = useCallback(async () => {
    try {
      setBundles(await db.listBundles())
    } catch (e) {
      toast.error(e)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const editable = spaces.filter((s) => s.permission === 'edit')

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      await load()
      await refreshSpaces()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error(e)
    }
  }

  function copy(code: string) {
    navigator.clipboard
      ?.writeText(code)
      .then(() => toast.success('Код скопирован'))
      .catch(() => toast.error('Не удалось скопировать — выделите код вручную'))
  }

  return (
    <section className="cf-card p-5">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold">
        <Layers size={17} className="text-brand" /> Наборы пространств
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">
        Один код на несколько пространств: ученик вводит его один раз и входит сразу во все.
        Пространство добавляет в набор тот, кто вправе его редактировать, — чужой доступ по чужому
        коду не раздаётся.
      </p>

      {loading ? (
        <p className="mt-4 text-[13px] text-ink-3">Загружаем…</p>
      ) : (
        <div className="mt-4 space-y-3">
          {bundles.map((b) => (
            <article key={b.id} className="rounded-[18px] border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold">{b.name}</span>
                <span
                  className={cx(
                    'cf-pill px-2 py-[2px] text-[11.5px]',
                    b.permission === 'edit'
                      ? 'border-[color:var(--cf-purple-acc)]/25 bg-[color:var(--cf-purple-bg)] text-[color:var(--cf-purple-acc)]'
                      : 'border-line bg-canvas text-ink-3',
                  )}
                >
                  {b.permission === 'edit' ? 'вход с правом правки' : 'вход на просмотр'}
                </span>
                {!b.is_owner && (
                  <span className="cf-pill border-line bg-canvas px-2 py-[2px] text-[11.5px] text-ink-3">
                    чужой набор
                  </span>
                )}

                <span className="ml-auto flex items-center gap-1.5">
                  <code className="rounded-[10px] border border-line bg-canvas px-2.5 py-1 text-[13px] font-semibold tracking-[0.14em]">
                    {b.code}
                  </code>
                  <button className="cf-icon-btn" onClick={() => copy(b.code)} aria-label="Скопировать код">
                    <Copy size={15} />
                  </button>
                  {b.is_owner && (
                    <>
                      <button
                        className="cf-icon-btn"
                        aria-label="Обновить код"
                        title="Сменить код — старый перестанет работать"
                        onClick={() => void run(() => db.regenerateBundleCode(b.id), 'Код обновлён')}
                      >
                        <RefreshCw size={15} />
                      </button>
                      <button
                        className="cf-icon-btn"
                        aria-label="Удалить набор"
                        onClick={() => setConfirm(b)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {b.spaces.length === 0 && (
                  <span className="text-[12.5px] text-ink-3">
                    В наборе пока нет пространств — добавьте своё ниже
                  </span>
                )}
                {b.spaces.map((sp) => (
                  <span
                    key={sp.id}
                    className="cf-pill px-2.5 py-1 text-[12px]"
                    style={{
                      background: `var(--cf-${sp.color}-bg)`,
                      color: `var(--cf-${sp.color}-acc)`,
                      borderColor: `color-mix(in srgb, var(--cf-${sp.color}-acc) 26%, transparent)`,
                    }}
                  >
                    {sp.name}
                    {!sp.is_mine && <span className="opacity-70"> · чужое</span>}
                    {(sp.is_mine || b.is_owner) && (
                      <button
                        onClick={() => void run(() => db.removeSpaceFromBundle(b.id, sp.id))}
                        className="ml-1 opacity-60 transition hover:opacity-100"
                        aria-label={`Убрать ${sp.name} из набора`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {!!editable.length && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className="cf-input py-1.5 text-[12.5px]"
                    defaultValue=""
                    onChange={(e) => {
                      const spaceId = e.target.value
                      e.currentTarget.value = ''
                      if (spaceId) void run(() => db.addSpaceToBundle(b.id, spaceId), 'Пространство добавлено')
                    }}
                  >
                    <option value="">Добавить моё пространство…</option>
                    {editable
                      .filter((sp) => !b.spaces.some((x) => x.id === sp.id))
                      .map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* создание набора */}
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <input
          className="cf-input min-w-[200px] flex-1"
          placeholder="Название набора — например, «9-е классы»"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="cf-input py-2 text-[13px]"
          value={permission}
          onChange={(e) => setPermission(e.target.value as Permission)}
        >
          <option value="view">Входят на просмотр</option>
          <option value="edit">Входят с правом правки</option>
        </select>
        <button
          className="cf-btn-brand"
          onClick={() => {
            if (!name.trim()) {
              toast.error('Укажите название набора')
              return
            }
            void run(async () => {
              await db.createBundle({ name: name.trim(), permission })
              setName('')
            }, 'Набор создан')
          }}
        >
          <Plus size={15} /> Создать набор
        </button>
      </div>

      {/* подключение своего пространства к чужому набору */}
      {!!editable.length && (
        <div className="mt-4 rounded-[16px] bg-canvas p-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Link2 size={14} /> Подключить своё пространство к чужому набору
          </p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Администратор даёт код набора — вы выбираете своё пространство и подключаете его. Ученики
            этого набора получат к нему доступ.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              className="cf-input w-[150px] uppercase tracking-[0.14em]"
              placeholder="КОД"
              value={attachCode}
              onChange={(e) => setAttachCode(e.target.value)}
            />
            <select
              className="cf-input py-2 text-[13px]"
              value={attachSpace}
              onChange={(e) => setAttachSpace(e.target.value)}
            >
              <option value="">Моё пространство…</option>
              {editable.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>
            <button
              className="cf-btn-ghost"
              onClick={() => {
                if (!attachCode.trim() || !attachSpace) {
                  toast.error('Введите код и выберите пространство')
                  return
                }
                void run(async () => {
                  await db.attachSpaceToBundleByCode(attachCode.trim(), attachSpace)
                  setAttachCode('')
                  setAttachSpace('')
                }, 'Пространство подключено к набору')
              }}
            >
              Подключить
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Удалить набор «${confirm?.name ?? ''}»?`}
        description="Код перестанет работать. Пространства и уже вошедшие участники останутся на месте."
        onConfirm={() => {
          if (confirm) void run(() => db.deleteBundle(confirm.id), 'Набор удалён')
        }}
      />
    </section>
  )
}
