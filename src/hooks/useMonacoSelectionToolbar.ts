import { useCallback, useEffect, useState } from 'react'
import type { SelectionToolbarState } from '@/components/shared/SelectionContextToolbar'

type Disposable = { dispose: () => void }
type MonacoPosition = { lineNumber: number; column: number }
type MonacoSelection = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  isEmpty: () => boolean
  getStartPosition: () => MonacoPosition
  getEndPosition: () => MonacoPosition
}

type MonacoModel = {
  getValueInRange: (selection: MonacoSelection) => string
}

type MonacoSelectionEditor = {
  getModel: () => MonacoModel | null
  getSelection: () => MonacoSelection | null
  getDomNode: () => HTMLElement | null
  getScrolledVisiblePosition: (
    position: MonacoPosition
  ) => { left: number; top: number; height: number } | null
  onDidBlurEditorWidget: (listener: () => void) => Disposable
  onDidChangeCursorSelection: (listener: () => void) => Disposable
  onDidScrollChange: (listener: () => void) => Disposable
}

export function useMonacoSelectionToolbar(
  editor: MonacoSelectionEditor | null,
  enabled: boolean,
  invalidationKey?: unknown
) {
  const [selection, setSelection] = useState<SelectionToolbarState | null>(null)

  const clearSelection = useCallback(() => {
    setSelection(null)
  }, [])

  const updateSelection = useCallback(() => {
    if (!enabled || !editor) {
      setSelection(null)
      return
    }

    const model = editor.getModel()
    const selectedRange = editor.getSelection()
    const domNode = editor.getDomNode()
    if (!model || !selectedRange || selectedRange.isEmpty() || !domNode) {
      setSelection(null)
      return
    }

    const text = model.getValueInRange(selectedRange).trim()
    const visiblePosition =
      editor.getScrolledVisiblePosition(selectedRange.getEndPosition()) ??
      editor.getScrolledVisiblePosition(selectedRange.getStartPosition())
    if (!text) {
      setSelection(null)
      return
    }

    const editorRect = domNode.getBoundingClientRect()
    setSelection({
      text,
      rect: visiblePosition
        ? new window.DOMRect(
            editorRect.left + visiblePosition.left,
            editorRect.top + visiblePosition.top,
            1,
            visiblePosition.height
          )
        : new window.DOMRect(editorRect.left + editorRect.width / 2, editorRect.top + 40, 1, 1),
    })
  }, [editor, enabled])

  useEffect(() => {
    setSelection(null)
  }, [invalidationKey])

  useEffect(() => {
    if (!enabled || !editor) {
      setSelection(null)
      return
    }

    const disposables = [
      editor.onDidChangeCursorSelection(updateSelection),
      editor.onDidScrollChange(clearSelection),
      editor.onDidBlurEditorWidget(clearSelection),
    ]

    updateSelection()

    return () => {
      for (const disposable of disposables) disposable.dispose()
    }
  }, [clearSelection, editor, enabled, updateSelection])

  return { selection, clearSelection }
}
