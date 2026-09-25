import type { OnMount } from '@monaco-editor/react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import type { UpdateMarkdownEditorState } from '@/tools/markdown-editor/markdown-model'

type MarkdownEditorPaneProps = {
  theme: string
  content: string
  updateState: UpdateMarkdownEditorState
  onMount: OnMount
  options: NonNullable<Parameters<typeof Editor>[0]['options']>
}

export function MarkdownEditorPane({
  theme,
  content,
  updateState,
  onMount,
  options,
}: MarkdownEditorPaneProps) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <Editor
        theme={theme}
        language="markdown"
        value={content}
        onChange={(v) => updateState({ content: v ?? '' })}
        onMount={onMount}
        options={options}
      />
    </div>
  )
}
