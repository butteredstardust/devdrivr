/** Settings → Editor: the Monaco options exposed to the user. */
import { useSettingsStore } from '@/stores/settings.store'
import { type AppSettings } from '@/types/models'
import { CodeIcon } from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Toggle } from '@/components/shared/Toggle'
import { SettingRow, SelectInput } from '@/components/shell/settings/SettingControls'

const INDENT_OPTIONS = [2, 4] as const
const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 18, 20] as const
const FONT_FAMILY_OPTIONS: AppSettings['editorFont'][] = [
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'Source Code Pro',
]

const EDITOR_THEME_OPTIONS: { value: AppSettings['editorTheme']; label: string }[] = [
  { value: 'devdrivr-dark', label: 'Dark (default)' },
  { value: 'devdrivr-light', label: 'Light' },
  { value: 'match-app', label: 'Match App Theme' },
]

const WHITESPACE_OPTIONS: { value: AppSettings['editorRenderWhitespace']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'boundary', label: 'Boundary' },
  { value: 'all', label: 'All' },
]

const CURSOR_STYLE_OPTIONS: { value: AppSettings['editorCursorStyle']; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'block', label: 'Block' },
  { value: 'underline', label: 'Underline' },
]

export function EditorTab() {
  const update = useSettingsStore((s) => s.update)
  const editorFont = useSettingsStore((s) => s.editorFont)
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const defaultIndentSize = useSettingsStore((s) => s.defaultIndentSize)
  const editorTheme = useSettingsStore((s) => s.editorTheme)
  const formatOnPaste = useSettingsStore((s) => s.formatOnPaste)
  const editorWordWrap = useSettingsStore((s) => s.editorWordWrap)
  const editorMinimap = useSettingsStore((s) => s.editorMinimap)
  const editorLineNumbers = useSettingsStore((s) => s.editorLineNumbers)
  const editorFolding = useSettingsStore((s) => s.editorFolding)
  const editorStickyScroll = useSettingsStore((s) => s.editorStickyScroll)
  const editorRenderWhitespace = useSettingsStore((s) => s.editorRenderWhitespace)
  const editorInsertSpaces = useSettingsStore((s) => s.editorInsertSpaces)
  const editorBracketPairColorization = useSettingsStore((s) => s.editorBracketPairColorization)
  const editorCursorStyle = useSettingsStore((s) => s.editorCursorStyle)

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <SettingRow label="Font Family" hint="Monaco editor font family">
          <SelectInput
            value={editorFont}
            onChange={(v) =>
              void update('editorFont', v as AppSettings['editorFont']).catch(() => {})
            }
            options={FONT_FAMILY_OPTIONS.map((f) => ({ value: f, label: f }))}
          />
        </SettingRow>
        <SettingRow label="Font Size" hint="Monaco editor font size">
          <SelectInput
            value={editorFontSize}
            onChange={(v) => void update('editorFontSize', Number(v)).catch(() => {})}
            options={FONT_SIZE_OPTIONS.map((s) => ({ value: s, label: `${s}px` }))}
          />
        </SettingRow>
        <SettingRow label="Indent Size" hint="Spaces per indent level">
          <SelectInput
            value={defaultIndentSize}
            onChange={(v) => void update('defaultIndentSize', Number(v)).catch(() => {})}
            options={INDENT_OPTIONS.map((s) => ({ value: s, label: `${s} spaces` }))}
          />
        </SettingRow>
        <SettingRow label="Editor Theme" hint="Monaco editor color scheme">
          <SelectInput
            value={editorTheme}
            onChange={(v) =>
              void update('editorTheme', v as AppSettings['editorTheme']).catch(() => {})
            }
            options={EDITOR_THEME_OPTIONS}
          />
        </SettingRow>
        <SettingRow label="Format on Paste" hint="Auto-format code when pasting">
          <Toggle
            checked={formatOnPaste}
            onChange={(v) => void update('formatOnPaste', v).catch(() => {})}
          />
        </SettingRow>
      </div>

      {/* Applies to every tool that embeds Monaco — the JSON, YAML, XML, diff
          and playground panes all read these through useMonaco(). */}
      <div>
        <SectionLabel as="h4" className="mb-2">
          <CodeIcon size={12} />
          Editor Behavior
        </SectionLabel>
        <div className="space-y-1">
          <SettingRow
            label="Word Wrap"
            hint={
              editorWordWrap
                ? 'Wrap long lines instead of scrolling sideways'
                : 'Off — long lines scroll horizontally'
            }
          >
            <Toggle
              checked={editorWordWrap}
              onChange={(v) => void update('editorWordWrap', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Insert Spaces" hint="Off indents with tab characters">
            <Toggle
              checked={editorInsertSpaces}
              onChange={(v) => void update('editorInsertSpaces', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Line Numbers" hint="Show the gutter line numbers">
            <Toggle
              checked={editorLineNumbers}
              onChange={(v) => void update('editorLineNumbers', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Code Folding" hint="Collapse blocks from the gutter">
            <Toggle
              checked={editorFolding}
              onChange={(v) => void update('editorFolding', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Minimap" hint="Overview strip down the right edge">
            <Toggle
              checked={editorMinimap}
              onChange={(v) => void update('editorMinimap', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Sticky Scroll" hint="Pin enclosing scopes to the top">
            <Toggle
              checked={editorStickyScroll}
              onChange={(v) => void update('editorStickyScroll', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Bracket Pair Colors" hint="Tint matching brackets by depth">
            <Toggle
              checked={editorBracketPairColorization}
              onChange={(v) => void update('editorBracketPairColorization', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Render Whitespace" hint="Show spaces and tabs as dots">
            <SelectInput
              value={editorRenderWhitespace}
              onChange={(v) =>
                void update(
                  'editorRenderWhitespace',
                  v as AppSettings['editorRenderWhitespace']
                ).catch(() => {})
              }
              options={WHITESPACE_OPTIONS}
            />
          </SettingRow>
          <SettingRow label="Cursor Style" hint="Shape of the text caret">
            <SelectInput
              value={editorCursorStyle}
              onChange={(v) =>
                void update('editorCursorStyle', v as AppSettings['editorCursorStyle']).catch(
                  () => {}
                )
              }
              options={CURSOR_STYLE_OPTIONS}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  )
}
