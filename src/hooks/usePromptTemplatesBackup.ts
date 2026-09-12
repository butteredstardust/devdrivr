/** Prompt template backup transfer for tools and Settings. */
import { useCallback } from 'react'
import { buildExportFilename, exportFile, openFileDialog } from '@/lib/file-io'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import {
  parsePromptTemplateImport,
  serializePromptTemplateExport,
  templateToDraft,
} from '@/lib/prompt-template-transfer'
import type { BackupReporter } from '@/hooks/useNotesBackup'

export type PromptTemplatesBackupActions = {
  exportBackup: () => Promise<void>
  importBackup: () => Promise<string | null>
}

export function usePromptTemplatesBackup(report: BackupReporter): PromptTemplatesBackupActions {
  const exportBackup = useCallback(async () => {
    try {
      const { userTemplates } = usePromptTemplatesStore.getState()
      const drafts = userTemplates.map(templateToDraft)
      const path = await exportFile(
        serializePromptTemplateExport(drafts),
        buildExportFilename('devdrivr-prompt-templates-backup', 'json')
      )
      if (path) report(`Exported ${drafts.length} prompt templates`, 'success')
    } catch {
      report('Failed to export prompt templates', 'error')
    }
  }, [report])

  const importBackup = useCallback(async () => {
    try {
      const file = await openFileDialog()
      if (!file) return null
      const drafts = parsePromptTemplateImport(file.content, 'file')
      const imported = await usePromptTemplatesStore.getState().importMany(drafts)
      report(`Imported ${imported.length} prompt template(s)`, 'success')
      return imported[0]?.id ?? null
    } catch (error) {
      report(error instanceof Error ? error.message : 'Import failed', 'error')
      return null
    }
  }, [report])

  return { exportBackup, importBackup }
}
