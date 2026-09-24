import { useCallback, useMemo, useState } from 'react'
import type { TrashEntry } from '@/components/shared/TrashDialog'
import { foldersForKind } from '@/lib/resource-folders'
import { useFoldersStore } from '@/stores/folders.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useUiStore } from '@/stores/ui.store'
import type { ResourceFolder } from '@/types/models'

// Own the Snippets Trash: the trashed entries, the folder-trash confirmation, and the restore,
// delete and empty actions.
export function useSnippetsTrash() {
  const trashedSnippets = useSnippetsStore((state) => state.trashedSnippets)
  const setActiveFolder = useSnippetsStore((state) => state.setActiveFolder)
  const flushPendingSnippet = useSnippetsStore((state) => state.flushPending)
  const restoreSnippet = useSnippetsStore((state) => state.restore)
  const permanentlyDeleteSnippet = useSnippetsStore((state) => state.permanentlyDelete)
  const refreshSnippets = useSnippetsStore((state) => state.refresh)
  const trashedFolders = useFoldersStore((state) => state.trashedFolders)
  const trashFolder = useFoldersStore((state) => state.trash)
  const restoreFolder = useFoldersStore((state) => state.restore)
  const permanentlyDeleteFolder = useFoldersStore((state) => state.permanentlyDelete)
  const emptyFolderTrash = useFoldersStore((state) => state.emptyTrash)
  const setLastAction = useUiStore((state) => state.setLastAction)

  const [folderTrashCandidate, setFolderTrashCandidate] = useState<ResourceFolder | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)

  const trashedSnippetFolders = useMemo(
    () => foldersForKind(trashedFolders, 'snippets'),
    [trashedFolders]
  )
  const trashEntries = useMemo<TrashEntry[]>(() => {
    const trashedFolderIds = new Set(trashedSnippetFolders.map((folder) => folder.id))
    const folderEntries = trashedSnippetFolders
      .filter((folder) => !folder.parentId || !trashedFolderIds.has(folder.parentId))
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        detail: 'Folder and its contents',
        type: 'folder' as const,
      }))
    const snippetEntries = trashedSnippets
      .filter((snippet) => !snippet.folderId || !trashedFolderIds.has(snippet.folderId))
      .map((snippet) => ({
        id: snippet.id,
        name: snippet.title || 'Untitled snippet',
        detail: snippet.language,
        type: 'item' as const,
      }))
    return [...folderEntries, ...snippetEntries]
  }, [trashedSnippetFolders, trashedSnippets])

  const handleTrashFolder = useCallback(async () => {
    if (!folderTrashCandidate) return
    try {
      await flushPendingSnippet()
      await trashFolder(folderTrashCandidate.id)
      await refreshSnippets()
      setActiveFolder('')
      setFolderTrashCandidate(null)
      setLastAction('Folder moved to Trash', 'info')
    } catch {
      setLastAction('Failed to move folder to Trash', 'error')
    }
  }, [
    flushPendingSnippet,
    folderTrashCandidate,
    refreshSnippets,
    setActiveFolder,
    setLastAction,
    trashFolder,
  ])

  const handleRestoreTrashEntry = useCallback(
    async (entry: TrashEntry) => {
      if (entry.type === 'folder') {
        await restoreFolder(entry.id)
        await refreshSnippets()
      } else {
        await restoreSnippet(entry.id)
      }
      setLastAction(`${entry.name} restored`, 'success')
    },
    [refreshSnippets, restoreFolder, restoreSnippet, setLastAction]
  )

  const handleDeleteTrashEntry = useCallback(
    async (entry: TrashEntry) => {
      if (entry.type === 'folder') {
        await permanentlyDeleteFolder(entry.id)
        await refreshSnippets()
      } else {
        await permanentlyDeleteSnippet(entry.id)
      }
      setLastAction(`${entry.name} permanently deleted`, 'info')
    },
    [permanentlyDeleteFolder, permanentlyDeleteSnippet, refreshSnippets, setLastAction]
  )

  const handleEmptyTrash = useCallback(async () => {
    await emptyFolderTrash('snippets')
    await refreshSnippets()
    setLastAction('Snippets Trash emptied', 'info')
  }, [emptyFolderTrash, refreshSnippets, setLastAction])

  return {
    trashEntries,
    trashOpen,
    setTrashOpen,
    folderTrashCandidate,
    setFolderTrashCandidate,
    handleTrashFolder,
    handleRestoreTrashEntry,
    handleDeleteTrashEntry,
    handleEmptyTrash,
  }
}
