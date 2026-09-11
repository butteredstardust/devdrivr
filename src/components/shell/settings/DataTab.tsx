/** Settings → Data: defaults, stored-data counts, settings export/import and destructive resets. */
import { useCallback, useMemo } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'
import { useUiStore } from '@/stores/ui.store'
import { getCurrentWindow } from '@tauri-apps/api/window'
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
import { Input } from '@/components/shared/Input'
import { parseSettingsImport } from '@/lib/settings-transfer'
import {
  SettingRow,
  SelectInput,
  DangerButton,
  StatCard,
} from '@/components/shell/settings/SettingControls'

const POPULAR_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
] as const

export function DataTab() {
  const update = useSettingsStore((s) => s.update)
  const historyRetentionPerTool = useSettingsStore((s) => s.historyRetentionPerTool)
  const defaultTimezone = useSettingsStore((s) => s.defaultTimezone)
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
        sidebarWidth: state.sidebarWidth,
        notesDrawerOpen: state.notesDrawerOpen,
        notesDrawerWidth: state.notesDrawerWidth,
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
      await useSettingsStore.getState().importSettings(imported)
      // Apply alwaysOnTop to the live Tauri window
      const finalOnTop = useSettingsStore.getState().alwaysOnTop
      await getCurrentWindow().setAlwaysOnTop(finalOnTop)
      addToast('Settings imported', 'success')
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to import settings', 'error')
    }
  }, [addToast])

  const handleResetDefaults = useCallback(async () => {
    await useSettingsStore.getState().importSettings(DEFAULT_SETTINGS)
    await getCurrentWindow().setAlwaysOnTop(false)
  }, [])

  // Build timezone options: user's local TZ first, then popular list (deduped)
  const tzOptions = useMemo(() => {
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return [localTz, ...POPULAR_TIMEZONES.filter((tz) => tz !== localTz)].map((tz) => ({
      value: tz,
      label: tz.replace(/_/g, ' '),
    }))
  }, [])

  return (
    <div className="space-y-4">
      {/* Retention & Timezone */}
      <div className="space-y-1">
        <SettingRow label="History per Tool" hint={`Max entries retained per tool`}>
          <Input
            type="number"
            value={historyRetentionPerTool}
            onChange={(e) =>
              void update(
                'historyRetentionPerTool',
                Math.min(5000, Math.max(10, Number(e.target.value)))
              ).catch(() => {})
            }
            min={10}
            max={5000}
            className="w-20 text-right"
          />
        </SettingRow>
        <SettingRow label="Default Timezone" hint="Used by Timestamp Converter">
          <SelectInput
            value={defaultTimezone}
            onChange={(v) => void update('defaultTimezone', v).catch(() => {})}
            options={tzOptions}
          />
        </SettingRow>
      </div>

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
