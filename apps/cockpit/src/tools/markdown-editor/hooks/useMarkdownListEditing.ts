import { useEffect } from 'react'
import {
  indentLine,
  isMarkerContentEmpty,
  nextLineMarker,
  outdentLine,
  parseListMarker,
  renumberAroundIndex,
  renumberOrderedListAround,
} from '../list-editing'

// Structural (not imported) monaco-editor types — same pattern as
// useMonacoSelectionToolbar/useImageDrop, so this hook doesn't need to pull
// in the full `monaco-editor` type surface.

type Disposable = { dispose: () => void }

interface KeyboardEventLike {
  keyCode: number
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  preventDefault: () => void
  stopPropagation: () => void
}

interface MonacoPosition {
  lineNumber: number
  column: number
}

interface MonacoRange {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

interface MonacoSelectionLike {
  isEmpty: () => boolean
  getPosition: () => MonacoPosition
}

interface MonacoModelLike {
  getLineContent: (lineNumber: number) => string
  getLineCount: () => number
  getLinesContent: () => string[]
  getLineMaxColumn: (lineNumber: number) => number
  getOptions: () => { tabSize: number; insertSpaces: boolean }
}

interface MonacoEditOperationLike {
  range: MonacoRange
  text: string
  forceMoveMarkers?: boolean
}

interface MonacoListEditingEditor {
  getModel: () => MonacoModelLike | null
  getSelection: () => MonacoSelectionLike | null
  executeEdits: (source: string, edits: MonacoEditOperationLike[]) => void
  setPosition: (position: MonacoPosition) => void
  onKeyDown: (listener: (e: KeyboardEventLike) => void) => Disposable
}

// monaco.KeyCode.Enter / monaco.KeyCode.Tab — hardcoded to avoid pulling in
// the monaco-editor runtime just for two enum values.
const KEY_CODE_ENTER = 3
const KEY_CODE_TAB = 2

function handleEnter(editor: MonacoListEditingEditor): boolean {
  const selection = editor.getSelection()
  const model = editor.getModel()
  if (!selection || !model || !selection.isEmpty()) return false

  const position = selection.getPosition()
  const lineContent = model.getLineContent(position.lineNumber)
  if (position.column !== lineContent.length + 1) return false // not at end of line

  const marker = parseListMarker(lineContent)
  if (!marker) return false

  if (isMarkerContentEmpty(marker)) {
    editor.executeEdits('markdown-list-exit', [
      {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: lineContent.length + 1,
        },
        text: '',
        forceMoveMarkers: true,
      },
    ])
    editor.setPosition({ lineNumber: position.lineNumber, column: 1 })
    return true
  }

  const lines = model.getLinesContent()
  const idx = position.lineNumber - 1
  const continuation = nextLineMarker(marker)
  const newLines = [...lines]
  newLines.splice(idx + 1, 0, continuation)

  const finalLines =
    marker.kind === 'ordered'
      ? renumberOrderedListAround(newLines, idx + 1, marker.indent)
      : newLines

  const tail = finalLines.slice(idx + 1).join('\n')
  const endLineNumber = model.getLineCount()
  const endColumn = model.getLineMaxColumn(endLineNumber)

  editor.executeEdits('markdown-list-enter', [
    {
      range: {
        startLineNumber: position.lineNumber,
        startColumn: lineContent.length + 1,
        endLineNumber,
        endColumn,
      },
      text: '\n' + tail,
      forceMoveMarkers: true,
    },
  ])

  const insertedLine = finalLines[idx + 1] ?? continuation
  editor.setPosition({ lineNumber: position.lineNumber + 1, column: insertedLine.length + 1 })
  return true
}

function handleTab(editor: MonacoListEditingEditor, shiftKey: boolean): boolean {
  const selection = editor.getSelection()
  const model = editor.getModel()
  if (!selection || !model || !selection.isEmpty()) return false

  const position = selection.getPosition()
  const lineContent = model.getLineContent(position.lineNumber)
  const marker = parseListMarker(lineContent)
  if (!marker) return false

  const { tabSize, insertSpaces } = model.getOptions()
  const newLineContent = shiftKey
    ? outdentLine(lineContent, insertSpaces, tabSize)
    : indentLine(lineContent, insertSpaces, tabSize)

  const lines = model.getLinesContent()
  const idx = position.lineNumber - 1
  let finalLines = [...lines]
  finalLines[idx] = newLineContent

  if (marker.kind === 'ordered') {
    finalLines = renumberAroundIndex(finalLines, idx, marker.indent)
    const newMarker = parseListMarker(newLineContent)
    if (newMarker && newMarker.kind === 'ordered') {
      finalLines = renumberOrderedListAround(finalLines, idx, newMarker.indent)
    }
  }

  const edits: MonacoEditOperationLike[] = []
  for (let i = 0; i < finalLines.length; i++) {
    const original = lines[i] ?? ''
    const updated = finalLines[i] ?? ''
    if (updated !== original) {
      edits.push({
        range: {
          startLineNumber: i + 1,
          startColumn: 1,
          endLineNumber: i + 1,
          endColumn: original.length + 1,
        },
        text: updated,
        forceMoveMarkers: true,
      })
    }
  }

  if (edits.length > 0) editor.executeEdits('markdown-list-tab', edits)

  const delta = (finalLines[idx] ?? '').length - lineContent.length
  editor.setPosition({
    lineNumber: position.lineNumber,
    column: Math.max(1, position.column + delta),
  })
  return true
}

/**
 * Registers smart Enter/Tab keybindings for markdown lists (bullets, ordered
 * lists, task items, blockquotes) on the given editor instance. All logic
 * lives in ./list-editing.ts so it can be unit tested without Monaco; this
 * hook is just the wiring + editor mutation layer.
 */
export function useMarkdownListEditing(editor: MonacoListEditingEditor | null): void {
  useEffect(() => {
    if (!editor) return

    const disposable = editor.onKeyDown((e) => {
      if (e.keyCode === KEY_CODE_ENTER && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (handleEnter(editor)) {
          e.preventDefault()
          e.stopPropagation()
        }
      } else if (e.keyCode === KEY_CODE_TAB && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (handleTab(editor, e.shiftKey)) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    })

    return () => disposable.dispose()
  }, [editor])
}
