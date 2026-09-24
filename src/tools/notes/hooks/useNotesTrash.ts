import { useCallback, useMemo, useState } from 'react'
import type { TrashEntry } from '@/components/shared/TrashDialog'
import { foldersForKind } from '@/lib/resource-folders'
import { useFoldersStore } from '@/stores/folders.store'
import { useNotesStore } from '@/stores/notes.store'
import { useUiStore } from '@/stores/ui.store'
import type { UpdateNotesWorkspaceState } from '@/tools/notes/notes-workspace-model'
import { taskStatusLabel } from '@/tools/notes/notes-workspace-model'
import type { Note, ResourceFolder } from '@/types/models'

type UseNotesTrashInput = {
  updateState: UpdateNotesWorkspaceState
}

export function useNotesTrash({ updateState }: UseNotesTrashInput) {
  const trashedNotes = useNotesStore((state) => state.trashedNotes)
  const updateTask = useNotesStore((state) => state.updateTask)
  const flushPending = useNotesStore((state) => state.flushPending)
  const removeNote = useNotesStore((state) => state.remove)
  const restoreNote = useNotesStore((state) => state.restore)
  const permanentlyDeleteNote = useNotesStore((state) => state.permanentlyDelete)
  const trashCompletedNotes = useNotesStore((state) => state.trashCompleted)
  const refreshNotes = useNotesStore((state) => state.refresh)
  const trashedFolders = useFoldersStore((state) => state.trashedFolders)
  const trashFolder = useFoldersStore((state) => state.trash)
  const restoreFolder = useFoldersStore((state) => state.restore)
  const permanentlyDeleteFolder = useFoldersStore((state) => state.permanentlyDelete)
  const emptyFolderTrash = useFoldersStore((state) => state.emptyTrash)
  const setLastAction = useUiStore((state) => state.setLastAction)
  const [deleteCandidate, setDeleteCandidate] = useState<Note | null>(null)
  const [folderTrashCandidate, setFolderTrashCandidate] = useState<ResourceFolder | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [removeTaskCandidate, setRemoveTaskCandidate] = useState<Note | null>(null)
  const [trashCompletedOpen, setTrashCompletedOpen] = useState(false)

  const trashedNoteFolders = useMemo(
    () => foldersForKind(trashedFolders, 'notes'),
    [trashedFolders]
  )
  const trashEntries = useMemo<TrashEntry[]>(() => {
    const trashedFolderIds = new Set(trashedNoteFolders.map((folder) => folder.id))
    const folderEntries = trashedNoteFolders
      .filter((folder) => !folder.parentId || !trashedFolderIds.has(folder.parentId))
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        detail: 'Folder and its contents',
        type: 'folder' as const,
      }))
    const noteEntries = trashedNotes
      .filter((note) => !note.folderId || !trashedFolderIds.has(note.folderId))
      .map((note) => ({
        id: note.id,
        name: note.title || 'Untitled note',
        detail: note.taskStatus ? `Task · ${taskStatusLabel(note.taskStatus)}` : 'Note',
        type: 'item' as const,
      }))
    return [...folderEntries, ...noteEntries]
  }, [trashedNoteFolders, trashedNotes])

  const handleRemoveTaskMetadata = useCallback(async () => {
    if (!removeTaskCandidate) return
    try {
      await updateTask(removeTaskCandidate.id, { status: null })
      // A task view cannot hold a plain note. Follow the note back to the Notes
      // view, otherwise the list drops it and the editor clears.
      updateState({ selectedId: removeTaskCandidate.id, taskView: 'notes' })
      setRemoveTaskCandidate(null)
      setLastAction('Task converted to note', 'success')
    } catch {
      setLastAction('Failed to convert task to note', 'error')
    }
  }, [removeTaskCandidate, setLastAction, updateState, updateTask])

  const handleTrashCompleted = useCallback(async () => {
    try {
      await trashCompletedNotes()
      setTrashCompletedOpen(false)
      setLastAction('Completed tasks moved to Trash', 'info')
    } catch {
      setLastAction('Failed to move completed tasks to Trash', 'error')
    }
  }, [setLastAction, trashCompletedNotes])

  const handleDelete = useCallback(async () => {
    if (!deleteCandidate) return
    try {
      await removeNote(deleteCandidate.id)
      setDeleteCandidate(null)
      setLastAction('Note moved to Trash', 'info')
    } catch {
      setLastAction('Failed to move note to Trash', 'error')
    }
  }, [deleteCandidate, removeNote, setLastAction])

  const handleTrashFolder = useCallback(async () => {
    if (!folderTrashCandidate) return
    try {
      await flushPending()
      await trashFolder(folderTrashCandidate.id)
      await refreshNotes()
      updateState({ selectedFolderId: null })
      setFolderTrashCandidate(null)
      setLastAction('Folder moved to Trash', 'info')
    } catch {
      setLastAction('Failed to move folder to Trash', 'error')
    }
  }, [flushPending, folderTrashCandidate, refreshNotes, setLastAction, trashFolder, updateState])

  const handleRestoreTrashEntry = useCallback(
    async (entry: TrashEntry) => {
      if (entry.type === 'folder') {
        await restoreFolder(entry.id)
        await refreshNotes()
      } else {
        await restoreNote(entry.id)
      }
      setLastAction(`${entry.name} restored`, 'success')
    },
    [refreshNotes, restoreFolder, restoreNote, setLastAction]
  )

  const handleDeleteTrashEntry = useCallback(
    async (entry: TrashEntry) => {
      if (entry.type === 'folder') {
        await permanentlyDeleteFolder(entry.id)
        await refreshNotes()
      } else {
        await permanentlyDeleteNote(entry.id)
      }
      setLastAction(`${entry.name} permanently deleted`, 'info')
    },
    [permanentlyDeleteFolder, permanentlyDeleteNote, refreshNotes, setLastAction]
  )

  const handleEmptyTrash = useCallback(async () => {
    await emptyFolderTrash('notes')
    await refreshNotes()
    setLastAction('Notes Trash emptied', 'info')
  }, [emptyFolderTrash, refreshNotes, setLastAction])

  return {
    deleteCandidate,
    setDeleteCandidate,
    folderTrashCandidate,
    setFolderTrashCandidate,
    trashOpen,
    setTrashOpen,
    removeTaskCandidate,
    setRemoveTaskCandidate,
    trashCompletedOpen,
    setTrashCompletedOpen,
    trashEntries,
    handleRemoveTaskMetadata,
    handleTrashCompleted,
    handleDelete,
    handleTrashFolder,
    handleRestoreTrashEntry,
    handleDeleteTrashEntry,
    handleEmptyTrash,
  }
}
