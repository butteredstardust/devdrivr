import { type OnMount } from '@monaco-editor/react'
import { type ReactNode } from 'react'
import { BroomIcon, DownloadSimpleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { formatShortcut } from '@/lib/shortcut-label'

export function EditorPane({
  title,
  fileName,
  value,
  monacoTheme,
  monacoOptions,
  onChange,
  onMount,
  onFormat,
  onSave,
  copyLabel,
  headerExtras,
  empty,
  className = '',
}: {
  title: string
  fileName: string | null
  value: string
  monacoTheme: string
  monacoOptions: Record<string, unknown>
  onChange: (value: string | undefined) => void
  onMount: (editor: Parameters<OnMount>[0]) => void
  onFormat: () => void
  onSave: () => void
  /** Distinct per pane: two buttons both reading "Copy" are ambiguous aloud. */
  copyLabel: string
  headerExtras?: ReactNode
  empty?: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${className}`}
    >
      <PaneHeader
        title={title}
        hint={fileName ? <span className="max-w-[10rem] truncate">{fileName}</span> : undefined}
        actions={
          <>
            {headerExtras}
            <Button
              variant="ghost"
              size="xs"
              onClick={onFormat}
              disabled={!value.trim()}
              className="gap-1"
            >
              <BroomIcon size={14} aria-hidden="true" />
              Format
            </Button>
            <CopyButton text={value} label={copyLabel} className="min-w-0" />
            <Button
              variant="secondary"
              size="xs"
              onClick={onSave}
              disabled={!value.trim()}
              aria-label={`Export ${title.toLowerCase()}`}
              title={`Export to a file (${formatShortcut('mod+s')})`}
              className="gap-1"
            >
              <DownloadSimpleIcon size={14} aria-hidden="true" />
              Export
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Editor
          theme={monacoTheme}
          language="json"
          value={value}
          onChange={onChange}
          options={monacoOptions}
          onMount={onMount}
        />
      </div>
      {empty && (
        // Click-through: the hint must never sit between the user and the caret.
        <div className="pointer-events-none absolute inset-0 top-8 flex items-center justify-center p-4">
          {empty}
        </div>
      )}
    </section>
  )
}
