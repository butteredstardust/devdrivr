/** Settings → Data: defaults, stored-data counts, settings export/import and destructive resets. */
import { useCallback } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'
import { useUiStore } from '@/stores/ui.store'
import { type AppSettings, DEFAULT_SETTINGS } from '@/types/models'
import {
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  ExportIcon,
  InfoIcon,
  TrashIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { parseSettingsImport } from '@/lib/settings-transfer'
import { setAlwaysOnTop } from '@/lib/always-on-top'
import {
  SettingRow,
  NumericSettingInput,
  DangerButton,
  StatCard,
} from '@/components/shell/settings/SettingControls'

export function DataTab() {
  const update = useSettingsStore((s) => s.update)
  const historyRetentionPerTool = useSettingsStore((s) => s.historyRetentionPerTool)
  const addToast = useUiStore((s) => s.addToast)

  // Storage stats
  const noteCount = useNotesStore((s) => s.notes.length)
  const snippetCount = useSnippetsStore((s) => s.snippets.length)
  const historyCount = useHistoryStore((s) => s.entries.length)

  const clearHistory = useHistoryStore((s) => s.clearAll)
  const clearSnippets = useSnippetsStore((s) => s.clearAll)
  const clearNotes = useNotesStore((s) => s.clearAll)

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

      {/* Data Management */}
      <div>
        <SectionLabel as="h4" className="mb-2">
          <TrashIcon size={12} />
          Clear Data
        </SectionLabel>
        <div className="flex flex-wrap gap-2">
          <DangerButton
            label={`Trash Notes (${noteCount})`}
            confirmLabel="Move all to Trash?"
            onConfirm={clearNotes}
            icon={<TrashIcon size={12} />}
            successMessage="Notes moved to Trash"
            errorMessage="Failed to move notes to Trash"
          />
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
          <button
            type="button"
            onClick={() => {
              void handleExportSettings()
            }}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <DownloadSimpleIcon size={12} />
            Export to Clipboard
          </button>
          <button
            type="button"
            onClick={() => {
              void handleImportSettings()
            }}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <UploadSimpleIcon size={12} />
            Import from Clipboard
          </button>
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
