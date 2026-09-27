import { useState, type ReactNode } from 'react'
import { CheckIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Popover } from '@/components/shared/Popover'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { formatShortcut } from '@/lib/shortcut-label'
import { TEXT_FILE_ENCODINGS, textEncodingLabel, type TextFileEncoding } from '@/lib/text-encoding'
import {
  TEXT_EDITOR_LANGUAGES,
  type LineEnding,
  type SelectionSummary,
} from '@/tools/text-editor/text-editor-model'

export type Indentation = { insertSpaces: boolean; tabSize: number }

const TAB_SIZES = [2, 4, 8]

type TextEditorStatusBarProps = {
  cursor: { line: number; column: number }
  selection: SelectionSummary
  onGoToLine: () => void
  wordWrap: boolean
  onToggleWordWrap: () => void
  indentation: Indentation
  onIndentationChange: (indentation: Indentation) => void
  onConvertIndentation: (to: 'spaces' | 'tabs') => void
  onDetectIndentation: () => void
  lineEnding: LineEnding
  onLineEndingChange: (lineEnding: LineEnding) => void
  encoding: TextFileEncoding
  onEncodingChange: (encoding: TextFileEncoding) => void
  language: string
  onLanguageChange: (language: string) => void
}

function selectionLabel({ characters, selections }: SelectionSummary): string {
  if (selections > 1) return ` (${selections} selections, ${characters.toLocaleString()} selected)`
  return characters > 0 ? ` (${characters.toLocaleString()} selected)` : ''
}

function StatusMenu({
  label,
  value,
  children,
}: {
  /** Names the menu and the trigger for assistive technology. */
  label: string
  value: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={label}
      placement="above"
      align="end"
      trigger={(triggerProps) => (
        <Button
          {...triggerProps}
          variant="ghost"
          size="xs"
          aria-label={`${label}: ${value}`}
          className="text-2xs"
        >
          {value}
        </Button>
      )}
    >
      <div className="flex min-h-0 min-w-44 flex-col overflow-y-auto py-1">
        {children(() => setOpen(false))}
      </div>
    </Popover>
  )
}

function MenuItem({
  selected,
  onClick,
  children,
}: {
  selected?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      {...(selected === undefined ? {} : { 'aria-pressed': selected })}
      className="w-full justify-between text-left hover:text-[var(--color-text)]"
    >
      <span>{children}</span>
      {selected && <CheckIcon size={12} aria-hidden="true" />}
    </Button>
  )
}

function MenuSection({ children }: { children: ReactNode }) {
  return <div className="px-2 pt-2 pb-1">{children}</div>
}

/** The editor's footer. Each item shows a document property and opens a menu to change it. */
export function TextEditorStatusBar({
  cursor,
  selection,
  onGoToLine,
  wordWrap,
  onToggleWordWrap,
  indentation,
  onIndentationChange,
  onConvertIndentation,
  onDetectIndentation,
  lineEnding,
  onLineEndingChange,
  encoding,
  onEncodingChange,
  language,
  onLanguageChange,
}: TextEditorStatusBarProps) {
  const languageLabel =
    TEXT_EDITOR_LANGUAGES.find((item) => item.id === language)?.label ?? language
  const indentationLabel = `${indentation.insertSpaces ? 'Spaces' : 'Tab Size'}: ${indentation.tabSize}`

  return (
    <footer className="flex min-h-7 shrink-0 items-center gap-1 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-2xs text-[var(--color-text-muted)]">
      <Button
        variant="ghost"
        size="xs"
        onClick={onGoToLine}
        aria-label={`Go to line. Line ${cursor.line}, column ${cursor.column}`}
        className="text-2xs"
      >
        Ln {cursor.line}, Col {cursor.column}
        {selectionLabel(selection)}
      </Button>
      <span className="ml-auto" />
      <Button
        variant="ghost"
        size="xs"
        onClick={onToggleWordWrap}
        aria-pressed={wordWrap}
        title={`Toggle word wrap (${formatShortcut('alt+z')})`}
        className="text-2xs"
      >
        Wrap: {wordWrap ? 'On' : 'Off'}
      </Button>
      <StatusMenu label="Indentation" value={indentationLabel}>
        {(close) => (
          <>
            <MenuSection>
              <SectionLabel>Indent using</SectionLabel>
            </MenuSection>
            {[true, false].map((insertSpaces) =>
              TAB_SIZES.map((tabSize) => (
                <MenuItem
                  key={`${insertSpaces}-${tabSize}`}
                  selected={
                    indentation.insertSpaces === insertSpaces && indentation.tabSize === tabSize
                  }
                  onClick={() => {
                    onIndentationChange({ insertSpaces, tabSize })
                    close()
                  }}
                >
                  {insertSpaces ? 'Spaces' : 'Tabs'}: {tabSize}
                </MenuItem>
              ))
            )}
            <div className="my-1 border-t border-[var(--color-border)]" />
            <MenuItem
              onClick={() => {
                onConvertIndentation('spaces')
                close()
              }}
            >
              Convert indentation to spaces
            </MenuItem>
            <MenuItem
              onClick={() => {
                onConvertIndentation('tabs')
                close()
              }}
            >
              Convert indentation to tabs
            </MenuItem>
            <MenuItem
              onClick={() => {
                onDetectIndentation()
                close()
              }}
            >
              Detect from content
            </MenuItem>
          </>
        )}
      </StatusMenu>
      <StatusMenu label="Line ending" value={lineEnding}>
        {(close) =>
          (['LF', 'CRLF'] as const).map((item) => (
            <MenuItem
              key={item}
              selected={lineEnding === item}
              onClick={() => {
                onLineEndingChange(item)
                close()
              }}
            >
              {item === 'LF' ? 'LF (macOS, Linux)' : 'CRLF (Windows)'}
            </MenuItem>
          ))
        }
      </StatusMenu>
      <StatusMenu label="Save with encoding" value={textEncodingLabel(encoding)}>
        {(close) =>
          TEXT_FILE_ENCODINGS.map((item) => (
            <MenuItem
              key={item.id}
              selected={encoding === item.id}
              onClick={() => {
                onEncodingChange(item.id)
                close()
              }}
            >
              {item.label}
            </MenuItem>
          ))
        }
      </StatusMenu>
      <StatusMenu label="Language" value={languageLabel}>
        {(close) =>
          TEXT_EDITOR_LANGUAGES.map((item) => (
            <MenuItem
              key={item.id}
              selected={language === item.id}
              onClick={() => {
                onLanguageChange(item.id)
                close()
              }}
            >
              {item.label}
            </MenuItem>
          ))
        }
      </StatusMenu>
    </footer>
  )
}
