/** Settings backup transfer for Settings → Data. */
import { useCallback } from 'react'
import { setAlwaysOnTop } from '@/lib/always-on-top'
import { buildExportFilename, exportFile, openFileDialog } from '@/lib/file-io'
import { parseSettingsImport, serializeSettingsExport } from '@/lib/settings-transfer'
import { pickAppSettings, useSettingsStore } from '@/stores/settings.store'
import type { BackupReporter } from '@/hooks/useNotesBackup'

export type SettingsBackupActions = {
  exportBackup: () => Promise<void>
  importBackup: () => Promise<void>
}

export function useSettingsBackup(report: BackupReporter): SettingsBackupActions {
  const exportBackup = useCallback(async () => {
    try {
      const path = await exportFile(
        serializeSettingsExport(pickAppSettings(useSettingsStore.getState())),
        buildExportFilename('devdrivr-settings-backup', 'json')
      )
      if (path) report('Settings exported', 'success')
    } catch {
      report('Failed to export settings', 'error')
    }
  }, [report])

  const importBackup = useCallback(async () => {
    try {
      const file = await openFileDialog()
      if (!file) return
      const imported = parseSettingsImport(file.content)
      const { alwaysOnTop, ...otherSettings } = imported
      await useSettingsStore.getState().importSettings(otherSettings)
      if (alwaysOnTop !== undefined) await setAlwaysOnTop(alwaysOnTop)
      report('Settings imported', 'success')
    } catch (error) {
      report(error instanceof Error ? error.message : 'Failed to import settings', 'error')
    }
  }, [report])

  return { exportBackup, importBackup }
}
