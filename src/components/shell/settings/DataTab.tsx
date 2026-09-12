/** Settings → Data: stored-data counts, per-dataset transfer, settings transfer and resets. */
import { useCallback, useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'
import { useApiStore } from '@/stores/api.store'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS } from '@/types/models'
import {
  ArrowCounterClockwiseIcon,
  DatabaseIcon,
  DownloadSimpleIcon,
  ExportIcon,
  TrashIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { setAlwaysOnTop } from '@/lib/always-on-top'
import { useNotesBackup } from '@/hooks/useNotesBackup'
import { useSnippetsBackup } from '@/hooks/useSnippetsBackup'
import { useApiBackup } from '@/hooks/useApiBackup'
import { usePromptTemplatesBackup } from '@/hooks/usePromptTemplatesBackup'
import { useSettingsBackup } from '@/hooks/useSettingsBackup'
import {
  ActionSlotSpacer,
  SettingRow,
  NumericSettingInput,
  DangerButton,
  DatasetRow,
  TransferButton,
} from '@/components/shell/settings/SettingControls'

export function DataTab() {
  const update = useSettingsStore((s) => s.update)
  const historyRetentionPerTool = useSettingsStore((s) => s.historyRetentionPerTool)
  const addToast = useUiStore((s) => s.addToast)

  const noteCount = useNotesStore((s) => s.notes.length)
  const snippetCount = useSnippetsStore((s) => s.snippets.length)
  const historyCount = useHistoryStore((s) => s.entries.length)
  const requestCount = useApiStore((s) => s.requests.length)
  const templateCount = usePromptTemplatesStore((s) => s.userTemplates.length)

  const clearHistory = useHistoryStore((s) => s.clearAll)
  const clearSnippets = useSnippetsStore((s) => s.clearAll)
  const clearNotes = useNotesStore((s) => s.clearAll)
  const clearRequests = useApiStore((s) => s.clearAll)
  const clearTemplates = usePromptTemplatesStore((s) => s.clearAll)

  // Notes load at app start. Initialize each lazy dataset before enabling its actions.
  const notesReady = useNotesStore((s) => s.initialized)
  const snippetsReady = useSnippetsStore((s) => s.initialized)
  const requestsReady = useApiStore((s) => s.initialized)
  const templatesReady = usePromptTemplatesStore((s) => s.initialized)
  const historyReady = useHistoryStore((s) => s.initialized)

  useEffect(() => {
    void useSnippetsStore
      .getState()
      .init()
      .catch(() => addToast('Failed to load snippets', 'error'))
    void useApiStore
      .getState()
      .init()
      .catch(() => addToast('Failed to load API requests', 'error'))
    void usePromptTemplatesStore
      .getState()
      .init()
      .catch(() => addToast('Failed to load prompt templates', 'error'))
    void useHistoryStore
      .getState()
      .init()
      .catch(() => addToast('Failed to load history', 'error'))
  }, [addToast])

  /**
   * True while a dataset action runs. Every dataset button reads it.
   *
   * One action at a time, because a clear and an import touch the same rows: the clear reloads
   * from the database while the import appends to whatever state it finds, so interleaving them
   * duplicates or drops the imported rows.
   */
  const [busy, setBusy] = useState(false)

  const runExclusive = useCallback(
    (action: () => Promise<unknown>) => async () => {
      if (busy) return
      setBusy(true)
      try {
        await action()
      } finally {
        setBusy(false)
      }
    },
    [busy]
  )

  const { exportBackup: exportNotes, importBackup: importNotes } = useNotesBackup(addToast)
  const { exportBackup: exportSnippets, importBackup: importSnippets } = useSnippetsBackup(addToast)
  const { exportBackup: exportRequests, importBackup: importRequests } = useApiBackup(addToast)
  const { exportBackup: exportTemplates, importBackup: importTemplates } =
    usePromptTemplatesBackup(addToast)
  const { exportBackup: exportSettings, importBackup: importSettings } = useSettingsBackup(addToast)

  const handleResetDefaults = useCallback(async () => {
    const { alwaysOnTop, ...otherDefaults } = DEFAULT_SETTINGS
    await useSettingsStore.getState().importSettings(otherDefaults)
    await setAlwaysOnTop(alwaysOnTop)
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <SectionLabel as="h4" className="mb-1">
          <DatabaseIcon size={12} />
          Datasets
        </SectionLabel>
        <p className="mb-2 text-2xs text-[var(--color-text-muted)]">
          Trash keeps items and can be restored. Delete is permanent.
        </p>
        <div className="space-y-2">
          <DatasetRow label="Notes" count={noteCount}>
            <TransferButton
              label="Export"
              accessibleLabel="Export notes to a file"
              icon={<DownloadSimpleIcon size={12} />}
              disabled={busy || !notesReady}
              onClick={runExclusive(exportNotes)}
            />
            <TransferButton
              label="Import"
              accessibleLabel="Import notes from a file"
              icon={<UploadSimpleIcon size={12} />}
              disabled={busy || !notesReady}
              onClick={runExclusive(importNotes)}
            />
            <DangerButton
              label="Trash"
              accessibleLabel="Move notes to Trash"
              confirmLabel="Confirm?"
              onConfirm={runExclusive(clearNotes)}
              icon={<TrashIcon size={12} />}
              disabled={busy || !notesReady}
              successMessage="Notes moved to Trash"
              errorMessage="Failed to move notes to Trash"
            />
          </DatasetRow>

          <DatasetRow label="Snippets" count={snippetCount}>
            <TransferButton
              label="Export"
              accessibleLabel="Export snippets to a file"
              icon={<DownloadSimpleIcon size={12} />}
              disabled={busy || !snippetsReady}
              onClick={runExclusive(exportSnippets)}
            />
            <TransferButton
              label="Import"
              accessibleLabel="Import snippets from a file"
              icon={<UploadSimpleIcon size={12} />}
              disabled={busy || !snippetsReady}
              onClick={runExclusive(importSnippets)}
            />
            <DangerButton
              label="Trash"
              accessibleLabel="Move snippets to Trash"
              confirmLabel="Confirm?"
              onConfirm={runExclusive(clearSnippets)}
              icon={<TrashIcon size={12} />}
              disabled={busy || !snippetsReady}
              successMessage="Snippets moved to Trash"
              errorMessage="Failed to move snippets to Trash"
            />
          </DatasetRow>

          <DatasetRow label="API Requests" count={requestCount}>
            <TransferButton
              label="Export"
              accessibleLabel="Export API requests to a file"
              icon={<DownloadSimpleIcon size={12} />}
              disabled={busy || !requestsReady}
              onClick={runExclusive(exportRequests)}
            />
            <TransferButton
              label="Import"
              accessibleLabel="Import API requests from a file"
              icon={<UploadSimpleIcon size={12} />}
              disabled={busy || !requestsReady}
              onClick={runExclusive(importRequests)}
            />
            <DangerButton
              label="Trash"
              accessibleLabel="Move API requests to Trash"
              confirmLabel="Confirm?"
              onConfirm={runExclusive(clearRequests)}
              icon={<TrashIcon size={12} />}
              disabled={busy || !requestsReady}
              successMessage="API requests moved to Trash"
              errorMessage="Failed to move API requests to Trash"
            />
          </DatasetRow>

          <DatasetRow label="Prompt Templates" count={templateCount}>
            <TransferButton
              label="Export"
              accessibleLabel="Export prompt templates to a file"
              icon={<DownloadSimpleIcon size={12} />}
              disabled={busy || !templatesReady}
              onClick={runExclusive(exportTemplates)}
            />
            <TransferButton
              label="Import"
              accessibleLabel="Import prompt templates from a file"
              icon={<UploadSimpleIcon size={12} />}
              disabled={busy || !templatesReady}
              onClick={runExclusive(importTemplates)}
            />
            <DangerButton
              label="Delete"
              accessibleLabel="Delete prompt templates permanently"
              confirmLabel="Confirm?"
              onConfirm={runExclusive(clearTemplates)}
              icon={<TrashIcon size={12} />}
              disabled={busy || !templatesReady}
              successMessage="Custom prompt templates deleted"
              errorMessage="Failed to delete prompt templates"
            />
          </DatasetRow>
          <DatasetRow label="History" count={historyCount}>
            <ActionSlotSpacer />
            <ActionSlotSpacer />
            <DangerButton
              label="Delete"
              accessibleLabel="Delete history permanently"
              confirmLabel="Confirm?"
              onConfirm={runExclusive(clearHistory)}
              icon={<TrashIcon size={12} />}
              disabled={busy || !historyReady}
              successMessage="History deleted"
              errorMessage="Failed to delete history"
            />
          </DatasetRow>
        </div>
        <div className="mt-2">
          <SettingRow label="History per Tool" hint="Max entries retained per tool">
            <NumericSettingInput
              value={historyRetentionPerTool}
              min={10}
              max={5000}
              clamp={(value) => Math.max(10, Math.min(5000, Math.round(value)))}
              unit="entries per tool"
              onCommit={(value) => void update('historyRetentionPerTool', value).catch(() => {})}
            />
          </SettingRow>
        </div>
      </div>

      <div>
        <SectionLabel as="h4" className="mb-2">
          <ExportIcon size={12} />
          Settings
        </SectionLabel>
        <div className="flex flex-wrap gap-2">
          <TransferButton
            label="Export"
            accessibleLabel="Export settings to a file"
            icon={<DownloadSimpleIcon size={12} />}
            onClick={exportSettings}
          />
          <TransferButton
            label="Import"
            accessibleLabel="Import settings from a file"
            icon={<UploadSimpleIcon size={12} />}
            onClick={importSettings}
          />
          <DangerButton
            label="Reset to defaults"
            confirmLabel="Confirm reset?"
            onConfirm={handleResetDefaults}
            icon={<ArrowCounterClockwiseIcon size={12} />}
            successMessage="Settings reset to defaults"
            errorMessage="Failed to reset settings"
          />
        </div>
      </div>
    </div>
  )
}
