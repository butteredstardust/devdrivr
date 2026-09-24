import { useCallback, useState } from 'react'
import {
  collectNoteAssetIds,
  deleteOrphanNoteAssets,
  findOrphanNoteAssets,
  type NoteAsset,
} from '@/lib/note-assets'
import { useNotesStore } from '@/stores/notes.store'
import { useUiStore } from '@/stores/ui.store'

export function useNoteAssetCleanup() {
  const setLastAction = useUiStore((state) => state.setLastAction)
  const [orphanAssets, setOrphanAssets] = useState<NoteAsset[] | null>(null)

  const referencedAssetIds = useCallback(() => {
    const current = useNotesStore.getState()
    return collectNoteAssetIds([
      ...current.notes.map((note) => note.content),
      ...current.trashedNotes.map((note) => note.content),
    ])
  }, [])

  const handleFindOrphans = useCallback(async () => {
    try {
      const assets = await findOrphanNoteAssets(referencedAssetIds())
      if (assets.length === 0) {
        setLastAction('No unused note images found', 'info')
        return
      }
      setOrphanAssets(assets)
    } catch (error) {
      setLastAction(
        `Failed to inspect note images: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      )
    }
  }, [referencedAssetIds, setLastAction])

  const handleDeleteOrphans = useCallback(async () => {
    if (!orphanAssets) return
    try {
      const count = await deleteOrphanNoteAssets(
        orphanAssets.map((asset) => asset.id),
        referencedAssetIds()
      )
      setOrphanAssets(null)
      setLastAction(`${count} unused image${count === 1 ? '' : 's'} deleted`, 'success')
    } catch (error) {
      setLastAction(
        `Failed to clean up note images: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      )
    }
  }, [orphanAssets, referencedAssetIds, setLastAction])

  return { orphanAssets, setOrphanAssets, handleFindOrphans, handleDeleteOrphans }
}
