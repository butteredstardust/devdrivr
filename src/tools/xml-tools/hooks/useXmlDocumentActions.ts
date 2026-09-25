import { useCallback, useRef, useState, type RefObject } from 'react'
import { type OnMount } from '@monaco-editor/react'
import type { CopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useReloadOnFileChange } from '@/hooks/useReloadOnFileChange'
import { useTextDocumentFileActions } from '@/hooks/useTextDocumentFileActions'
import { useToolAction } from '@/hooks/useToolAction'
import type { HistoryEntryInput } from '@/hooks/useToolHistory'
import type { WorkerRpc } from '@/hooks/useWorker'
import type { ProblemItem } from '@/components/shared/ProblemsList'
import { useUiStore } from '@/stores/ui.store'
import {
  describeIssue,
  firstBlockingIssue,
  type UpdateXmlToolsState,
  type XmlToolsState,
} from '@/tools/xml-tools/xml-tools-helpers'
import type { XmlIssue } from '@/workers/xml.api'
import type { XmlWorker } from '@/workers/xml.worker'

type UseXmlDocumentActionsOptions = {
  state: XmlToolsState
  updateState: UpdateXmlToolsState
  worker: WorkerRpc<XmlWorker> | null
  inputRef: RefObject<string>
  blockingIssue: XmlIssue | undefined
  record: (entry: HistoryEntryInput) => void
  copy: CopyToClipboard
}

export function useXmlDocumentActions({
  state,
  updateState,
  worker,
  inputRef,
  blockingIssue,
  record,
  copy,
}: UseXmlDocumentActionsOptions) {
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const busyRef = useRef(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const { view, indent } = state

  // --- Actions ---------------------------------------------------------

  const recordRun = useCallback(
    (output: string) => {
      const source = inputRef.current
      record({
        input: `XML: ${source.slice(0, 300)}${source.length > 300 ? '...' : ''}`,
        output: output.slice(0, 1000),
        subTab: view,
        success: true,
      })
    },
    [record, view, inputRef]
  )

  const runTransform = useCallback(
    async (operation: 'format' | 'minify') => {
      if (!worker || busyRef.current || !inputRef.current.trim()) return
      busyRef.current = true
      setIsBusy(true)
      const snapshot = inputRef.current
      try {
        const result =
          operation === 'format'
            ? await worker.format(snapshot, indent)
            : await worker.minify(snapshot)
        if (result.valid && result.formatted !== undefined) {
          // Writing the result over a buffer the user kept typing into would
          // silently eat those keystrokes.
          if (inputRef.current !== snapshot) {
            setLastAction('Document changed while working — try again', 'info')
            return
          }
          updateState({ input: result.formatted })
          setError(null)
          setLastAction(operation === 'format' ? 'Formatted XML' : 'Minified XML', 'success')
          recordRun(result.formatted)
        } else {
          const issue = firstBlockingIssue(result.issues) ?? result.issues[0]
          setError(issue ? describeIssue(issue) : 'Invalid XML')
          setLastAction('Invalid XML', 'error')
        }
      } catch (e) {
        setError((e as Error).message)
        setLastAction(`${operation === 'format' ? 'Format' : 'Minify'} failed`, 'error')
      } finally {
        busyRef.current = false
        setIsBusy(false)
      }
    },
    [worker, indent, updateState, setLastAction, recordRun, inputRef]
  )

  const { handleOpen, handleSave, handleSaveAs } = useTextDocumentFileActions({
    getContent: () => inputRef.current,
    filePath: state.filePath ?? null,
    fileName: state.fileName ?? null,
    defaultFileName: 'document.xml',
    onSaved: updateState,
  })

  // The parser knows where it went wrong; without this the user reads a line
  // number and then scrolls to find it by hand.
  const handleGoToIssue = useCallback(
    (problem?: ProblemItem) => {
      const editor = editorRef.current
      const line = problem?.line ?? blockingIssue?.line
      if (!editor || !line) return
      const position = { lineNumber: line, column: problem?.column ?? blockingIssue?.column ?? 1 }
      editor.revealPositionInCenter(position)
      editor.setPosition(position)
      editor.focus()
    },
    [blockingIssue]
  )

  useReloadOnFileChange({
    filePath: state.filePath ?? null,
    getContent: () => inputRef.current,
    onReload: ({ content, filename, path }) => {
      updateState({ input: content, fileName: filename, filePath: path })
      setError(null)
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
      setLastAction(`Opened ${action.filename}`, 'success')
    }
    if (action.type === 'save-file') void handleSave()
    if (action.type === 'copy-output' && inputRef.current.trim()) {
      void copy(inputRef.current, { success: 'Copied XML' })
    }
  })

  useKeyboardShortcut(
    { key: 'Enter', mod: true },
    useCallback(() => {
      void runTransform('format')
    }, [runTransform])
  )

  const handleApplyJson = (json: string, rootName: string) => {
    if (!worker) return
    void worker.fromJson(json, rootName).then((result) => {
      if (result.valid && result.xml) {
        updateState({ input: result.xml })
        setLastAction('Applied JSON to XML', 'success')
      } else {
        setLastAction(`Could not apply JSON — ${result.error ?? 'invalid JSON'}`, 'error')
      }
    })
  }

  return {
    editorRef,
    error,
    setError,
    isBusy,
    runTransform,
    handleOpen,
    handleSave,
    handleSaveAs,
    handleGoToIssue,
    handleApplyJson,
  }
}
