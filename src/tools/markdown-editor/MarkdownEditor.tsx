import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type OnMount } from '@monaco-editor/react'
import { useIsInstanceActive } from '@/app/tool-instance'
import { SplitPane } from '@/components/shared/SplitPane'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useDomSelectionToolbar } from '@/hooks/useDomSelectionToolbar'
import { useMonaco } from '@/hooks/useMonaco'
import { useMonacoSelectionToolbar } from '@/hooks/useMonacoSelectionToolbar'
import { useTabDirty } from '@/hooks/useTabDirty'
import { useToolState } from '@/hooks/useToolState'
import { MarkdownDialogs } from '@/tools/markdown-editor/components/MarkdownDialogs'
import { MarkdownEditorPane } from '@/tools/markdown-editor/components/MarkdownEditorPane'
import { MarkdownPreviewPane } from '@/tools/markdown-editor/components/MarkdownPreviewPane'
import { MarkdownToolbar } from '@/tools/markdown-editor/components/MarkdownToolbar'
import { useImageDrop } from '@/tools/markdown-editor/hooks/useImageDrop'
import { useMarkdownDocument } from '@/tools/markdown-editor/hooks/useMarkdownDocument'
import { useMarkdownExport } from '@/tools/markdown-editor/hooks/useMarkdownExport'
import { useMarkdownFormatting } from '@/tools/markdown-editor/hooks/useMarkdownFormatting'
import { useMarkdownListEditing } from '@/tools/markdown-editor/hooks/useMarkdownListEditing'
import { useMarkdownSmartPaste } from '@/tools/markdown-editor/hooks/useMarkdownSmartPaste'
import { useScrollSync } from '@/tools/markdown-editor/hooks/useScrollSync'
import {
  type EditorInstance,
  type EditorMode,
  type MarkdownEditorState,
  extractToc,
  readingTime,
  renderEditableMarkdownContent,
  validateMarkdownEditorState,
} from '@/tools/markdown-editor/markdown-model'
import { toggleTaskAtIndex } from '@/tools/markdown-editor/task-list'

// Re-exported because the tests (and lib/markdown's parity test) have always reached for the
// renderer through the tool's entry point.
export { prefixMarkdownLines, renderMarkdownContent } from '@/tools/markdown-editor/markdown-model'

// ─── Component ───────────────────────────────────────────────────────

export default function MarkdownEditor() {
  const isInstanceActive = useIsInstanceActive()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<MarkdownEditorState>(
    'markdown-editor',
    {
      content: '',
      fileName: null,
      filePath: null,
      savedContent: '',
      mode: 'split',
      showToc: false,
      scrollSync: true,
      scrollSyncDirections: undefined,
    },
    { validate: validateMarkdownEditorState }
  )

  const copy = useCopyToClipboard()
  const [html, setHtml] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<EditorInstance | null>(null)
  const pendingRevealLineRef = useRef<number | null>(null)
  const pendingCaretOffsetRef = useRef<number | null>(null)
  const [mountedEditor, setMountedEditor] = useState<EditorInstance | null>(null)
  const [activeSourceLine, setActiveSourceLine] = useState<number | null>(null)
  // The tool owns every drop inside it, so the hit test covers the whole tool, not the editor half.
  // In preview-only mode there is no editor pane under the pointer at all.
  const toolRootRef = useRef<HTMLDivElement>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [previewEditing, setPreviewEditing] = useState(false)

  // ─── Hooks ────────────────────────────────────────────────────────

  const showEditor = state.mode === 'split' || state.mode === 'edit'
  const showPreview = state.mode === 'split' || state.mode === 'preview'
  const isDirty = state.content !== state.savedContent
  const syncPreviewWithEditor = state.scrollSyncDirections?.editorToPreview ?? state.scrollSync
  const syncEditorWithPreview = state.scrollSyncDirections?.previewToEditor ?? state.scrollSync
  useTabDirty(isDirty)

  useScrollSync(
    mountedEditor,
    previewRef,
    syncPreviewWithEditor && state.mode === 'split',
    syncEditorWithPreview && state.mode === 'split'
  )
  useMarkdownListEditing(mountedEditor)
  useMarkdownSmartPaste(mountedEditor)
  const editorSelectionToolbar = useMonacoSelectionToolbar(mountedEditor, showEditor, state.content)
  const previewSelectionToolbar = useDomSelectionToolbar(previewRef, showPreview)

  // ─── Editor mount ────────────────────────────────────────────────

  const revealEditorLocation = useCallback(
    (editor: EditorInstance, line: number | null, offset: number | null) => {
      const model = editor.getModel()
      if (!model) return
      const position =
        offset !== null
          ? model.getPositionAt(Math.min(Math.max(0, offset), model.getValueLength()))
          : {
              lineNumber: Math.min(Math.max(1, line ?? 1), model.getLineCount()),
              column: 1,
            }
      editor.setPosition(position)
      editor.revealLineInCenter(position.lineNumber)
      editor.focus()
      setActiveSourceLine(position.lineNumber)
    },
    []
  )

  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor
      setMountedEditor(editor)
      const pendingOffset = pendingCaretOffsetRef.current
      const pendingLine = pendingRevealLineRef.current
      if (pendingOffset !== null || pendingLine !== null) {
        pendingCaretOffsetRef.current = null
        pendingRevealLineRef.current = null
        requestAnimationFrame(() => revealEditorLocation(editor, pendingLine, pendingOffset))
      }
    },
    [revealEditorLocation]
  )

  const handleModeChange = useCallback(
    (mode: EditorMode) => {
      if (mode !== 'preview') setPreviewEditing(false)
      updateState({ mode })
    },
    [updateState]
  )

  useEffect(() => {
    if (!mountedEditor || !showEditor) return
    const updateLine = () => setActiveSourceLine(mountedEditor.getPosition()?.lineNumber ?? null)
    updateLine()
    const disposable = mountedEditor.onDidChangeCursorPosition(updateLine)
    return () => disposable.dispose()
  }, [mountedEditor, showEditor])

  // ─── Markdown → HTML (debounced 300ms) ───────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    let cancelled = false
    debounceRef.current = setTimeout(async () => {
      const nextHtml = await renderEditableMarkdownContent(state.content)
      if (!cancelled) setHtml(nextHtml)
    }, 300)

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.content])

  // ─── Stats ───────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const text = state.content.trim()
    if (!text) return null
    const words = text.split(/\s+/).filter(Boolean).length
    const chars = state.content.length
    const lines = state.content.split('\n').length
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length
    return { words, chars, lines, paragraphs, readTime: readingTime(words) }
  }, [state.content])

  const formatting = useMarkdownFormatting({
    editorRef,
    state,
    updateState,
    setPreviewEditing,
    copy,
    isInstanceActive,
  })

  const document = useMarkdownDocument({ state, updateState, isDirty, setShowTemplates })

  const { isDraggingImage } = useImageDrop(
    editorRef,
    toolRootRef,
    isInstanceActive,
    document.handleDroppedTextFile,
    document.handleDropError
  )

  const markdownExport = useMarkdownExport({
    content: state.content,
    fileName: state.fileName,
    copy,
    setShowExport,
  })

  // ─── TOC ─────────────────────────────────────────────────────────

  const toc = useMemo(() => extractToc(html), [html])

  const handleToggleTask = useCallback(
    (index: number) => {
      updateState({ content: toggleTaskAtIndex(state.content, index) })
    },
    [state.content, updateState]
  )

  const handleRevealSource = useCallback(
    (line: number) => {
      setPreviewEditing(false)
      const editor = editorRef.current
      if (state.mode === 'split' && editor?.getDomNode()?.isConnected) {
        revealEditorLocation(editor, line, null)
        return
      }
      pendingRevealLineRef.current = line
      pendingCaretOffsetRef.current = null
      updateState({ mode: 'edit' })
    },
    [revealEditorLocation, state.mode, updateState]
  )

  const handlePreviewEditCaret = useCallback((offset: number) => {
    pendingCaretOffsetRef.current = offset
    pendingRevealLineRef.current = null
  }, [])

  // Each pane renders identically whether it's alone or beside the other, so it's defined once
  // here and placed by the layout below rather than written out under both branches.
  const editorPane = (
    <MarkdownEditorPane
      theme={monacoTheme}
      content={state.content}
      updateState={updateState}
      onMount={handleEditorMount}
      options={monacoOptions}
    />
  )

  const previewPane = (
    <MarkdownPreviewPane
      previewRef={previewRef}
      html={html}
      state={state}
      updateState={updateState}
      toc={toc}
      activeSourceLine={activeSourceLine}
      previewEditing={previewEditing}
      setPreviewEditing={setPreviewEditing}
      handleToggleTask={handleToggleTask}
      handlePreviewEditCaret={handlePreviewEditCaret}
      handleRevealSource={handleRevealSource}
    />
  )

  return (
    <ToolLayout fullBleed ref={toolRootRef} className="relative">
      <MarkdownToolbar
        state={state}
        updateState={updateState}
        isDirty={isDirty}
        syncPreviewWithEditor={syncPreviewWithEditor}
        syncEditorWithPreview={syncEditorWithPreview}
        tocLength={toc.length}
        showTemplates={showTemplates}
        setShowTemplates={setShowTemplates}
        showExport={showExport}
        setShowExport={setShowExport}
        handleNewDocument={document.handleNewDocument}
        handleOpen={document.handleOpen}
        handleSave={document.handleSave}
        handleSaveAs={document.handleSaveAs}
        handleModeChange={handleModeChange}
        openFind={formatting.openFind}
        handleTemplateSelect={document.handleTemplateSelect}
        copy={copy}
        handleCopyHtml={markdownExport.handleCopyHtml}
        handleDownload={markdownExport.handleDownload}
        handleExportPdf={markdownExport.handleExportPdf}
        showEditor={showEditor}
        setActiveModal={formatting.setActiveModal}
        insertFormatting={formatting.insertFormatting}
      />

      {/* ─── Body ───────────────────────────────────────────────── */}
      {/* Keep both panes mounted across mode changes so Monaco retains its model, cursor, scroll,
          selection and undo history. SplitPane hides the inactive pane and expands the other. */}
      <SplitPane
        storageKey="markdown-editor"
        stackBelow={1000}
        firstVisible={showEditor}
        secondVisible={showPreview}
        aria-label="Resize editor and preview"
      >
        {editorPane}
        {previewPane}
      </SplitPane>

      <footer className="flex min-h-7 shrink-0 items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-2xs text-[var(--color-text-muted)]">
        <span>{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
        {stats ? (
          <span title={`${stats.lines} lines · ${stats.paragraphs} paragraphs`}>
            {stats.words}w · {stats.chars}c · {stats.readTime}
          </span>
        ) : (
          <span>Empty document</span>
        )}
        <span className="ml-auto capitalize">{state.mode} view</span>
      </footer>

      {/* One drop has two meanings, and the `over` event names no path, so the overlay states both.
          It covers the whole tool because the tool answers a drop on either pane. */}
      {isDraggingImage && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-surface)]/80 backdrop-blur-sm">
          <div className="rounded-lg border-2 border-dashed border-[var(--color-accent)] px-6 py-4 text-sm text-[var(--color-accent)]">
            Drop an image to embed it, or a document to open it
          </div>
        </div>
      )}

      <MarkdownDialogs
        pendingDocument={document.pendingDocument}
        setPendingDocument={document.setPendingDocument}
        applyDocument={document.applyDocument}
        activeModal={formatting.activeModal}
        setActiveModal={formatting.setActiveModal}
        handleModalInsert={formatting.handleModalInsert}
        editorSelection={editorSelectionToolbar.selection}
        editorSelectionActions={formatting.editorSelectionActions}
        clearEditorSelection={editorSelectionToolbar.clearSelection}
        previewSelection={previewSelectionToolbar.selection}
        previewSelectionActions={formatting.previewSelectionActions}
        clearPreviewSelection={previewSelectionToolbar.clearSelection}
      />
    </ToolLayout>
  )
}
