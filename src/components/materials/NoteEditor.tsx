import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  Check,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  ListChecks,
  ListOrdered,
  List as ListIcon,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react'
import { cx, debounce } from '@/lib/utils'

/* ---------------------------------------------------------------------------
   Простой rich-text редактор конспектов: заголовки, списки, чек-листы,
   выделение, цитаты, ссылки. Автосохранение с задержкой 800 мс.
--------------------------------------------------------------------------- */

interface Props {
  value: string
  onChange: (html: string) => void
  onSavingChange?: (saving: boolean) => void
  placeholder?: string
  minHeight?: number
  readOnly?: boolean
}

export function NoteEditor({
  value,
  onChange,
  onSavingChange,
  placeholder = 'Начните писать конспект…',
  minHeight = 320,
  readOnly = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [dirty, setDirty] = useState(false)

  /* Подставляем значение только когда оно пришло извне — иначе теряется каретка */
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value && !dirty) {
      ref.current.innerHTML = value || ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const save = useMemo(
    () =>
      debounce((html: string) => {
        onChange(html)
        setDirty(false)
        onSavingChange?.(false)
      }, 800),
    [onChange, onSavingChange],
  )

  const handleInput = useCallback(() => {
    if (!ref.current) return
    setDirty(true)
    onSavingChange?.(true)
    save(ref.current.innerHTML)
  }, [save, onSavingChange])

  /* Сохраняем немедленно при уходе со страницы/размонтировании */
  useEffect(() => {
    return () => {
      if (ref.current && dirty) onChange(ref.current.innerHTML)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  const exec = useCallback(
    (command: string, arg?: string) => {
      if (readOnly) return
      ref.current?.focus()
      document.execCommand(command, false, arg)
      handleInput()
    },
    [handleInput, readOnly],
  )

  const insertChecklist = useCallback(() => {
    if (readOnly) return
    ref.current?.focus()
    document.execCommand(
      'insertHTML',
      false,
      '<ul data-checklist="true"><li data-done="false">Пункт</li></ul><p><br></p>',
    )
    handleInput()
  }, [handleInput, readOnly])

  const addLink = useCallback(() => {
    const url = window.prompt('Адрес ссылки')
    if (url) exec('createLink', url)
  }, [exec])

  /* Клик по чекбоксу внутри чек-листа */
  const onEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      const li = target.closest('li')
      if (!li) return
      const list = li.parentElement
      if (!list?.hasAttribute('data-checklist')) return
      const rect = li.getBoundingClientRect()
      if (e.clientX - rect.left > 26) return
      li.setAttribute('data-done', li.getAttribute('data-done') === 'true' ? 'false' : 'true')
      handleInput()
    },
    [handleInput],
  )

  const tools = [
    { icon: Heading1, title: 'Заголовок 1', run: () => exec('formatBlock', '<h1>') },
    { icon: Heading2, title: 'Заголовок 2', run: () => exec('formatBlock', '<h2>') },
    { icon: Heading3, title: 'Заголовок 3', run: () => exec('formatBlock', '<h3>') },
    { sep: true },
    { icon: Bold, title: 'Жирный (Ctrl+B)', run: () => exec('bold') },
    { icon: Italic, title: 'Курсив (Ctrl+I)', run: () => exec('italic') },
    { icon: Highlighter, title: 'Выделение', run: () => exec('hiliteColor', 'var(--cf-yellow-bg)') },
    { sep: true },
    { icon: ListIcon, title: 'Маркированный список', run: () => exec('insertUnorderedList') },
    { icon: ListOrdered, title: 'Нумерованный список', run: () => exec('insertOrderedList') },
    { icon: ListChecks, title: 'Чек-лист', run: insertChecklist },
    { sep: true },
    { icon: Quote, title: 'Цитата', run: () => exec('formatBlock', '<blockquote>') },
    { icon: Code2, title: 'Код', run: () => exec('formatBlock', '<pre>') },
    { icon: Link2, title: 'Ссылка', run: addLink },
    { sep: true },
    { icon: Undo2, title: 'Отменить', run: () => exec('undo') },
    { icon: Redo2, title: 'Повторить', run: () => exec('redo') },
  ]

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-2/50 px-2 py-1.5">
          {tools.map((t, i) =>
            'sep' in t ? (
              <span key={i} className="mx-1 h-5 w-px bg-line" />
            ) : (
              <button
                key={i}
                type="button"
                title={t.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={t.run}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-2 transition hover:bg-surface hover:text-ink active:scale-90"
              >
                <t.icon size={15} />
              </button>
            ),
          )}
          <span
            className={cx(
              'ml-auto flex items-center gap-1 pr-1 text-[11.5px] transition',
              dirty ? 'text-ink-3' : 'text-[color:var(--cf-green-acc)]',
            )}
          >
            {dirty ? (
              'Сохраняем…'
            ) : (
              <>
                <Check size={12} /> Сохранено
              </>
            )}
          </span>
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={() => {
          if (ref.current && dirty) {
            onChange(ref.current.innerHTML)
            setDirty(false)
          }
        }}
        onClick={onEditorClick}
        data-placeholder={placeholder}
        className="cf-prose cf-editor px-5 py-4 focus:outline-none"
        style={{ minHeight }}
      />
    </div>
  )
}
