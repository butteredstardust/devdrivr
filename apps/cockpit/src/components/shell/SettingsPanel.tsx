import { useCallback, useEffect, useRef } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { AppSettings, Theme } from '@/types/models'
import { X } from '@phosphor-icons/react'
import { Toggle } from '@/components/shared/Toggle'

const INDENT_OPTIONS = [2, 4] as const
const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 18, 20] as const
const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
]
const KEYBINDING_OPTIONS: { value: AppSettings['editorKeybindingMode']; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'vim', label: 'Vim' },
  { value: 'emacs', label: 'Emacs' },
]

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-[var(--color-text)]">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  )
}

export function SettingsPanel() {
  const open = useUiStore((s) => s.settingsPanelOpen)
  const setOpen = useUiStore((s) => s.setSettingsPanelOpen)
  const update = useSettingsStore((s) => s.update)
  const theme = useSettingsStore((s) => s.theme)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const defaultIndentSize = useSettingsStore((s) => s.defaultIndentSize)
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const editorKeybindingMode = useSettingsStore((s) => s.editorKeybindingMode)
  const historyRetentionPerTool = useSettingsStore((s) => s.historyRetentionPerTool)
  const formatOnPaste = useSettingsStore((s) => s.formatOnPaste)
  const defaultTimezone = useSettingsStore((s) => s.defaultTimezone)

  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, setOpen])

  const handleAlwaysOnTop = useCallback((checked: boolean) => {
    getCurrentWindow().setAlwaysOnTop(checked)
    update('alwaysOnTop', checked)
  }, [update])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={panelRef}
        className="w-full max-w-md rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-pixel text-sm text-[var(--color-accent)]">Settings</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="divide-y divide-[var(--color-border)] px-4">
          {/* Appearance */}
          <div className="py-3">
            <h3 className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">Appearance</h3>
            <SettingRow label="Theme">
              <select
                value={theme}
                onChange={(e) => update('theme', e.target.value as Theme)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
              >
                {THEME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Always on Top">
              <Toggle checked={alwaysOnTop} onChange={handleAlwaysOnTop} />
            </SettingRow>
          </div>

          {/* Editor */}
          <div className="py-3">
            <h3 className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">Editor</h3>
            <SettingRow label="Font Size">
              <select
                value={editorFontSize}
                onChange={(e) => update('editorFontSize', Number(e.target.value))}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
              >
                {FONT_SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Indent Size">
              <select
                value={defaultIndentSize}
                onChange={(e) => update('defaultIndentSize', Number(e.target.value))}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
              >
                {INDENT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s} spaces</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Keybinding Mode">
              <select
                value={editorKeybindingMode}
                onChange={(e) => update('editorKeybindingMode', e.target.value as AppSettings['editorKeybindingMode'])}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
              >
                {KEYBINDING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Format on Paste">
              <Toggle checked={formatOnPaste} onChange={(v) => update('formatOnPaste', v)} />
            </SettingRow>
          </div>

          {/* Data */}
          <div className="py-3">
            <h3 className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">Data</h3>
            <SettingRow label="History per Tool">
              <input
                type="number"
                value={historyRetentionPerTool}
                onChange={(e) => update('historyRetentionPerTool', Math.max(10, Number(e.target.value)))}
                min={10}
                max={5000}
                className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-right text-xs text-[var(--color-text)]"
              />
            </SettingRow>
            <SettingRow label="Default Timezone">
              <input
                value={defaultTimezone}
                onChange={(e) => update('defaultTimezone', e.target.value)}
                className="w-40 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]"
              />
            </SettingRow>
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] px-4 py-3 text-right">
          <span className="text-[10px] text-[var(--color-text-muted)]">Changes saved automatically</span>
        </div>
      </div>
    </div>
  )
}
