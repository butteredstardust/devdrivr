import { useCallback, useState, type MutableRefObject } from 'react'
import type { WorkerRpc } from '@/hooks/useWorker'
import { filenameFromPath, openFileDialog, saveFileDialog, saveFileToPath } from '@/lib/file-io'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import { useUiStore } from '@/stores/ui.store'
import { templateById } from '@/tools/html-validator/html-helpers'
import type {
  HtmlValidatorState,
  PendingDocument,
  UpdateHtmlValidatorState,
} from '@/tools/html-validator/html-validator-types'
import type { FormatterWorker } from '@/workers/formatter.worker'

type UseHtmlDocumentOptions = {
  state: HtmlValidatorState
  updateState: UpdateHtmlValidatorState
  inputRef: MutableRefObject<string>
  userEditedRef: MutableRefObject<boolean>
  isDirty: boolean
  formatter: WorkerRpc<FormatterWorker> | null
}

export function useHtmlDocument({
  state,
  updateState,
  inputRef,
  userEditedRef,
  isDirty,
  formatter,
}: UseHtmlDocumentOptions) {
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [isFormatting, setIsFormatting] = useState(false)
  const [formatError, setFormatError] = useState<string | null>(null)
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null)

  // --- Buffer swaps ----------------------------------------------------

  const applyDocument = useCallback(
    (document: PendingDocument) => {
      userEditedRef.current = true
      updateState({
        input: document.input,
        fileName: document.fileName,
        filePath: document.filePath,
        savedContent: document.savedContent,
      })
      setFormatError(null)
      setPendingDocument(null)
      setLastAction(document.successMessage, 'success')
    },
    [updateState, setLastAction, userEditedRef]
  )

  // Confirm before loading a template over unsaved content because this action cannot be undone.
  const requestDocument = useCallback(
    (document: PendingDocument) => {
      // An empty or already-saved buffer has nothing to lose.
      if (isDirty && inputRef.current.trim()) {
        setPendingDocument(document)
        return
      }
      applyDocument(document)
    },
    [isDirty, applyDocument, inputRef]
  )

  const handleNew = useCallback(() => {
    requestDocument({
      input: '',
      fileName: null,
      filePath: null,
      savedContent: '',
      successMessage: 'New document created',
    })
  }, [requestDocument])

  const handleLoadTemplate = useCallback(() => {
    const template = templateById(state.templateId)
    if (!template) return
    requestDocument({
      input: template.html,
      fileName: null,
      filePath: null,
      // A template is the buffer's starting point, not an edit of it — calling a
      // freshly loaded template "Modified" made loading a second one ask to
      // discard changes nobody had made.
      savedContent: template.html,
      successMessage: `Loaded the ${template.label.toLowerCase()} template`,
    })
  }, [state.templateId, requestDocument])

  const handleLoadSample = useCallback(() => {
    const sample = TOOL_SAMPLES['html-validator']
    if (!sample) return
    requestDocument({
      input: sample,
      fileName: null,
      filePath: null,
      savedContent: sample,
      successMessage: 'Loaded the sample document',
    })
  }, [requestDocument])

  const handleChange = useCallback(
    (value: string | undefined) => {
      userEditedRef.current = true
      updateState({ input: value ?? '' })
      // The banner describes a failed format of the *old* text.
      setFormatError(null)
    },
    [updateState, userEditedRef]
  )

  // --- Files -----------------------------------------------------------

  const handleOpen = useCallback(async () => {
    try {
      const result = await openFileDialog()
      if (!result) return
      requestDocument({
        input: result.content,
        fileName: result.filename,
        filePath: result.path,
        savedContent: result.content,
        successMessage: `Opened ${result.filename}`,
      })
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : 'Open failed', 'error')
    }
  }, [requestDocument, setLastAction])

  const handleSaveAs = useCallback(async () => {
    const snapshot = inputRef.current
    if (!snapshot.trim()) {
      setLastAction('Nothing to save yet', 'info')
      return
    }
    try {
      const path = await saveFileDialog(snapshot, state.fileName ?? 'page.html')
      if (!path) {
        setLastAction('Save cancelled', 'info')
        return
      }
      updateState({ filePath: path, fileName: filenameFromPath(path), savedContent: snapshot })
      setLastAction(`Saved ${path}`, 'success')
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : 'Save failed', 'error')
    }
  }, [state.fileName, updateState, setLastAction, inputRef])

  const handleSave = useCallback(async () => {
    const snapshot = inputRef.current
    if (!snapshot.trim()) {
      setLastAction('Nothing to save yet', 'info')
      return
    }
    if (!state.filePath) {
      await handleSaveAs()
      return
    }
    try {
      await saveFileToPath(state.filePath, snapshot)
      updateState({ savedContent: snapshot })
      setLastAction(`Saved ${state.fileName ?? filenameFromPath(state.filePath)}`, 'success')
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : 'Save failed', 'error')
    }
  }, [state.filePath, state.fileName, handleSaveAs, setLastAction, updateState, inputRef])

  // --- Format ----------------------------------------------------------

  const handleFormat = useCallback(async () => {
    const snapshot = inputRef.current
    if (!formatter || !snapshot.trim() || isFormatting) return
    setIsFormatting(true)
    try {
      const formatted = await formatter.format(snapshot, { language: 'html', tabWidth: 2 })
      // Writing the result over a buffer the user kept typing into would
      // silently eat those keystrokes.
      if (inputRef.current !== snapshot) {
        setLastAction('Document changed while formatting — try again', 'info')
        return
      }
      userEditedRef.current = true
      updateState({ input: formatted })
      setFormatError(null)
      setLastAction('Formatted HTML', 'success')
    } catch (err) {
      // Prettier refuses to format markup it cannot parse, which is exactly the
      // markup this tool exists to find — so say so instead of failing silently.
      setFormatError(err instanceof Error ? err.message : 'Could not format this document')
      setLastAction('Format failed', 'error')
    } finally {
      setIsFormatting(false)
    }
  }, [formatter, isFormatting, updateState, setLastAction, userEditedRef, inputRef])

  return {
    isFormatting,
    formatError,
    pendingDocument,
    setPendingDocument,
    applyDocument,
    requestDocument,
    handleNew,
    handleLoadTemplate,
    handleLoadSample,
    handleChange,
    handleOpen,
    handleSaveAs,
    handleSave,
    handleFormat,
  }
}
