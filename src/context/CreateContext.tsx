import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { db } from '@/lib/db'
import type { AssignmentView, Folder, MaterialView } from '@/lib/types'
import { download } from '@/lib/utils'
import { useApp } from './AppContext'
import { useToast } from './ToastContext'
import { MaterialModal, type MaterialKind } from '@/components/modals/MaterialModal'
import { FolderModal, JoinModal, ShareModal, SpaceModal } from '@/components/modals/SpaceModals'
import { AssignmentDetail, AssignmentModal } from '@/components/modals/AssignmentModals'
import { MaterialViewer } from '@/components/materials/MaterialViewer'
import { ConfirmDialog } from '@/components/ui/Modal'

interface CreateApi {
  newMaterial: (opts?: { kind?: MaterialKind; folderId?: string | null; files?: File[] }) => void
  editMaterial: (m: MaterialView) => void
  openMaterial: (m: MaterialView) => void
  deleteMaterial: (m: MaterialView) => void
  downloadMaterial: (m: MaterialView) => void
  newFolder: (parentId?: string | null) => void
  editFolder: (f: Folder) => void
  newAssignment: () => void
  editAssignment: (a: AssignmentView) => void
  openAssignment: (a: AssignmentView) => void
  newSpace: () => void
  joinSpace: () => void
  share: () => void
}

const Ctx = createContext<CreateApi | null>(null)

export function CreateProvider({ children }: { children: ReactNode }) {
  const { refresh, canEdit } = useApp()
  const toast = useToast()

  const [materialModal, setMaterialModal] = useState<{
    open: boolean
    kind: MaterialKind
    folderId: string | null
    editing: MaterialView | null
    files?: File[]
  }>({ open: false, kind: 'file', folderId: null, editing: null })

  const [viewer, setViewer] = useState<MaterialView | null>(null)
  const [folderModal, setFolderModal] = useState<{ open: boolean; parentId: string | null; editing: Folder | null }>({
    open: false,
    parentId: null,
    editing: null,
  })
  const [assignmentModal, setAssignmentModal] = useState<{ open: boolean; editing: AssignmentView | null }>({
    open: false,
    editing: null,
  })
  const [assignmentDetail, setAssignmentDetail] = useState<AssignmentView | null>(null)
  const [spaceModal, setSpaceModal] = useState(false)
  const [joinModal, setJoinModal] = useState(false)
  const [shareModal, setShareModal] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<MaterialView | null>(null)

  const api = useMemo<CreateApi>(
    () => ({
      newMaterial: (opts) =>
        setMaterialModal({
          open: true,
          kind: opts?.kind ?? 'file',
          folderId: opts?.folderId ?? null,
          editing: null,
          files: opts?.files,
        }),
      editMaterial: (m) =>
        setMaterialModal({ open: true, kind: 'file', folderId: m.folder_id, editing: m }),
      openMaterial: (m) => setViewer(m),
      deleteMaterial: (m) => setPendingDelete(m),
      downloadMaterial: async (m) => {
        try {
          const url = await db.resolveFileUrl(m)
          if (!url) throw new Error('У материала нет файла')
          download(url, m.file_name ?? m.title)
        } catch (e) {
          toast.error(e)
        }
      },
      newFolder: (parentId = null) => setFolderModal({ open: true, parentId, editing: null }),
      editFolder: (f) => setFolderModal({ open: true, parentId: f.parent_id, editing: f }),
      newAssignment: () => setAssignmentModal({ open: true, editing: null }),
      editAssignment: (a) => {
        setAssignmentDetail(null)
        setAssignmentModal({ open: true, editing: a })
      },
      openAssignment: (a) => setAssignmentDetail(a),
      newSpace: () => setSpaceModal(true),
      joinSpace: () => setJoinModal(true),
      share: () => setShareModal(true),
    }),
    [toast],
  )

  const doDelete = useCallback(async () => {
    if (!pendingDelete) return
    try {
      await db.deleteMaterial(pendingDelete.id)
      await refresh()
      toast.success('Материал удалён')
      setViewer(null)
    } catch (e) {
      toast.error(e)
    }
  }, [pendingDelete, refresh, toast])

  return (
    <Ctx.Provider value={api}>
      {children}

      <MaterialModal
        open={materialModal.open}
        kind={materialModal.kind}
        folderId={materialModal.folderId}
        editing={materialModal.editing}
        initialFiles={materialModal.files}
        onClose={() => setMaterialModal((s) => ({ ...s, open: false, files: undefined }))}
      />

      <MaterialViewer
        material={viewer}
        open={Boolean(viewer)}
        onClose={() => setViewer(null)}
        canEdit={canEdit}
        onEdit={(m) => {
          setViewer(null)
          api.editMaterial(m)
        }}
        onChanged={() => void refresh()}
      />

      <FolderModal
        open={folderModal.open}
        parentId={folderModal.parentId}
        editing={folderModal.editing}
        onClose={() => setFolderModal((s) => ({ ...s, open: false }))}
      />

      <AssignmentModal
        open={assignmentModal.open}
        editing={assignmentModal.editing}
        onClose={() => setAssignmentModal({ open: false, editing: null })}
      />

      <AssignmentDetail
        assignment={assignmentDetail}
        open={Boolean(assignmentDetail)}
        onClose={() => setAssignmentDetail(null)}
        onEdit={api.editAssignment}
        onOpenMaterial={(m) => {
          setAssignmentDetail(null)
          setViewer(m)
        }}
      />

      <SpaceModal open={spaceModal} onClose={() => setSpaceModal(false)} />
      <JoinModal open={joinModal} onClose={() => setJoinModal(false)} />
      <ShareModal open={shareModal} onClose={() => setShareModal(false)} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={doDelete}
        title="Удалить материал?"
        description={`«${pendingDelete?.title ?? ''}» будет удалён безвозвратно, вместе с файлом.`}
      />
    </Ctx.Provider>
  )
}

export function useCreate(): CreateApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCreate должен использоваться внутри CreateProvider')
  return ctx
}
