import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { db } from '@/lib/db'
import type {
  AssignmentView,
  Folder,
  MaterialView,
  SpaceView,
  Tag,
  Task,
} from '@/lib/types'
import { useAuth } from './AuthContext'

export type ViewMode = 'grid' | 'list'
export type SortMode = 'new' | 'old' | 'title' | 'type'

interface AppApi {
  /* данные */
  spaces: SpaceView[]
  space: SpaceView | null
  setSpaceId: (id: string) => void
  materials: MaterialView[]
  allMaterials: MaterialView[]
  folders: Folder[]
  tags: Tag[]
  assignments: AssignmentView[]
  allAssignments: AssignmentView[]
  tasks: Task[]
  loading: boolean
  bootstrapped: boolean
  canEdit: boolean

  /* обновление */
  refresh: () => Promise<void>
  refreshSpaces: () => Promise<void>

  /* состояние интерфейса */
  query: string
  setQuery: (v: string) => void
  view: ViewMode
  setView: (v: ViewMode) => void
  sort: SortMode
  setSort: (v: SortMode) => void
  activeTags: string[]
  toggleTag: (id: string) => void
  clearTags: () => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

const Ctx = createContext<AppApi | null>(null)

const SPACE_KEY = 'cornflow.space'
const VIEW_KEY = 'cornflow.view'
const SORT_KEY = 'cornflow.sort'

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const [spaces, setSpaces] = useState<SpaceView[]>([])
  const [spaceId, setSpaceIdState] = useState<string | null>(() => localStorage.getItem(SPACE_KEY))
  const [materials, setMaterials] = useState<MaterialView[]>([])
  const [allMaterials, setAllMaterials] = useState<MaterialView[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [assignments, setAssignments] = useState<AssignmentView[]>([])
  const [allAssignments, setAllAssignments] = useState<AssignmentView[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [bootstrapped, setBootstrapped] = useState(false)

  const [query, setQuery] = useState('')
  const [view, setViewState] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || 'grid',
  )
  const [sort, setSortState] = useState<SortMode>(
    () => (localStorage.getItem(SORT_KEY) as SortMode) || 'new',
  )
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const spaceIdRef = useRef<string | null>(spaceId)
  spaceIdRef.current = spaceId

  const space = useMemo(() => spaces.find((s) => s.id === spaceId) ?? spaces[0] ?? null, [spaces, spaceId])
  const canEdit = Boolean(space && space.permission === 'edit')

  const setSpaceId = useCallback((id: string) => {
    localStorage.setItem(SPACE_KEY, id)
    setSpaceIdState(id)
  }, [])

  const setView = useCallback((v: ViewMode) => {
    localStorage.setItem(VIEW_KEY, v)
    setViewState(v)
  }, [])

  const setSort = useCallback((v: SortMode) => {
    localStorage.setItem(SORT_KEY, v)
    setSortState(v)
  }, [])

  const toggleTag = useCallback((id: string) => {
    setActiveTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }, [])

  const clearTags = useCallback(() => setActiveTags([]), [])

  const refreshSpaces = useCallback(async () => {
    if (!user) return
    const list = await db.listSpaces()
    setSpaces(list)
    if (list.length && !list.some((s) => s.id === spaceIdRef.current)) {
      setSpaceId(list[0].id)
    }
  }, [user, setSpaceId])

  /** Полная перезагрузка данных текущего пространства и глобальных списков */
  const refresh = useCallback(async () => {
    if (!user) return
    const active = space?.id ?? null
    const [tagList, taskList, everyMaterial, everyAssignment] = await Promise.all([
      db.listTags(),
      db.listTasks(),
      db.listAllMaterials(),
      db.listAllAssignments(),
    ])
    setTags(tagList)
    setTasks(taskList)
    setAllMaterials(everyMaterial)
    setAllAssignments(everyAssignment)

    if (active) {
      const [mats, flds, asgs] = await Promise.all([
        db.listMaterials(active),
        db.listFolders(active),
        db.listAssignments(active),
      ])
      setMaterials(mats)
      setFolders(flds)
      setAssignments(asgs)
    } else {
      setMaterials([])
      setFolders([])
      setAssignments([])
    }
  }, [user, space?.id])

  /* Первичная загрузка */
  useEffect(() => {
    let alive = true
    if (!user) {
      setSpaces([])
      setMaterials([])
      setAllMaterials([])
      setFolders([])
      setAssignments([])
      setAllAssignments([])
      setTasks([])
      setLoading(false)
      setBootstrapped(false)
      return
    }
    setLoading(true)
    refreshSpaces()
      .catch(() => undefined)
      .finally(() => {
        if (alive) setBootstrapped(true)
      })
    return () => {
      alive = false
    }
  }, [user, refreshSpaces])

  /* Загрузка данных при смене пространства */
  useEffect(() => {
    if (!user || !bootstrapped) return
    let alive = true
    setLoading(true)
    refresh()
      .catch(() => undefined)
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [user, bootstrapped, space?.id, refresh])

  /* Realtime: любое изменение — мягко перезагружаем затронутые списки */
  useEffect(() => {
    if (!user) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = db.subscribe((e) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (e.table === 'spaces') refreshSpaces().catch(() => undefined)
        refresh().catch(() => undefined)
      }, 120)
    })
    return () => {
      if (timer) clearTimeout(timer)
      off()
    }
  }, [user, refresh, refreshSpaces])

  /* На мобильных сайдбар по умолчанию свёрнут */
  useEffect(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false)
  }, [])

  const value = useMemo<AppApi>(
    () => ({
      spaces,
      space,
      setSpaceId,
      materials,
      allMaterials,
      folders,
      tags,
      assignments,
      allAssignments,
      tasks,
      loading,
      bootstrapped,
      canEdit,
      refresh,
      refreshSpaces,
      query,
      setQuery,
      view,
      setView,
      sort,
      setSort,
      activeTags,
      toggleTag,
      clearTags,
      sidebarOpen,
      setSidebarOpen,
    }),
    [
      spaces,
      space,
      setSpaceId,
      materials,
      allMaterials,
      folders,
      tags,
      assignments,
      allAssignments,
      tasks,
      loading,
      bootstrapped,
      canEdit,
      refresh,
      refreshSpaces,
      query,
      view,
      setView,
      sort,
      setSort,
      activeTags,
      toggleTag,
      clearTags,
      sidebarOpen,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp должен использоваться внутри AppProvider')
  return ctx
}
