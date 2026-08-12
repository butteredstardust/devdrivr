import { useEffect } from 'react'
import { isUrl, tsvToMarkdownTable } from '../paste-helpers'

// Structural (not imported) monaco-editor types — same pattern as
// useMonacoSelectionToolbar/useMarkdownListEditing.

interface MonacoRange {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

interface MonacoSelectionLike extends MonacoRange {
  isEmpty: () => boolean
}

interface MonacoModelLike {
  getValueInRange: (range: MonacoRange) => string
}

interface MonacoEditOperationLike {
  range: MonacoRange
  text: string
  forceMoveMarkers?: boolean
}

interface MonacoSmartPasteEditor {
  getModel: () => MonacoModelLike | null
  getSelection: () => MonacoSelectionLike | null
  getDomNode: () => HTMLElement | null
  executeEdits: (source: string, edits: MonacoEditOperationLike[]) => void
  focus: () => void
}

/**
 * Intercepts paste on the editor's DOM node (capture phase — Monaco's own
 * `onDidPaste` fires too late to alter content) to implement two smart-paste
 * behaviours:
 *  - Pasting a URL over a non-empty selection turns it into `[selection](url)`.
 *  - Pasting multi-row/multi-column TSV data turns it into a GFM table.
 * Anything else (plain text, code, a URL with no selection, single-column or
 * single-row data) falls through to Monaco's default paste handling.
 */
export function useMarkdownSmartPaste(editor: MonacoSmartPasteEditor | null): void {
  useEffect(() => {
    if (!editor) return
    const domNode = editor.getDomNode()
    if (!domNode) return

    const handler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain')
      if (!text) return

      const model = editor.getModel()
      const selection = editor.getSelection()
      if (!model || !selection) return

      const hasSelection = !selection.isEmpty()

      if (hasSelection && isUrl(text)) {
        const selectedText = model.getValueInRange(selection)
        e.preventDefault()
        e.stopPropagation()
        editor.executeEdits('smart-paste-link', [
          { range: selection, text: `[${selectedText}](${text.trim()})`, forceMoveMarkers: true },
        ])
        editor.focus()
        return
      }

      const table = tsvToMarkdownTable(text)
      if (table) {
        e.preventDefault()
        e.stopPropagation()
        editor.executeEdits('smart-paste-table', [
          { range: selection, text: table, forceMoveMarkers: true },
        ])
        editor.focus()
      }
      // else: let Monaco handle the paste as usual
    }

    domNode.addEventListener('paste', handler, true)
    return () => domNode.removeEventListener('paste', handler, true)
  }, [editor])
}
