import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import { CodeIcon, CopyIcon, QuotesIcon, TextBIcon, TextItalicIcon } from '@phosphor-icons/react'
import type { CopyToClipboard } from '@/hooks/useCopyToClipboard'
import { isKeyEventForTool } from '@/lib/key-scope'
import {
  prefixMarkdownLines,
  type ActiveMarkdownModal,
  type EditorInstance,
  type MarkdownEditorState,
  type UpdateMarkdownEditorState,
} from '@/tools/markdown-editor/markdown-model'

type UseMarkdownFormattingOptions = {
  editorRef: RefObject<EditorInstance | null>
  toolRootRef: RefObject<HTMLDivElement | null>
  state: MarkdownEditorState
  updateState: UpdateMarkdownEditorState
  setPreviewEditing: (editing: boolean) => void
  copy: CopyToClipboard
  isInstanceActive: boolean
}

export function useMarkdownFormatting({
  editorRef,
  toolRootRef,
  state,
  updateState,
  setPreviewEditing,
  copy,
  isInstanceActive,
}: UseMarkdownFormattingOptions) {
  const [activeModal, setActiveModal] = useState<ActiveMarkdownModal>(null)

  // ─── Formatting insertion ────────────────────────────────────────

  const insertFormatting = useCallback(
    (prefix: string, suffix: string, placeholder: string, lineStart?: boolean) => {
      const editor = editorRef.current
      if (!editor) return
      const model = editor.getModel()
      const selection = editor.getSelection()
      if (!model || !selection) return

      const selectedText = model.getValueInRange(selection)
      const text = selectedText || placeholder

      let insertText: string
      let extraOffset = 0
      if (lineStart && selectedText && !prefix.includes('\n')) {
        insertText = prefixMarkdownLines(selectedText, prefix)
      } else if (lineStart && !selectedText) {
        const lineContent = model.getLineContent(selection.startLineNumber)
        const needsNewline = lineContent.trim().length > 0 && selection.startColumn > 1
        if (needsNewline) extraOffset = 1
        insertText = (needsNewline ? '\n' : '') + prefix + text + suffix
      } else {
        insertText = prefix + text + suffix
      }

      editor.executeEdits('formatting', [
        { range: selection, text: insertText, forceMoveMarkers: true },
      ])

      if (!selectedText && placeholder) {
        const baseOffset = model.getOffsetAt(selection.getStartPosition()) + extraOffset
        const startPos = model.getPositionAt(baseOffset + prefix.length)
        const endPos = model.getPositionAt(baseOffset + prefix.length + placeholder.length)
        editor.setSelection({
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        })
      }

      editor.focus()
    },
    [editorRef]
  )

  const copySelection = useCallback(
    async (text: string) => {
      await copy(text, {
        success: 'Selection copied to clipboard',
        failure: 'Failed to copy selection',
      })
    },
    [copy]
  )

  const copyPreviewQuote = useCallback(
    async (text: string) => {
      const quote = text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
      await copy(quote, {
        success: 'Quoted selection copied to clipboard',
        failure: 'Failed to copy selection',
      })
    },
    [copy]
  )

  const editorSelectionActions = useMemo(
    () => [
      {
        id: 'bold',
        label: 'Bold',
        icon: <TextBIcon size={14} weight="bold" />,
        onSelect: () => insertFormatting('**', '**', 'bold text'),
      },
      {
        id: 'italic',
        label: 'Italic',
        icon: <TextItalicIcon size={14} />,
        onSelect: () => insertFormatting('_', '_', 'italic text'),
      },
      {
        id: 'code',
        label: 'Inline code',
        icon: <CodeIcon size={14} />,
        onSelect: () => insertFormatting('`', '`', 'code'),
      },
      {
        id: 'quote',
        label: 'Quote',
        icon: <QuotesIcon size={14} />,
        onSelect: () => insertFormatting('> ', '', 'quote', true),
      },
      {
        id: 'copy',
        label: 'Copy selection',
        icon: <CopyIcon size={14} />,
        onSelect: copySelection,
      },
    ],
    [copySelection, insertFormatting]
  )

  const previewSelectionActions = useMemo(
    () => [
      {
        id: 'copy',
        label: 'Copy selection',
        icon: <CopyIcon size={14} />,
        onSelect: copySelection,
      },
      {
        id: 'quote',
        label: 'Copy as quote',
        icon: <QuotesIcon size={14} />,
        onSelect: copyPreviewQuote,
      },
    ],
    [copyPreviewQuote, copySelection]
  )

  const handleModalInsert = useCallback(
    (text: string) => {
      const editor = editorRef.current
      if (!editor) return
      const selection = editor.getSelection()
      const model = editor.getModel()
      if (!model || !selection) return
      editor.executeEdits('modal-insert', [{ range: selection, text, forceMoveMarkers: true }])
      editor.focus()
      setActiveModal(null)
    },
    [editorRef]
  )

  // ─── Find and replace ────────────────────────────────────────────

  /**
   * Open Monaco's find (or find-and-replace) widget.
   *
   * Deliberately *not* a hand-rolled panel. Monaco already ships one with regex, case sensitivity,
   * whole-word, find-in-selection, match counts and Enter/Shift-Enter cycling — all of it already
   * wired to the model this editor is using. A second panel beside it would be a worse widget in a
   * second place, and the two would disagree about which match is current.
   *
   * What was actually missing is everything around it: the widget was reachable only by pressing
   * ⌘F while the caret was already in the editor, with nothing in the UI to say it existed, and
   * nothing at all in Preview mode.
   */
  const openFind = useCallback(
    (replace: boolean) => {
      // Preview has no editor to search. Switching to split is better than refusing: the user asked
      // to find something, and the only way to honour that is to show them the text.
      if (state.mode === 'preview') {
        setPreviewEditing(false)
        updateState({ mode: 'split' })
      }

      // Retried rather than deferred one frame, and the check is DOM connectivity rather than
      // `editorRef.current != null`. Preview unmounts the editor without clearing the ref, so the
      // ref still points at the *previous*, detached instance — `getAction` on it silently does
      // nothing, and the mode flipped with no find widget in sight. Waiting for a connected DOM
      // node is what distinguishes the live instance from the corpse. Found in the browser
      // harness; jsdom cannot see it because it never mounts a real Monaco.
      const deadline = Date.now() + 3000
      const attempt = () => {
        const editor = editorRef.current
        if (!editor || !editor.getDomNode()?.isConnected) {
          if (Date.now() < deadline) requestAnimationFrame(attempt)
          return
        }
        editor.focus()
        void editor
          .getAction(replace ? 'editor.action.startFindReplaceAction' : 'actions.find')
          ?.run()
      }
      requestAnimationFrame(attempt)
    },
    [editorRef, setPreviewEditing, state.mode, updateState]
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isInstanceActive) return
      if (!e.metaKey && !e.ctrlKey) return
      const key = e.key.toLowerCase()
      if (key !== 'f' && key !== 'h') return
      if (!isKeyEventForTool(e, toolRootRef.current)) return
      // When the caret is already in the editor, Monaco's own keybinding handles this and does it
      // better — it seeds the search box from the selection. Only step in when it can't.
      if (editorRef.current?.hasTextFocus()) return
      e.preventDefault()
      openFind(key === 'h')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editorRef, isInstanceActive, openFind, toolRootRef])

  // ─── Keyboard shortcuts for formatting ───────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isInstanceActive) return
      if (!e.metaKey && !e.ctrlKey) return
      if (!editorRef.current?.hasTextFocus()) return
      if (e.key === 'b') {
        e.preventDefault()
        insertFormatting('**', '**', 'bold text')
      } else if (e.key === 'i') {
        e.preventDefault()
        insertFormatting('_', '_', 'italic text')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editorRef, insertFormatting, isInstanceActive])

  return {
    activeModal,
    setActiveModal,
    insertFormatting,
    editorSelectionActions,
    previewSelectionActions,
    handleModalInsert,
    openFind,
  }
}
