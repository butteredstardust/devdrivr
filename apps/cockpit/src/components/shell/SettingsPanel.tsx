import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'
import { useUiStore } from '@/stores/ui.store'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { DEFAULT_SETTINGS, type AppSettings, type Theme } from '@/types/models'
import { TOOLS } from '@/app/tool-registry'
import {
  X,
  GearSix,
  Code,
  Database,
  ArrowCounterClockwise,
  Export,
  DownloadSimple,
  UploadSimple,
  Trash,
  Warning,
  CheckCircle,
  Info,
} from '@phosphor-icons/react'
import { Toggle } from '@/components/shared/Toggle'

// ─── Constants ───────────────────────────────────────────────────────

type TabId = 'general' | 'editor' | 'data'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <GearSix size={14} /> },
  { id: 'editor', label: 'Editor', icon: <Code size={14} /> },
  { id: 'data', label: 'Data', icon: <Database size={14} /> },
]

const INDENT_OPTIONS = [2, 4] as const
const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 18, 20] as const

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'midnight', label: 'Midnight Interface' },
  { value: 'warm-terminal', label: 'Warm Terminal' },
  { value: 'neon-brutalist', label: 'Neon Brutalist' },
  { value: 'earth-code', label: 'Earth & Code' },
  { value: 'cyber-luxe', label: 'Cyber Luxe' },
  { value: 'soft-focus', label: 'Soft Focus' },
]

const KEYBINDING_OPTIONS: { value: AppSettings['editorKeybindingMode']; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'vim', label: 'Vim' },
  { value: 'emacs', label: 'Emacs' },
]

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

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
}: {
  label: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  icon: React.ReactNode
}) {
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
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
    try {
      await onConfirm()
      setDone(true)
      timerRef.current = setTimeout(() => setDone(false), 2000)
    } catch {
      // silently reset — the store action is responsible for user feedback
    } finally {
      setConfirming(false)
    }
  }

  if (done) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 rounded border border-[var(--color-success)] px-2.5 py-1.5 text-xs text-[var(--color-success)]"
      >
        <CheckCircle size={12} />
        Done
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs transition-colors ${
        confirming
          ? 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-error)] hover:text-[var(--color-error)]'
      }`}
    >
      {confirming ? <Warning size={12} /> : icon}
      {confirming ? confirmLabel : label}
    </button>
  )
}

// ─── Tab Panels ─────────────────────────────────────────────────────

function GeneralTab() {
  const update = useSettingsStore((s) => s.update)
  const theme = useSettingsStore((s) => s.theme)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)

  const handleAlwaysOnTop = useCallback(
    (checked: boolean) => {
      getCurrentWindow().setAlwaysOnTop(checked).catch(() => {})
      update('alwaysOnTop', checked).catch(() => {})
    },
    [update]
  )

  return (
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
  )
}

function EditorTab() {
  const update = useSettingsStore((s) => s.update)
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const defaultIndentSize = useSettingsStore((s) => s.defaultIndentSize)
  const editorKeybindingMode = useSettingsStore((s) => s.editorKeybindingMode)
  const formatOnPaste = useSettingsStore((s) => s.formatOnPaste)

  return (
    <div className="space-y-1">
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
        notesDrawerOpen: state.notesDrawerOpen,
        notesDrawerWidth: state.notesDrawerWidth,
        defaultIndentSize: state.defaultIndentSize,
        defaultTimezone: state.defaultTimezone,
        editorFontSize: state.editorFontSize,
        editorKeybindingMode: state.editorKeybindingMode,
        historyRetentionPerTool: state.historyRetentionPerTool,
        formatOnPaste: state.formatOnPaste,
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
      // Boolean fields
      if (typeof obj['alwaysOnTop'] === 'boolean') await su('alwaysOnTop', obj['alwaysOnTop'])
      if (typeof obj['formatOnPaste'] === 'boolean') await su('formatOnPaste', obj['formatOnPaste'])
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
      if (typeof obj['defaultTimezone'] === 'string')
        await su('defaultTimezone', obj['defaultTimezone'])
      // Apply alwaysOnTop to the live Tauri window
      const finalOnTop = useSettingsStore.getState().alwaysOnTop
      getCurrentWindow().setAlwaysOnTop(finalOnTop).catch(() => {})
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
    getCurrentWindow().setAlwaysOnTop(false).catch(() => {})
    addToast('Settings reset to defaults', 'success')
  }, [addToast])

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
              update('historyRetentionPerTool', Math.min(5000, Math.max(10, Number(e.target.value)))).catch(
                () => {}
              )
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
        <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          <Info size={10} />
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
        <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          <Trash size={10} />
          Clear Data
        </h4>
        <div className="flex flex-wrap gap-2">
          <DangerButton
            label={`Clear Notes (${noteCount})`}
            confirmLabel="Confirm clear?"
            onConfirm={clearNotes}
            icon={<Trash size={12} />}
          />
          <DangerButton
            label={`Clear Snippets (${snippetCount})`}
            confirmLabel="Confirm clear?"
            onConfirm={clearSnippets}
            icon={<Trash size={12} />}
          />
          <DangerButton
            label={`Clear History (${historyCount})`}
            confirmLabel="Confirm clear?"
            onConfirm={clearHistory}
            icon={<Trash size={12} />}
          />
        </div>
      </div>

      {/* Export / Import / Reset */}
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          <Export size={10} />
          Settings Transfer
        </h4>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportSettings}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <DownloadSimple size={12} />
            Export to Clipboard
          </button>
          <button
            onClick={handleImportSettings}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <UploadSimple size={12} />
            Import from Clipboard
          </button>
          <DangerButton
            label="Reset to Defaults"
            confirmLabel="Confirm reset?"
            onConfirm={handleResetDefaults}
            icon={<ArrowCounterClockwise size={12} />}
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
      <div className="text-[10px] text-[var(--color-text-muted)]">{label}</div>
    </div>
  )
}

// ─── Main Panel ─────────────────────────────────────────────────────

export function SettingsPanel() {
  const open = useUiStore((s) => s.settingsPanelOpen)
  const setOpen = useUiStore((s) => s.setSettingsPanelOpen)
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div
        ref={panelRef}
        className="animate-fade-in w-full max-w-lg rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-pixel text-sm text-[var(--color-accent)]">Settings</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            className="rounded p-1 text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[var(--color-border)]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2.5">
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {TOOLS.length} tools loaded
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)]">
            Changes saved automatically
          </span>
        </div>
      </div>
    </div>
  )
}
