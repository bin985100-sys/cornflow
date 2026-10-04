import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { CloudUpload } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useCreate } from '@/context/CreateContext'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/**
 * Каркас приложения: два скруглённых «острова» на общей подложке —
 * как секции лендинга. Плюс перетаскивание файлов в любое место окна.
 */
export function AppLayout() {
  const { canEdit, space, sidebarOpen, setSidebarOpen } = useApp()
  const create = useCreate()
  const location = useLocation()
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const scrollRef = useRef<HTMLElement>(null)

  /* На мобильных сайдбар закрывается после перехода и открывается на десктопе */
  useEffect(() => {
    if (window.innerWidth < 1024 && sidebarOpen) setSidebarOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  /* Переход с телефона на большой экран возвращает сохранённый выбор */
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(localStorage.getItem('cf:sidebar') !== 'closed')
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setSidebarOpen])

  /* Новый раздел — всегда с начала */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  useEffect(() => {
    if (!canEdit || !space) return

    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      depth.current++
      setDragging(true)
    }
    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const onOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length) create.newMaterial({ kind: 'file', files })
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [canEdit, space, create])

  return (
    <div className="flex h-screen overflow-hidden bg-shell lg:gap-2.5 lg:p-2.5">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-line bg-canvas lg:rounded-[26px] lg:border lg:shadow-card">
        <Topbar />
        <main ref={scrollRef} className="flex-1 overflow-y-auto">
          {/* ключ по маршруту — каждый раздел появляется с мягким переходом */}
          <div key={location.pathname} className="animate-page">
            <Outlet />
          </div>
        </main>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[90] flex animate-fade-in items-center justify-center bg-brand/10 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-[26px] border-2 border-dashed border-brand bg-surface px-12 py-10 shadow-pop">
            <CloudUpload size={38} className="text-brand" />
            <p className="text-[16px] font-semibold text-ink">Отпустите — загрузим в «{space?.name}»</p>
            <p className="text-[13px] text-ink-3">Можно перетаскивать сразу несколько файлов</p>
          </div>
        </div>
      )}
    </div>
  )
}
