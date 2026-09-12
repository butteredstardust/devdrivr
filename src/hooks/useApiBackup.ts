/**
 * WARNING: API backups can contain authentication values and environment variables.
 * Keep each exported file in a secure location.
 */
import { useCallback } from 'react'
import { importApiSpec } from '@/lib/api-import'
import { serializeApiExport } from '@/lib/api-transfer'
import { buildExportFilename, exportFile, openFileDialog } from '@/lib/file-io'
import { useApiStore } from '@/stores/api.store'
import type { ApiImportResult } from '@/types/models'
import type { BackupReporter } from '@/hooks/useNotesBackup'

export type ApiBackupActions = {
  exportBackup: () => Promise<void>
  importBackup: () => Promise<void>
}

/** Imports parsed API data and reports one outcome. */
export async function importApiBackupData(
  data: ApiImportResult,
  report: BackupReporter
): Promise<void> {
  const result = await useApiStore.getState().importApiData(data)
  report(
    `Imported ${result.requests} requests, ${result.collections} collections, and ${result.environments} environments`,
    'success'
  )
}

/** Parses API backup content, rejects empty imports, and reports one outcome. */
export async function importApiBackupContent(
  content: string,
  filename: string,
  report: BackupReporter
): Promise<void> {
  try {
    const parsed = importApiSpec({ content, filename })
    if (
      parsed.requests.length === 0 &&
      parsed.collections.length === 0 &&
      (parsed.environments?.length ?? 0) === 0
    ) {
      report('Import found no API requests, collections, or environments', 'error')
      return
    }
    await importApiBackupData(parsed, report)
  } catch (error) {
    report(error instanceof Error ? error.message : 'Failed to import API requests', 'error')
  }
}

export function useApiBackup(report: BackupReporter): ApiBackupActions {
  const exportBackup = useCallback(async () => {
    try {
      const { collections, requests, environments, activeEnvironmentId } = useApiStore.getState()
      const content = serializeApiExport({
        collections,
        requests,
        environments,
        activeEnvironmentId,
      })
      const path = await exportFile(
        content,
        buildExportFilename('devdrivr-api-requests-backup', 'json')
      )
      if (path) report(`${requests.length} API requests exported`, 'success')
    } catch (error) {
      report(error instanceof Error ? error.message : 'Failed to export API requests', 'error')
    }
  }, [report])

  const importBackup = useCallback(async () => {
    try {
      const file = await openFileDialog()
      if (!file) return
      await importApiBackupContent(file.content, file.filename, report)
    } catch (error) {
      report(error instanceof Error ? error.message : 'Failed to import API requests', 'error')
    }
  }, [report])

  return { exportBackup, importBackup }
}
