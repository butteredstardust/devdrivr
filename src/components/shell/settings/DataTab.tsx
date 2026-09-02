/** Settings → Data: defaults, stored-data counts, settings export/import and destructive resets. */
import { useCallback, useMemo } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'
import { useUiStore } from '@/stores/ui.store'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { type AppSettings, DEFAULT_SETTINGS, type Theme } from '@/types/models'
import { TOOLS } from '@/app/tool-registry'
import {
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  ExportIcon,
  InfoIcon,
  TrashIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { ALL_THEMES } from '@/lib/theme'
import { Input } from '@/components/shared/Input'
import { clampSidebarWidth } from '@/lib/shell-layout'
import {
  SettingRow,
  SelectInput,
  DangerButton,
  StatCard,
} from '@/components/shell/settings/SettingControls'

/**
 * Editor toggles the settings import validates as a group. They are all plain
 * booleans with no further constraint, so listing them beats another nine
 * near-identical `if (typeof obj[...] === 'boolean')` lines.
 */
const BOOLEAN_EDITOR_SETTINGS = [
  'editorWordWrap',
  'editorMinimap',
  'editorLineNumbers',
  'editorFolding',
  'editorStickyScroll',
  'editorInsertSpaces',
  'editorBracketPairColorization',
] as const satisfies readonly (keyof AppSettings)[]

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
    const validThemes = new Set<Theme>(['system', ...ALL_THEMES])
    const validKeybindings = new Set<AppSettings['editorKeybindingMode']>(['standard'])
    const validGroups = new Set<AppSettings['collapsedSidebarGroups'][number]>([
      'code',
      'data',
      'web',
      'convert',
      'test',
      'network',
      'write',
    ])
    const validToolIds = new Set(TOOLS.map((tool) => tool.id))
    const isToolGroup = (id: unknown): id is AppSettings['collapsedSidebarGroups'][number] =>
      typeof id === 'string' && validGroups.has(id as AppSettings['collapsedSidebarGroups'][number])

    try {
      const text = await navigator.clipboard.readText()
      const parsed: unknown = JSON.parse(text)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        addToast('Invalid settings JSON', 'error')
        return
      }
      const obj = parsed as Record<string, unknown>
      const su = useSettingsStore.getState().update
      // Validated enum fields
      if (typeof obj['theme'] === 'string' && validThemes.has(obj['theme'] as Theme))
        await su('theme', obj['theme'] as Theme)
      if (
        typeof obj['editorKeybindingMode'] === 'string' &&
        validKeybindings.has(obj['editorKeybindingMode'] as AppSettings['editorKeybindingMode'])
      )
        await su(
          'editorKeybindingMode',
          obj['editorKeybindingMode'] as AppSettings['editorKeybindingMode']
        )
      if (
        typeof obj['editorTheme'] === 'string' &&
        ['devdrivr-dark', 'devdrivr-light', 'match-app'].includes(obj['editorTheme'])
      )
        await su('editorTheme', obj['editorTheme'] as AppSettings['editorTheme'])
      if (
        typeof obj['editorRenderWhitespace'] === 'string' &&
        ['none', 'boundary', 'all'].includes(obj['editorRenderWhitespace'])
      )
        await su(
          'editorRenderWhitespace',
          obj['editorRenderWhitespace'] as AppSettings['editorRenderWhitespace']
        )
      if (
        typeof obj['editorCursorStyle'] === 'string' &&
        ['line', 'block', 'underline'].includes(obj['editorCursorStyle'])
      )
        await su('editorCursorStyle', obj['editorCursorStyle'] as AppSettings['editorCursorStyle'])
      // Boolean fields
      if (typeof obj['alwaysOnTop'] === 'boolean') await su('alwaysOnTop', obj['alwaysOnTop'])
      if (obj['shellStyle'] === 'flush' || obj['shellStyle'] === 'floating') {
        await su('shellStyle', obj['shellStyle'])
      }
      if (typeof obj['formatOnPaste'] === 'boolean') await su('formatOnPaste', obj['formatOnPaste'])
      for (const key of BOOLEAN_EDITOR_SETTINGS) {
        if (typeof obj[key] === 'boolean') await su(key, obj[key])
      }
      if (typeof obj['checkForUpdatesAutomatically'] === 'boolean')
        await su('checkForUpdatesAutomatically', obj['checkForUpdatesAutomatically'])
      if (typeof obj['downloadUpdatesAutomatically'] === 'boolean')
        await su('downloadUpdatesAutomatically', obj['downloadUpdatesAutomatically'])
      if (typeof obj['notifyWhenUpdateAvailable'] === 'boolean')
        await su('notifyWhenUpdateAvailable', obj['notifyWhenUpdateAvailable'])
      if (typeof obj['sidebarCollapsed'] === 'boolean')
        await su('sidebarCollapsed', obj['sidebarCollapsed'])
      if (typeof obj['notesDrawerOpen'] === 'boolean')
        await su('notesDrawerOpen', obj['notesDrawerOpen'])
      // Number fields
      if (typeof obj['defaultIndentSize'] === 'number')
        await su('defaultIndentSize', obj['defaultIndentSize'])
      if (typeof obj['editorFontSize'] === 'number')
        await su('editorFontSize', obj['editorFontSize'])
      if (typeof obj['historyRetentionPerTool'] === 'number')
        await su('historyRetentionPerTool', obj['historyRetentionPerTool'])
      if (typeof obj['notesDrawerWidth'] === 'number')
        await su('notesDrawerWidth', obj['notesDrawerWidth'])
      if (typeof obj['sidebarWidth'] === 'number' && Number.isFinite(obj['sidebarWidth'])) {
        await su('sidebarWidth', clampSidebarWidth(obj['sidebarWidth']))
      }
      // String fields
      const validFonts = new Set<AppSettings['editorFont']>([
        'JetBrains Mono',
        'Fira Code',
        'Cascadia Code',
        'Source Code Pro',
      ])
      if (
        typeof obj['editorFont'] === 'string' &&
        validFonts.has(obj['editorFont'] as AppSettings['editorFont'])
      )
        await su('editorFont', obj['editorFont'] as AppSettings['editorFont'])
      if (typeof obj['defaultTimezone'] === 'string')
        await su('defaultTimezone', obj['defaultTimezone'])
      if (Array.isArray(obj['collapsedSidebarGroups'])) {
        await su('collapsedSidebarGroups', obj['collapsedSidebarGroups'].filter(isToolGroup))
      }
      if (Array.isArray(obj['openedSidebarGroups'])) {
        await su('openedSidebarGroups', obj['openedSidebarGroups'].filter(isToolGroup))
      }
      if (Array.isArray(obj['pinnedToolIds'])) {
        await su(
          'pinnedToolIds',
          obj['pinnedToolIds'].filter(
            (id): id is string => typeof id === 'string' && validToolIds.has(id)
          )
        )
      }
      // Apply alwaysOnTop to the live Tauri window
      const finalOnTop = useSettingsStore.getState().alwaysOnTop
      await getCurrentWindow().setAlwaysOnTop(finalOnTop)
      addToast('Settings imported', 'success')
    } catch {
      addToast('Failed to import settings', 'error')
    }
  }, [addToast])

  const handleResetDefaults = useCallback(async () => {
    const settingsUpdate = useSettingsStore.getState().update
    const keys = Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>
    for (const key of keys) {
      await settingsUpdate(key, DEFAULT_SETTINGS[key])
    }
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
            label={`Clear Notes (${noteCount})`}
            confirmLabel="Confirm clear?"
            onConfirm={clearNotes}
            icon={<TrashIcon size={12} />}
            successMessage="Notes cleared"
            errorMessage="Failed to clear notes"
          />
          <DangerButton
            label={`Clear Snippets (${snippetCount})`}
            confirmLabel="Confirm clear?"
            onConfirm={clearSnippets}
            icon={<TrashIcon size={12} />}
            successMessage="Snippets cleared"
            errorMessage="Failed to clear snippets"
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
