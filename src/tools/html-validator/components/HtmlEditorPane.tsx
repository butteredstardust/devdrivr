import type { ComponentProps } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { FileHtmlIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import { formatShortcut } from '@/lib/shortcut-label'

type HtmlEditorPaneProps = {
  theme: string
  input: string
  hasInput: boolean
  onChange: (value: string | undefined) => void
  onMount: OnMount
  options: NonNullable<ComponentProps<typeof Editor>['options']>
  onLoadSample: () => void
}

export function HtmlEditorPane({
  theme,
  input,
  hasInput,
  onChange,
  onMount,
  options,
  onLoadSample,
}: HtmlEditorPaneProps) {
  return (
    <section
      aria-label="HTML source"
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <Editor
        theme={theme}
        language="html"
        value={input}
        onChange={onChange}
        onMount={onMount}
        options={options}
      />
      {!hasInput && (
        // Click-through: the hint must never sit between the user and the caret.
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <EmptyState
            icon={FileHtmlIcon}
            title="Paste or open an HTML document"
            description={`It is checked as you type, previewed beside the source, and reformatted with ${formatShortcut('mod+enter')}.`}
            action={
              TOOL_SAMPLES['html-validator'] ? (
                <span className="pointer-events-auto">
                  <Button variant="secondary" size="sm" onClick={onLoadSample}>
                    Load sample
                  </Button>
                </span>
              ) : undefined
            }
          />
        </div>
      )}
    </section>
  )
}
