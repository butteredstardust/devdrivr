import { useCallback, useRef, useState, type RefObject } from 'react'
import { type OnMount } from '@monaco-editor/react'
import type { CopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useReloadOnFileChange } from '@/hooks/useReloadOnFileChange'
import { useTextDocumentFileActions } from '@/hooks/useTextDocumentFileActions'
import { useToolAction } from '@/hooks/useToolAction'
import type { HistoryEntryInput } from '@/hooks/useToolHistory'
import type { WorkerRpc } from '@/hooks/useWorker'
import { useUiStore } from '@/stores/ui.store'
import {
  hasUnpreservableSyntax,
  jsonToYaml,
  parseYamlStream,
  sortKeysDeep,
  stringifyYamlStream,
  type UpdateYamlToolsState,
  type YamlParse,
  type YamlToolsState,
} from '@/tools/yaml-tools/yaml-helpers'
import type { FormatterWorker } from '@/workers/formatter.worker'

type UseYamlDocumentActionsOptions = {
  state: YamlToolsState
  updateState: UpdateYamlToolsState
  formatter: WorkerRpc<FormatterWorker> | null
  inputRef: RefObject<string>
  parsed: YamlParse
  record: (entry: HistoryEntryInput) => void
  copy: CopyToClipboard
}

export function useYamlDocumentActions({
  state,
  updateState,
  formatter,
  inputRef,
  parsed,
  record,
  copy,
}: UseYamlDocumentActionsOptions) {
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)
  const [isFormatting, setIsFormatting] = useState(false)
  const formattingRef = useRef(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  // Reshaping drops comments; an undo that does not depend on Monaco's history
  // is the difference between "annoying" and "lost work".
  const [undoBuffer, setUndoBuffer] = useState<{ input: string; label: string } | null>(null)
  // Lives here rather than in the pane so switching to Source or Tree does not
  // silently throw away an unapplied edit.
  const [jsonDraft, setJsonDraft] = useState<string | null>(null)
  const { view } = state

  // --- Actions ---------------------------------------------------------

  const recordRun = useCallback(
    (output: string) => {
      const source = inputRef.current
      record({
        input: `YAML: ${source.slice(0, 300)}${source.length > 300 ? '...' : ''}`,
        output: output.slice(0, 1000),
        subTab: view,
        success: true,
      })
    },
    [record, view, inputRef]
  )

  /** Writes a reshaped document back, keeping the previous text recoverable. */
  const applyResult = useCallback(
    (next: string, label: string, previous: string) => {
      setUndoBuffer({ input: previous, label })
      updateState({ input: next })
      setError(null)
      recordRun(next)
    },
    [updateState, recordRun]
  )

  const handleFormat = useCallback(async () => {
    if (!formatter || formattingRef.current || !inputRef.current.trim()) return
    formattingRef.current = true
    setIsFormatting(true)
    const snapshot = inputRef.current
    try {
      const result = await formatter.format(snapshot, {
        language: 'yaml',
        tabWidth: state.tabWidth ?? 2,
      })
      // Writing the result over a buffer the user kept typing into would
      // silently eat those keystrokes.
      if (inputRef.current !== snapshot) {
        setLastAction('Document changed while formatting — try again', 'info')
        return
      }
      applyResult(result, 'Formatted YAML', snapshot)
      setLastAction('Formatted YAML', 'success')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      setLastAction('Format failed', 'error')
    } finally {
      formattingRef.current = false
      setIsFormatting(false)
    }
  }, [formatter, applyResult, setLastAction, state.tabWidth, inputRef])

  const reshape = useCallback(
    (transform: (documents: unknown[]) => string, label: string) => {
      // Parsed fresh rather than read off the debounced memo, so a click landing
      // within the debounce window reshapes what is actually in the buffer.
      const snapshot = inputRef.current
      const current = parseYamlStream(snapshot)
      if (current.status !== 'valid') {
        setLastAction(`${label} — the document does not parse`, 'error')
        return
      }
      try {
        const next = transform(current.documents)
        applyResult(next, label, snapshot)
        if (hasUnpreservableSyntax(snapshot)) {
          setLastAction(`${label} — comments and anchors were not preserved`, 'info')
        } else {
          setLastAction(label, 'success')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setLastAction(`${label} failed`, 'error')
      }
    },
    [applyResult, setLastAction, inputRef]
  )

  const handleSortKeys = useCallback(
    () => reshape((docs) => stringifyYamlStream(docs.map(sortKeysDeep)), 'Sorted keys'),
    [reshape]
  )

  // Use flow style because removing blank lines alone does not compact YAML structure.
  const handleCompact = useCallback(
    () => reshape((docs) => stringifyYamlStream(docs, { flowLevel: 0 }), 'Compacted YAML'),
    [reshape]
  )

  /**
   * Apply edits from the JSON pane to preserve JSON-to-YAML conversion without maintaining a
   * second document.
   */
  const handleApplyJson = useCallback(
    (json: string) => {
      const snapshot = inputRef.current
      try {
        // A stream is shown as a JSON array; dumping that array as one document
        // would turn N documents into a single sequence — a different document.
        const data: unknown = JSON.parse(json)
        const current = parseYamlStream(snapshot)
        const wasStream = current.status === 'valid' && current.documents.length > 1
        const next = wasStream && Array.isArray(data) ? stringifyYamlStream(data) : jsonToYaml(json)
        applyResult(next, 'Applied JSON', snapshot)
        setLastAction('Applied JSON to YAML', 'success')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setLastAction('Apply failed', 'error')
      }
    },
    [applyResult, setLastAction, inputRef]
  )

  const handleUndo = useCallback(() => {
    if (!undoBuffer) return
    updateState({ input: undoBuffer.input })
    setUndoBuffer(null)
    setLastAction('Reverted', 'info')
  }, [undoBuffer, updateState, setLastAction])

  const { handleOpen, handleSave, handleSaveAs } = useTextDocumentFileActions({
    getContent: () => inputRef.current,
    filePath: state.filePath ?? null,
    fileName: state.fileName ?? null,
    defaultFileName: 'document.yaml',
    onSaved: updateState,
  })

  // The parse error knows where it is; without this the user reads the line
  // number and then scrolls to find it by hand.
  const handleGoToError = useCallback(() => {
    if (parsed.status !== 'invalid' || !parsed.location) return
    const editor = editorRef.current
    if (!editor) return
    const position = { lineNumber: parsed.location.line, column: parsed.location.column }
    editor.revealPositionInCenter(position)
    editor.setPosition(position)
    editor.focus()
  }, [parsed])

  useReloadOnFileChange({
    filePath: state.filePath ?? null,
    getContent: () => inputRef.current,
    keepUnsavedEdits: true,
    onReload: ({ content, filename, path }) => {
      updateState({ input: content, fileName: filename, filePath: path })
      setError(null)
      setUndoBuffer(null)
      setJsonDraft(null)
      setLastAction(`Reloaded ${filename} from disk`, 'success')
    },
  })

  useToolAction((action) => {
    if (action.type === 'open-file') {
      updateState({
        input: action.content,
        fileName: action.filename,
        filePath: action.path ?? null,
      })
      setError(null)
      setUndoBuffer(null)
      setJsonDraft(null)
      setLastAction(`Opened ${action.filename}`, 'success')
    }
    if (action.type === 'save-file') void handleSave()
    if (action.type === 'copy-output') {
      void copy(inputRef.current, { success: 'Copied YAML' })
    }
  })

  return {
    editorRef,
    error,
    setError,
    isFormatting,
    undoBuffer,
    setUndoBuffer,
    jsonDraft,
    setJsonDraft,
    handleFormat,
    handleSortKeys,
    handleCompact,
    handleApplyJson,
    handleUndo,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleGoToError,
  }
}
