/**
 * Notes backup export and restore, shared by the Notes tool and Settings → Data.
 *
 * WARNING: `importBackup` replaces the stored folders and notes. It writes image attachments to
 * disk before it writes the database, and rolls those files back when the database write fails.
 *
 * `exportBackup` flushes the pending editor write first, so a backup taken while the user is
 * still typing carries the current text.
 */
import { useCallback } from 'react'
import { exportFile, openFileDialog } from '@/lib/file-io'
import { restoreNotesFromBackup } from '@/lib/db'
import {
  createNotesBackup,
  restoreNotesBackup,
  rollbackRestoredNoteAssets,
  finalizeRestoredNoteAssets,
} from '@/lib/note-assets'
import { foldersForKind } from '@/lib/resource-folders'
import { useNotesStore } from '@/stores/notes.store'
import { useFoldersStore } from '@/stores/folders.store'
import type { Note } from '@/types/models'

/** Attachments make a notes backup large. This cap still admits several thousand images. */
const MAX_NOTES_BACKUP_FILE_BYTES = 512 * 1024 * 1024

/** Reports the outcome of a backup operation to the user. */
export type BackupReporter = (message: string, tone: 'success' | 'error') => void

export type NotesBackupActions = {
  /** Writes every note and notes folder to a file the user picks. */
  exportBackup: () => Promise<void>
  /** Replaces the stored notes from a file the user picks. */
  importBackup: () => Promise<void>
}

export function useNotesBackup(report: BackupReporter): NotesBackupActions {
  const exportBackup = useCallback(async () => {
    try {
      await useNotesStore.getState().flushPending()
      const currentNotes = useNotesStore.getState().notes
      const folders = foldersForKind(useFoldersStore.getState().folders, 'notes')
      const content = await createNotesBackup(currentNotes, folders)
      const path = await exportFile(content, 'devdrivr-notes-backup.json')
      if (path) report(`${currentNotes.length} notes exported with attachments`, 'success')
    } catch (error) {
      report(
        `Failed to export notes: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      )
    }
  }, [report])

  const importBackup = useCallback(async () => {
    let restoreToken: string | null = null
    try {
      const file = await openFileDialog({ maxBytes: MAX_NOTES_BACKUP_FILE_BYTES })
      if (!file) return
      const backup = await restoreNotesBackup(file.content)
      restoreToken = backup.restoreToken
      if (backup.version === 2) {
        await restoreNotesFromBackup(backup.folders, backup.notes)
      } else {
        // Version 1 carries no folders, so every note lands in the Inbox.
        const now = Date.now()
        const notes = backup.notes.map(
          (entry, index): Note => ({
            id: crypto.randomUUID(),
            title: entry.title,
            content: entry.content,
            color: entry.color,
            pinned: entry.pinned,
            poppedOut: false,
            tags: entry.tags,
            sortOrder: index,
            folderId: 'notes-inbox',
            createdAt: now,
            updatedAt: now,
            ...(entry.taskStatus ? { taskStatus: entry.taskStatus } : {}),
            ...(entry.taskPriority ? { taskPriority: entry.taskPriority } : {}),
            ...(entry.taskDueDate ? { taskDueDate: entry.taskDueDate } : {}),
          })
        )
        await restoreNotesFromBackup([], notes)
      }
      // The database now durably references these files. Refresh failures must not roll them back.
      const committedRestoreToken = restoreToken
      restoreToken = null
      if (committedRestoreToken) await finalizeRestoredNoteAssets(committedRestoreToken)
      await Promise.all([useFoldersStore.getState().refresh(), useNotesStore.getState().refresh()])
      report(`${backup.notes.length} notes restored with attachments`, 'success')
    } catch (error) {
      if (restoreToken) {
        try {
          await rollbackRestoredNoteAssets(restoreToken)
        } catch {
          // Preserve the primary restore failure; orphan cleanup can find these files later.
        }
      }
      report(
        `Failed to restore notes: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      )
    }
  }, [report])

  return { exportBackup, importBackup }
}
