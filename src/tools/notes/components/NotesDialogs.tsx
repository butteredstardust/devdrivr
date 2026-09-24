import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { TrashDialog, type TrashEntry } from '@/components/shared/TrashDialog'
import type { NoteAsset } from '@/lib/note-assets'
import type { Note, ResourceFolder } from '@/types/models'

type NotesDialogsProps = {
  deleteCandidate: Note | null
  setDeleteCandidate: Dispatch<SetStateAction<Note | null>>
  folderTrashCandidate: ResourceFolder | null
  setFolderTrashCandidate: Dispatch<SetStateAction<ResourceFolder | null>>
  removeTaskCandidate: Note | null
  setRemoveTaskCandidate: Dispatch<SetStateAction<Note | null>>
  trashCompletedOpen: boolean
  setTrashCompletedOpen: Dispatch<SetStateAction<boolean>>
  completedCount: number
  orphanAssets: NoteAsset[] | null
  setOrphanAssets: Dispatch<SetStateAction<NoteAsset[] | null>>
  trashOpen: boolean
  setTrashOpen: Dispatch<SetStateAction<boolean>>
  trashEntries: TrashEntry[]
  onDelete: () => Promise<void>
  onTrashFolder: () => Promise<void>
  onRemoveTaskMetadata: () => Promise<void>
  onTrashCompleted: () => Promise<void>
  onDeleteOrphans: () => Promise<void>
  onRestoreTrashEntry: (entry: TrashEntry) => Promise<void>
  onDeleteTrashEntry: (entry: TrashEntry) => Promise<void>
  onEmptyTrash: () => Promise<void>
}

export function NotesDialogs({
  deleteCandidate,
  setDeleteCandidate,
  folderTrashCandidate,
  setFolderTrashCandidate,
  removeTaskCandidate,
  setRemoveTaskCandidate,
  trashCompletedOpen,
  setTrashCompletedOpen,
  completedCount,
  orphanAssets,
  setOrphanAssets,
  trashOpen,
  setTrashOpen,
  trashEntries,
  onDelete,
  onTrashFolder,
  onRemoveTaskMetadata,
  onTrashCompleted,
  onDeleteOrphans,
  onRestoreTrashEntry,
  onDeleteTrashEntry,
  onEmptyTrash,
}: NotesDialogsProps) {
  return (
    <>
      {deleteCandidate && (
        <Dialog
          title="Move note to Trash?"
          onClose={() => setDeleteCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void onDelete()}>
                Move to Trash
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{deleteCandidate.title || 'Untitled note'}” can be restored until Trash is emptied.
          </p>
        </Dialog>
      )}
      {folderTrashCandidate && (
        <Dialog
          title="Move folder to Trash?"
          onClose={() => setFolderTrashCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setFolderTrashCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void onTrashFolder()}>
                Move folder to Trash
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            “{folderTrashCandidate.name}” and everything nested inside it will move to Trash
            together.
          </p>
        </Dialog>
      )}
      {removeTaskCandidate && (
        <Dialog
          title="Convert task to note?"
          onClose={() => setRemoveTaskCandidate(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRemoveTaskCandidate(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void onRemoveTaskMetadata()}>
                Remove task metadata
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            Status, priority, and due date will be removed from “
            {removeTaskCandidate.title || 'Untitled task'}”. Its title, body, folder, and tags will
            stay unchanged.
          </p>
        </Dialog>
      )}
      {trashCompletedOpen && (
        <Dialog
          title="Move completed tasks to Trash?"
          onClose={() => setTrashCompletedOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTrashCompletedOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void onTrashCompleted()}>
                Move {completedCount} to Trash
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            {completedCount} completed task{completedCount === 1 ? '' : 's'} will move to durable
            Trash and can be restored later.
          </p>
        </Dialog>
      )}
      {orphanAssets && (
        <Dialog
          title="Delete unused note images?"
          onClose={() => setOrphanAssets(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOrphanAssets(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void onDeleteOrphans()}>
                Delete {orphanAssets.length}
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            {orphanAssets.length} managed image{orphanAssets.length === 1 ? '' : 's'} are not used
            by any active or trashed note. Only these confirmed orphan files will be deleted.
          </p>
        </Dialog>
      )}
      {trashOpen && (
        <TrashDialog
          title="Notes Trash"
          entries={trashEntries}
          onClose={() => setTrashOpen(false)}
          onRestore={onRestoreTrashEntry}
          onDeletePermanently={onDeleteTrashEntry}
          onEmpty={onEmptyTrash}
        />
      )}
    </>
  )
}
