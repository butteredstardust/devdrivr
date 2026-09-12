/** Settings → Data: stored-data counts, per-dataset transfer, settings transfer and resets. */
import { useCallback, useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'
import { useApiStore } from '@/stores/api.store'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import { useUiStore } from '@/stores/ui.store'
import { type AppSettings, DEFAULT_SETTINGS } from '@/types/models'
import {
  ArrowCounterClockwiseIcon,
  DatabaseIcon,
  DownloadSimpleIcon,
  ExportIcon,
  InfoIcon,
  TrashIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { parseSettingsImport } from '@/lib/settings-transfer'
import { serializeApiExport } from '@/lib/api-transfer'
import { importApiSpec } from '@/lib/api-import'
import { buildExportFilename, exportFile, openFileDialog } from '@/lib/file-io'
import { setAlwaysOnTop } from '@/lib/always-on-top'
import { useNotesBackup } from '@/hooks/useNotesBackup'
import {
  parsePromptTemplateImport,
  serializePromptTemplateExport,
} from '@/tools/prompt-templates/template-import'
import { templateToDraft } from '@/tools/prompt-templates/template-utils'
import {
  SettingRow,
  NumericSettingInput,
  DangerButton,
  DatasetRow,
  StatCard,
  TransferButton,
} from '@/components/shell/settings/SettingControls'

export function DataTab() {
  const update = useSettingsStore((s) => s.update)
  const historyRetentionPerTool = useSettingsStore((s) => s.historyRetentionPerTool)
  const addToast = useUiStore((s) => s.addToast)

  // Storage stats
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

  // Notes load at app start. These two load lazily, so opening this tab is the first read for a
  // session that never opened the tool.
  const notesReady = useNotesStore((s) => s.initialized)
  const requestsReady = useApiStore((s) => s.initialized)
  const templatesReady = usePromptTemplatesStore((s) => s.initialized)

  useEffect(() => {
    void useApiStore
      .getState()
      .init()
      .catch(() => addToast('Failed to load API requests', 'error'))
    void usePromptTemplatesStore
      .getState()
      .init()
      .catch(() => addToast('Failed to load prompt templates', 'error'))
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
    (action: () => Promise<void>) => async () => {
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

  const handleExportRequests = useCallback(async () => {
    try {
      const { collections, requests, environments, activeEnvironmentId } = useApiStore.getState()
      const json = serializeApiExport({ collections, requests, environments, activeEnvironmentId })
      const path = await exportFile(json, buildExportFilename('devdrivr-api-backup', 'json'))
      if (path) addToast(`${requests.length} API requests exported`, 'success')
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to export API requests', 'error')
    }
  }, [addToast])

  const handleImportRequests = useCallback(async () => {
    try {
      const file = await openFileDialog()
      if (!file) return
      const parsed = importApiSpec({ content: file.content, filename: file.filename })
      const result = await useApiStore.getState().importApiData(parsed)
      addToast(
        `Imported ${result.requests} requests, ${result.collections} collections, and ${result.environments} environments`,
        'success'
      )
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to import API requests', 'error')
    }
  }, [addToast])

  const handleExportTemplates = useCallback(async () => {
    try {
      const { userTemplates } = usePromptTemplatesStore.getState()
      const json = serializePromptTemplateExport(userTemplates.map(templateToDraft))
      const path = await exportFile(json, buildExportFilename('prompt-templates-backup', 'json'))
      if (path) addToast(`${userTemplates.length} prompt templates exported`, 'success')
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Failed to export prompt templates',
        'error'
      )
    }
  }, [addToast])

  const handleImportTemplates = useCallback(async () => {
    try {
      const file = await openFileDialog()
      if (!file) return
      const drafts = parsePromptTemplateImport(file.content, 'file')
      const imported = await usePromptTemplatesStore.getState().importMany(drafts)
      addToast(`Imported ${imported.length} prompt template(s)`, 'success')
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Failed to import prompt templates',
        'error'
      )
    }
  }, [addToast])

  const handleExportSettings = useCallback(async () => {
    try {
      const state = useSettingsStore.getState()
      const data: AppSettings = {
        theme: state.theme,
        shellStyle: state.shellStyle,
        alwaysOnTop: state.alwaysOnTop,
        sidebarCollapsed: state.sidebarCollapsed,
        collapsedSidebarGroups: state.collapsedSidebarGroups,
        openedSidebarGroups: state.openedSidebarGroups,
        pinnedToolIds: state.pinnedToolIds,
        recentToolsLimit: state.recentToolsLimit,
        sidebarWidth: state.sidebarWidth,
        notesDrawerOpen: state.notesDrawerOpen,
        notesDrawerWidth: state.notesDrawerWidth,
        restoreWorkspaceOnLaunch: state.restoreWorkspaceOnLaunch,
        defaultIndentSize: state.defaultIndentSize,
        defaultTimezone: state.defaultTimezone,
        editorFont: state.editorFont,
        editorFontSize: state.editorFontSize,
        editorTheme: state.editorTheme,
        editorKeybindingMode: state.editorKeybindingMode,
        editorWordWrap: state.editorWordWrap,
        editorMinimap: state.editorMinimap,
        editorLineNumbers: state.editorLineNumbers,
        editorFolding: state.editorFolding,
        editorStickyScroll: state.editorStickyScroll,
        editorRenderWhitespace: state.editorRenderWhitespace,
        editorInsertSpaces: state.editorInsertSpaces,
        editorBracketPairColorization: state.editorBracketPairColorization,
        editorCursorStyle: state.editorCursorStyle,
        editorScrollBeyondLastLine: state.editorScrollBeyondLastLine,
        historyRetentionPerTool: state.historyRetentionPerTool,
        formatOnPaste: state.formatOnPaste,
        checkForUpdatesAutomatically: state.checkForUpdatesAutomatically,
        downloadUpdatesAutomatically: state.downloadUpdatesAutomatically,
        notifyWhenUpdateAvailable: state.notifyWhenUpdateAvailable,
      }
      const json = JSON.stringify(data, null, 2)
      await navigator.clipboard.writeText(json)
      addToast('Settings copied to clipboard', 'success')
    } catch {
      addToast('Failed to copy settings', 'error')
    }
  }, [addToast])

  const handleImportSettings = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      const imported = parseSettingsImport(text)
      const { alwaysOnTop, ...otherSettings } = imported
      await useSettingsStore.getState().importSettings(otherSettings)
      if (alwaysOnTop !== undefined) await setAlwaysOnTop(alwaysOnTop)
      addToast('Settings imported', 'success')
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to import settings', 'error')
    }
  }, [addToast])

  const handleResetDefaults = useCallback(async () => {
    const { alwaysOnTop, ...otherDefaults } = DEFAULT_SETTINGS
    await useSettingsStore.getState().importSettings(otherDefaults)
    await setAlwaysOnTop(alwaysOnTop)
  }, [])

  return (
    <div className="space-y-4">
      {/* Storage Stats */}
      <div>
        <SectionLabel as="h4" className="mb-2">
          <InfoIcon size={12} />
          Storage
        </SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Notes" count={noteCount} />
          <StatCard label="Snippets" count={snippetCount} />
          <StatCard label="History" count={historyCount} />
          <StatCard label="API Requests" count={requestCount} />
          <StatCard label="Prompt Templates" count={templateCount} />
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

      {/* Per-dataset transfer */}
      <div>
        <SectionLabel as="h4" className="mb-2">
          <DatabaseIcon size={12} />
          Datasets
        </SectionLabel>
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
              label="Trash notes"
              confirmLabel="Move notes to Trash?"
              onConfirm={runExclusive(clearNotes)}
              icon={<TrashIcon size={12} />}
              disabled={busy || !notesReady}
              successMessage="Notes moved to Trash"
              errorMessage="Failed to move notes to Trash"
            />
          </DatasetRow>

          <DatasetRow label="API Requests" count={requestCount}>
            <TransferButton
              label="Export"
              accessibleLabel="Export API requests to a file"
              icon={<DownloadSimpleIcon size={12} />}
              disabled={busy || !requestsReady}
              onClick={runExclusive(handleExportRequests)}
            />
            <TransferButton
              label="Import"
              accessibleLabel="Import API requests from a file"
              icon={<UploadSimpleIcon size={12} />}
              disabled={busy || !requestsReady}
              onClick={runExclusive(handleImportRequests)}
            />
            <DangerButton
              label="Trash requests"
              confirmLabel="Move requests to Trash?"
              onConfirm={runExclusive(clearRequests)}
              icon={<TrashIcon size={12} />}
              disabled={busy || !requestsReady}
              successMessage="API requests moved to Trash"
              errorMessage="Failed to move API requests to Trash"
            />
          </DatasetRow>

          {/* Custom templates have no Trash table, so this one deletes. The button says so. */}
          <DatasetRow label="Prompt Templates" count={templateCount}>
            <TransferButton
              label="Export"
              accessibleLabel="Export prompt templates to a file"
              icon={<DownloadSimpleIcon size={12} />}
              disabled={busy || !templatesReady}
              onClick={runExclusive(handleExportTemplates)}
            />
            <TransferButton
              label="Import"
              accessibleLabel="Import prompt templates from a file"
              icon={<UploadSimpleIcon size={12} />}
              disabled={busy || !templatesReady}
              onClick={runExclusive(handleImportTemplates)}
            />
            <DangerButton
              label="Delete templates"
              confirmLabel="Delete permanently?"
              onConfirm={runExclusive(clearTemplates)}
              icon={<TrashIcon size={12} />}
              disabled={busy || !templatesReady}
              successMessage="Custom prompt templates deleted"
              errorMessage="Failed to delete prompt templates"
            />
          </DatasetRow>
        </div>
      </div>

      {/* Datasets without a transfer format of their own */}
      <div>
        <SectionLabel as="h4" className="mb-2">
          <TrashIcon size={12} />
          Clear Data
        </SectionLabel>
        <div className="flex flex-wrap gap-2">
          <DangerButton
            label={`Trash Snippets (${snippetCount})`}
            confirmLabel="Move all to Trash?"
            onConfirm={clearSnippets}
            icon={<TrashIcon size={12} />}
            successMessage="Snippets moved to Trash"
            errorMessage="Failed to move snippets to Trash"
          />
          <DangerButton
            label={`Clear History (${historyCount})`}
            confirmLabel="Confirm clear?"
            onConfirm={clearHistory}
            icon={<TrashIcon size={12} />}
            successMessage="History cleared"
            errorMessage="Failed to clear history"
          />
        </div>
      </div>

      {/* Export / Import / Reset */}
      <div>
        <SectionLabel as="h4" className="mb-2">
          <ExportIcon size={12} />
          Settings Transfer
        </SectionLabel>
        <div className="flex flex-wrap gap-2">
          <TransferButton
            label="Export to Clipboard"
            icon={<DownloadSimpleIcon size={12} />}
            onClick={handleExportSettings}
          />
          <TransferButton
            label="Import from Clipboard"
            icon={<UploadSimpleIcon size={12} />}
            onClick={handleImportSettings}
          />
          <DangerButton
            label="Reset to Defaults"
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
