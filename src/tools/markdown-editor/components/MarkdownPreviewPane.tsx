import type { RefObject } from 'react'
import { MarkdownPreview } from '@/tools/markdown-editor/MarkdownPreview'
import type {
  MarkdownEditorState,
  TocEntry,
  UpdateMarkdownEditorState,
} from '@/tools/markdown-editor/markdown-model'

type MarkdownPreviewPaneProps = {
  previewRef: RefObject<HTMLDivElement | null>
  html: string
  state: MarkdownEditorState
  updateState: UpdateMarkdownEditorState
  toc: TocEntry[]
  activeSourceLine: number | null
  previewEditing: boolean
  setPreviewEditing: (editing: boolean) => void
  handleToggleTask: (index: number) => void
  handlePreviewEditCaret: (offset: number) => void
  handleRevealSource: (line: number) => void
}

export function MarkdownPreviewPane({
  previewRef,
  html,
  state,
  updateState,
  toc,
  activeSourceLine,
  previewEditing,
  setPreviewEditing,
  handleToggleTask,
  handlePreviewEditCaret,
  handleRevealSource,
}: MarkdownPreviewPaneProps) {
  return (
    <div className="min-h-0 flex-1">
      <MarkdownPreview
        ref={previewRef}
        html={html}
        source={state.content}
        showToc={state.showToc}
        toc={toc}
        onToggleTask={handleToggleTask}
        activeSourceLine={state.mode === 'split' ? activeSourceLine : null}
        editingEnabled={state.mode === 'preview' && previewEditing}
        showEditingToggle={state.mode === 'preview'}
        onEditingEnabledChange={setPreviewEditing}
        onSourceChange={(content) => updateState({ content })}
        onEditCaretChange={handlePreviewEditCaret}
        onRevealSource={handleRevealSource}
      />
    </div>
  )
}
