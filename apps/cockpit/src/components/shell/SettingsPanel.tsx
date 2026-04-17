import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'
import { MCP_ACTIONS, MCP_RESOURCE_LABELS, MCP_RESOURCES, useMcpStore } from '@/stores/mcp.store'
import { useUiStore } from '@/stores/ui.store'
import { useUpdaterStore } from '@/stores/updater.store'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { DEFAULT_SETTINGS, type AppSettings, type Theme } from '@/types/models'
import { TOOLS } from '@/app/tool-registry'
import {
  GearSixIcon,
  CodeIcon,
  DatabaseIcon,
  ArrowCounterClockwiseIcon,
  ExportIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  TrashIcon,
  WarningIcon,
  CheckCircleIcon,
  InfoIcon,
  ArrowCircleUpIcon,
  SpinnerIcon,
  PlugsConnectedIcon,
  PowerIcon,
  StopCircleIcon,
  ArrowClockwiseIcon,
  CopyIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react'
import { Dialog } from '@/components/shared/Dialog'
import { Toggle } from '@/components/shared/Toggle'
import { ALL_THEMES, THEME_META } from '@/lib/theme'
import { getVersion } from '@tauri-apps/api/app'

// ─── Constants ───────────────────────────────────────────────────────

type TabId = 'general' | 'editor' | 'data' | 'mcp'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <GearSixIcon size={14} /> },
  { id: 'editor', label: 'Editor', icon: <CodeIcon size={14} /> },
  { id: 'data', label: 'Data', icon: <DatabaseIcon size={14} /> },
  { id: 'mcp', label: 'MCP', icon: <PlugsConnectedIcon size={14} /> },
]

const INDENT_OPTIONS = [2, 4] as const
const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 18, 20] as const
const FONT_FAMILY_OPTIONS: AppSettings['editorFont'][] = [
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'Source Code Pro',
]

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  ...ALL_THEMES.map((id) => ({ value: id as Theme, label: THEME_META[id].fullLabel })),
]

const KEYBINDING_OPTIONS: { value: AppSettings['editorKeybindingMode']; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'vim', label: 'Vim' },
  { value: 'emacs', label: 'Emacs' },
]

const EDITOR_THEME_OPTIONS: { value: AppSettings['editorTheme']; label: string }[] = [
  { value: 'cockpit-dark', label: 'Dark (default)' },
  { value: 'cockpit-light', label: 'Light' },
  { value: 'match-app', label: 'Match App Theme' },
]

const MIN_MCP_PORT = 1024
const MAX_MCP_PORT = 65535

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

// ─── Shared Components ──────────────────────────────────────────────

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex flex-col">
        <span className="text-xs text-[var(--color-text)]">{label}</span>
        {hint && <span className="text-[10px] text-[var(--color-text-muted)]">{hint}</span>}
      </div>
      <div className="flex items-center">{children}</div>
    </div>
  )
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string | number
  onChange: (v: string) => void
  options: { value: string | number; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function DangerButton({
  label,
  confirmLabel,
  onConfirm,
  icon,
  successMessage,
  errorMessage,
}: {
  label: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  icon: React.ReactNode
  successMessage: string
  errorMessage: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)
  const addToast = useUiStore((s) => s.addToast)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true)
      timerRef.current = setTimeout(() => setConfirming(false), 3000)
      return
    }
    clearTimeout(timerRef.current)
    setPending(true)
    try {
      await onConfirm()
      setDone(true)
      addToast(successMessage, 'success')
      timerRef.current = setTimeout(() => setDone(false), 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addToast(`${errorMessage}: ${msg}`, 'error')
    } finally {
      setPending(false)
      setConfirming(false)
    }
  }

  if (done) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 rounded border border-[var(--color-success)] px-2.5 py-1.5 text-xs text-[var(--color-success)]"
      >
        <CheckCircleIcon size={12} />
        Done
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs transition-colors ${
        confirming
          ? 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-error)] hover:text-[var(--color-error)]'
      } disabled:pointer-events-none disabled:opacity-60`}
    >
      {pending ? (
        <SpinnerIcon size={12} className="animate-spin" aria-hidden="true" />
      ) : confirming ? (
        <WarningIcon size={12} aria-hidden="true" />
      ) : (
        icon
      )}
      {pending ? 'Working…' : confirming ? confirmLabel : label}
    </button>
  )
}

// ─── Tab Panels ─────────────────────────────────────────────────────

function GeneralTab() {
  const update = useSettingsStore((s) => s.update)
  const theme = useSettingsStore((s) => s.theme)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const checkForUpdatesAutomatically = useSettingsStore((s) => s.checkForUpdatesAutomatically)
  const downloadUpdatesAutomatically = useSettingsStore((s) => s.downloadUpdatesAutomatically)
  const notifyWhenUpdateAvailable = useSettingsStore((s) => s.notifyWhenUpdateAvailable)
  const addToast = useUiStore((s) => s.addToast)

  const isChecking = useUpdaterStore((s) => s.isChecking)
  const lastCheckedAt = useUpdaterStore((s) => s.lastCheckedAt)
  const updateInfo = useUpdaterStore((s) => s.updateInfo)
  const checkForUpdate = useUpdaterStore((s) => s.checkForUpdate)

  const [appVersion, setAppVersion] = useState<string | null>(null)
  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {})
  }, [])

  const handleAlwaysOnTop = useCallback(
    (checked: boolean) => {
      getCurrentWindow()
        .setAlwaysOnTop(checked)
        .then(() => update('alwaysOnTop', checked))
        .catch(() => addToast('Failed to update window pin state', 'error'))
    },
    [addToast, update]
  )

  const lastCheckedLabel = lastCheckedAt
    ? `Last checked ${new Date(lastCheckedAt).toLocaleTimeString()}`
    : null

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <SettingRow label="Theme" hint="Appearance mode for the app">
          <SelectInput
            value={theme}
            onChange={(v) => update('theme', v as Theme).catch(() => {})}
            options={THEME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </SettingRow>
        <SettingRow label="Always on Top" hint="Keep window above all others">
          <Toggle checked={alwaysOnTop} onChange={handleAlwaysOnTop} />
        </SettingRow>
        <SettingRow label="Sidebar Collapsed" hint="Start with sidebar collapsed">
          <Toggle
            checked={sidebarCollapsed}
            onChange={(v) => update('sidebarCollapsed', v).catch(() => {})}
          />
        </SettingRow>
      </div>

      {/* Updates */}
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          <ArrowCircleUpIcon size={10} />
          Updates
        </h4>
        <div className="space-y-1">
          <SettingRow label="Check for updates automatically" hint="Check on every app launch">
            <Toggle
              checked={checkForUpdatesAutomatically}
              onChange={(v) => update('checkForUpdatesAutomatically', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow
            label="Download update automatically"
            hint="Save installer to Downloads folder"
          >
            <Toggle
              checked={downloadUpdatesAutomatically}
              onChange={(v) => update('downloadUpdatesAutomatically', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Notify when update is available" hint="Show banner at top of app">
            <Toggle
              checked={notifyWhenUpdateAvailable}
              onChange={(v) => update('notifyWhenUpdateAvailable', v).catch(() => {})}
            />
          </SettingRow>
        </div>

        <div className="mt-2 flex items-center gap-3">
          {appVersion && (
            <span className="text-[10px] text-[var(--color-text-muted)]">v{appVersion}</span>
          )}
          <button
            type="button"
            onClick={() => {
              void checkForUpdate(true)
            }}
            disabled={isChecking}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
          >
            {isChecking ? (
              <SpinnerIcon size={12} className="animate-spin" />
            ) : (
              <ArrowCircleUpIcon size={12} />
            )}
            {isChecking ? 'Checking…' : 'Check Now'}
          </button>
          {updateInfo && (
            <span className="text-xs text-[var(--color-accent)]">
              v{updateInfo.version} available
            </span>
          )}
          {!updateInfo && lastCheckedLabel && (
            <span className="text-[10px] text-[var(--color-text-muted)]">{lastCheckedLabel}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function EditorTab() {
  const update = useSettingsStore((s) => s.update)
  const editorFont = useSettingsStore((s) => s.editorFont)
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const defaultIndentSize = useSettingsStore((s) => s.defaultIndentSize)
  const editorTheme = useSettingsStore((s) => s.editorTheme)
  const editorKeybindingMode = useSettingsStore((s) => s.editorKeybindingMode)
  const formatOnPaste = useSettingsStore((s) => s.formatOnPaste)

  return (
    <div className="space-y-1">
      <SettingRow label="Font Family" hint="Monaco editor font family">
        <SelectInput
          value={editorFont}
          onChange={(v) => update('editorFont', v as AppSettings['editorFont']).catch(() => {})}
          options={FONT_FAMILY_OPTIONS.map((f) => ({ value: f, label: f }))}
        />
      </SettingRow>
      <SettingRow label="Font Size" hint="Monaco editor font size">
        <SelectInput
          value={editorFontSize}
          onChange={(v) => update('editorFontSize', Number(v)).catch(() => {})}
          options={FONT_SIZE_OPTIONS.map((s) => ({ value: s, label: `${s}px` }))}
        />
      </SettingRow>
      <SettingRow label="Indent Size" hint="Spaces per indent level">
        <SelectInput
          value={defaultIndentSize}
          onChange={(v) => update('defaultIndentSize', Number(v)).catch(() => {})}
          options={INDENT_OPTIONS.map((s) => ({ value: s, label: `${s} spaces` }))}
        />
      </SettingRow>
      <SettingRow label="Editor Theme" hint="Monaco editor color scheme">
        <SelectInput
          value={editorTheme}
          onChange={(v) => update('editorTheme', v as AppSettings['editorTheme']).catch(() => {})}
          options={EDITOR_THEME_OPTIONS}
        />
      </SettingRow>
      <SettingRow label="Keybinding Mode" hint="Keyboard shortcuts style">
        <SelectInput
          value={editorKeybindingMode}
          onChange={(v) =>
            update('editorKeybindingMode', v as AppSettings['editorKeybindingMode']).catch(() => {})
          }
          options={KEYBINDING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </SettingRow>
      <SettingRow label="Format on Paste" hint="Auto-format code when pasting">
        <Toggle
          checked={formatOnPaste}
          onChange={(v) => update('formatOnPaste', v).catch(() => {})}
        />
      </SettingRow>
    </div>
  )
}

function DataTab() {
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
        alwaysOnTop: state.alwaysOnTop,
        sidebarCollapsed: state.sidebarCollapsed,
        collapsedSidebarGroups: state.collapsedSidebarGroups,
        pinnedToolIds: state.pinnedToolIds,
        notesDrawerOpen: state.notesDrawerOpen,
        notesDrawerWidth: state.notesDrawerWidth,
        defaultIndentSize: state.defaultIndentSize,
        defaultTimezone: state.defaultTimezone,
        editorFont: state.editorFont,
        editorFontSize: state.editorFontSize,
        editorTheme: state.editorTheme,
        editorKeybindingMode: state.editorKeybindingMode,
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
    const validThemes = new Set<Theme>([
      'system',
      'midnight',
      'warm-terminal',
      'neon-brutalist',
      'earth-code',
      'cyber-luxe',
      'soft-focus',
    ])
    const validKeybindings = new Set<AppSettings['editorKeybindingMode']>([
      'standard',
      'vim',
      'emacs',
    ])
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
        ['cockpit-dark', 'cockpit-light', 'match-app'].includes(obj['editorTheme'])
      )
        await su('editorTheme', obj['editorTheme'] as AppSettings['editorTheme'])
      // Boolean fields
      if (typeof obj['alwaysOnTop'] === 'boolean') await su('alwaysOnTop', obj['alwaysOnTop'])
      if (typeof obj['formatOnPaste'] === 'boolean') await su('formatOnPaste', obj['formatOnPaste'])
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
          <input
            type="number"
            value={historyRetentionPerTool}
            onChange={(e) =>
              update(
                'historyRetentionPerTool',
                Math.min(5000, Math.max(10, Number(e.target.value)))
              ).catch(() => {})
            }
            min={10}
            max={5000}
            className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-right text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
        </SettingRow>
        <SettingRow label="Default Timezone" hint="Used by Timestamp Converter">
          <SelectInput
            value={defaultTimezone}
            onChange={(v) => update('defaultTimezone', v).catch(() => {})}
            options={tzOptions}
          />
        </SettingRow>
      </div>

      {/* Storage Stats */}
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          <InfoIcon size={10} />
          Storage
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Notes" count={noteCount} />
          <StatCard label="Snippets" count={snippetCount} />
          <StatCard label="History" count={historyCount} />
        </div>
      </div>

      {/* Data Management */}
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          <TrashIcon size={10} />
          Clear Data
        </h4>
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
        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          <ExportIcon size={10} />
          Settings Transfer
        </h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportSettings}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <DownloadSimpleIcon size={12} />
            Export to Clipboard
          </button>
          <button
            type="button"
            onClick={handleImportSettings}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
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

function StatCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-center">
      <div className="font-mono text-sm font-bold text-[var(--color-text)]">{count}</div>
      <div className="text-[11px] text-[var(--color-text-muted)]">{label}</div>
    </div>
  )
}

function McpActionButton({
  label,
  icon,
  pending,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  pending: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? <SpinnerIcon size={12} className="animate-spin" /> : icon}
      {label}
    </button>
  )
}

function McpTab() {
  const initialized = useMcpStore((s) => s.initialized)
  const pending = useMcpStore((s) => s.pending)
  const settings = useMcpStore((s) => s.settings)
  const status = useMcpStore((s) => s.status)
  const start = useMcpStore((s) => s.start)
  const stop = useMcpStore((s) => s.stop)
  const restart = useMcpStore((s) => s.restart)
  const updateSettings = useMcpStore((s) => s.updateSettings)
  const updatePermission = useMcpStore((s) => s.updatePermission)
  const rotateKey = useMcpStore((s) => s.rotateKey)
  const refreshStatus = useMcpStore((s) => s.refreshStatus)
  const addToast = useUiStore((s) => s.addToast)
  const [keyVisible, setKeyVisible] = useState(false)
  const [portDraft, setPortDraft] = useState(String(settings.port))

  useEffect(() => {
    setPortDraft(String(settings.port))
  }, [settings.port])

  useEffect(() => {
    void refreshStatus()
    const id = setInterval(() => {
      void refreshStatus()
    }, 5000)
    return () => clearInterval(id)
  }, [refreshStatus])

  const runAction = useCallback(
    async (action: () => Promise<void>, success: string) => {
      try {
        await action()
        addToast(success, 'success')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        addToast(msg, 'error')
      }
    },
    [addToast]
  )

  const copyText = useCallback(
    async (text: string, success: string) => {
      try {
        await navigator.clipboard.writeText(text)
        addToast(success, 'success')
      } catch {
        addToast('Failed to copy to clipboard', 'error')
      }
    },
    [addToast]
  )

  const applyPort = useCallback(() => {
    const trimmed = portDraft.trim()
    if (!/^\d+$/.test(trimmed)) {
      addToast('MCP port must be a number between 1024 and 65535', 'error')
      return
    }

    const port = Number(trimmed)
    if (!Number.isSafeInteger(port) || port < MIN_MCP_PORT || port > MAX_MCP_PORT) {
      addToast('MCP port must be between 1024 and 65535', 'error')
      return
    }

    setPortDraft(String(port))
    void runAction(() => updateSettings({ port }), 'MCP port updated')
  }, [addToast, portDraft, runAction, updateSettings])

  const envCommand = `export COCKPIT_MCP_KEY=${settings.apiKey}`
  const codexCommand = `codex mcp add cockpit --url ${status.url} --bearer-token-env-var COCKPIT_MCP_KEY`
  const claudeCommand = `claude mcp add --transport http cockpit ${status.url} --header "Authorization: Bearer ${settings.apiKey}"`
  const genericJson = JSON.stringify(
    {
      mcpServers: {
        cockpit: {
          type: 'http',
          url: status.url,
          headers: {
            Authorization: 'Bearer <your cockpit MCP key>',
          },
        },
      },
    },
    null,
    2
  )

  if (!initialized) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <SpinnerIcon size={12} className="animate-spin" />
        Initializing MCP settings…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  status.running ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'
                }`}
              />
              <span className="text-sm font-semibold text-[var(--color-text)]">
                {status.running ? 'MCP server running' : 'MCP server stopped'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void copyText(status.url, 'MCP URL copied')}
              className="mt-1 font-mono text-[11px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent)]"
            >
              {status.url}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <McpActionButton
              label="Start"
              icon={<PowerIcon size={12} />}
              pending={pending}
              onClick={() => void runAction(start, 'MCP server started')}
            />
            <McpActionButton
              label="Stop"
              icon={<StopCircleIcon size={12} />}
              pending={pending}
              onClick={() => void runAction(stop, 'MCP server stopped')}
            />
            <McpActionButton
              label="Restart"
              icon={<ArrowClockwiseIcon size={12} />}
              pending={pending}
              onClick={() => void runAction(restart, 'MCP server restarted')}
            />
          </div>
        </div>
        {status.lastError && (
          <div className="mt-2 rounded border border-[var(--color-error)]/40 bg-[var(--color-error)]/10 px-2 py-1 text-[11px] text-[var(--color-error)]">
            {status.lastError}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <SettingRow label="Auto-start MCP" hint="Start the local MCP server when cockpit opens">
          <Toggle
            checked={settings.enabled}
            onChange={(v) =>
              void runAction(() => updateSettings({ enabled: v }), 'MCP setting saved')
            }
          />
        </SettingRow>
        <SettingRow label="Port" hint="Localhost port for Streamable HTTP">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={portDraft}
              onChange={(event) => setPortDraft(event.target.value)}
              min={MIN_MCP_PORT}
              max={MAX_MCP_PORT}
              className="w-24 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-right text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="button"
              onClick={applyPort}
              disabled={pending}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </SettingRow>
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          <KeyIcon size={10} />
          Authentication
        </h4>
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-[var(--color-surface)] px-2 py-1 font-mono text-[11px] text-[var(--color-text)]">
              {keyVisible ? settings.apiKey : '•'.repeat(Math.min(32, settings.apiKey.length))}
            </code>
            <button
              type="button"
              onClick={() => setKeyVisible((v) => !v)}
              className="rounded border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              aria-label={keyVisible ? 'Hide MCP key' : 'Show MCP key'}
            >
              {keyVisible ? <EyeSlashIcon size={13} /> : <EyeIcon size={13} />}
            </button>
            <button
              type="button"
              onClick={() => void copyText(settings.apiKey, 'MCP key copied')}
              className="rounded border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              aria-label="Copy MCP key"
            >
              <CopyIcon size={13} />
            </button>
            <button
              type="button"
              onClick={() => void runAction(rotateKey, 'MCP key rotated')}
              disabled={pending}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-warning)] hover:text-[var(--color-warning)] disabled:opacity-50"
            >
              Rotate
            </button>
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          <ShieldCheckIcon size={10} />
          Permissions
        </h4>
        <div className="overflow-hidden rounded border border-[var(--color-border)]">
          <div className="grid grid-cols-[1.4fr_repeat(4,0.7fr)] border-b border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
            <span>Resource</span>
            {MCP_ACTIONS.map((action) => (
              <span key={action} className="text-center">
                {action}
              </span>
            ))}
          </div>
          {MCP_RESOURCES.map((resource) => (
            <div
              key={resource}
              className="grid grid-cols-[1.4fr_repeat(4,0.7fr)] items-center border-b border-[var(--color-border)] px-2 py-2 last:border-b-0"
            >
              <span className="text-xs text-[var(--color-text)]">
                {MCP_RESOURCE_LABELS[resource]}
              </span>
              {MCP_ACTIONS.map((action) => (
                <div key={action} className="flex justify-center">
                  <Toggle
                    checked={settings.permissions[resource][action]}
                    onChange={(v) =>
                      void runAction(
                        () => updatePermission(resource, action, v),
                        'MCP permission saved'
                      )
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
        <SettingRow
          label="Expose API request secrets"
          hint="Allow authenticated MCP clients to read saved bearer/basic auth values"
        >
          <Toggle
            checked={settings.apiRequestsExposeSecrets}
            onChange={(v) =>
              void runAction(
                () => updateSettings({ apiRequestsExposeSecrets: v }),
                'MCP secret permission saved'
              )
            }
          />
        </SettingRow>
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          <PlugsConnectedIcon size={10} />
          Client Setup
        </h4>
        <div className="space-y-2">
          {(
            [
              ['Shell key', envCommand],
              ['Codex', codexCommand],
              ['Claude Code', claudeCommand],
              ['Generic JSON', genericJson],
            ] as const
          ).map(([label, command]) => (
            <button
              key={label}
              type="button"
              onClick={() => void copyText(command, `${label} setup copied`)}
              className="flex w-full items-start gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-left transition-colors hover:border-[var(--color-accent)]"
            >
              <CopyIcon size={13} className="mt-0.5 shrink-0 text-[var(--color-text-muted)]" />
              <span className="min-w-24 text-[11px] font-semibold text-[var(--color-text)]">
                {label}
              </span>
              <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[10px] text-[var(--color-text-muted)]">
                {command}
              </code>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Panel ─────────────────────────────────────────────────────

export function SettingsPanel() {
  const open = useUiStore((s) => s.settingsPanelOpen)
  const setOpen = useUiStore((s) => s.setSettingsPanelOpen)
  const [activeTab, setActiveTab] = useState<TabId>('general')

  if (!open) return null

  return (
    <Dialog
      title="Settings"
      onClose={() => setOpen(false)}
      closeLabel="Close settings"
      className="w-full max-w-lg"
      bodyClassName="p-0"
      titleClassName="text-[var(--color-accent)]"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {TOOLS.length} tools loaded
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)]">
            Changes saved automatically
          </span>
        </div>
      }
    >
      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-border)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-b-2 border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'editor' && <EditorTab />}
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'mcp' && <McpTab />}
      </div>
    </Dialog>
  )
}
