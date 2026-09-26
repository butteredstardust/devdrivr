import { useCallback, useState, type MutableRefObject, type RefObject } from 'react'
import type { WorkerRpc } from '@/hooks/useWorker'
import { filenameFromPath, openFileDialog, saveFileDialog, saveFileToPath } from '@/lib/file-io'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import type { useUiStore } from '@/stores/ui.store'
import { templateById } from '@/tools/css-validator/css-helpers'
import {
  syntaxFromFilename,
  type CssValidatorState,
  type PendingDocument,
  type UpdateCssValidatorState,
} from '@/tools/css-validator/css-validator-types'
import type { FormatterWorker } from '@/workers/formatter.worker'

type UseCssDocumentActionsOptions = {
  state: CssValidatorState
  updateState: UpdateCssValidatorState
  formatter: WorkerRpc<FormatterWorker> | null
  inputRef: RefObject<string>
  userEditedRef: MutableRefObject<boolean>
  isDirty: boolean
  setLastAction: ReturnType<typeof useUiStore.getState>['setLastAction']
}

export function useCssDocumentActions({
  state,
  updateState,
  formatter,
  inputRef,
  userEditedRef,
  isDirty,
  setLastAction,
}: UseCssDocumentActionsOptions) {
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
        ...(document.syntax ? { syntax: document.syntax } : {}),
      })
      setFormatError(null)
      setPendingDocument(null)
      setLastAction(document.successMessage, 'success')
    },
    [updateState, setLastAction, userEditedRef]
  )

  // Confirm before loading a sample over unsaved content because this action cannot be undone.
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
      successMessage: 'New stylesheet created',
    })
  }, [requestDocument])

  const handleLoadTemplate = useCallback(() => {
    const template = templateById(state.templateId)
    if (!template) return
    requestDocument({
      input: template.css,
      fileName: null,
      filePath: null,
      // A template is the buffer's starting point, not an edit of it — calling a
      // freshly loaded one "Modified" made the next load ask to discard changes
      // nobody had made.
      savedContent: template.css,
      successMessage: `Loaded the ${template.label.toLowerCase()} template`,
    })
  }, [state.templateId, requestDocument])

  const handleLoadSample = useCallback(() => {
    const sample = TOOL_SAMPLES['css-validator']
    if (!sample) return
    requestDocument({
      input: sample,
      fileName: null,
      filePath: null,
      savedContent: sample,
      successMessage: 'Loaded the sample stylesheet',
    })
  }, [requestDocument])

  const handleChange = useCallback(
    (value: string | undefined) => {
      userEditedRef.current = true
      // The first edit of a stylesheet with no file behind it establishes an
      // empty saved text. `userEditedRef` alone would not survive the unmount a
      // tab switch causes, so returning to the tab would call typed-but-unsaved
      // CSS "Saved" and let the next template replace it without asking.
      updateState(
        state.savedContent === null
          ? { input: value ?? '', savedContent: '' }
          : { input: value ?? '' }
      )
      // The banner describes a failed format of the *old* text.
      setFormatError(null)
    },
    [state.savedContent, updateState, userEditedRef]
  )

  // --- Files -----------------------------------------------------------

  const handleOpen = useCallback(async () => {
    try {
      const result = await openFileDialog()
      if (!result) return
      const syntax = syntaxFromFilename(result.filename)
      requestDocument({
        input: result.content,
        fileName: result.filename,
        filePath: result.path,
        savedContent: result.content,
        ...(syntax ? { syntax } : {}),
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
      const path = await saveFileDialog(snapshot, state.fileName ?? `styles.${state.syntax}`)
      if (!path) {
        setLastAction('Save cancelled', 'info')
        return
      }
      updateState({ filePath: path, fileName: filenameFromPath(path), savedContent: snapshot })
      setLastAction(`Saved ${path}`, 'success')
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : 'Save failed', 'error')
    }
  }, [state.fileName, state.syntax, updateState, setLastAction, inputRef])

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
      const formatted = await formatter.format(snapshot, { language: state.syntax, tabWidth: 2 })
      // Writing the result over a buffer the user kept typing into would
      // silently eat those keystrokes.
      if (inputRef.current !== snapshot) {
        setLastAction('Stylesheet changed while formatting — try again', 'info')
        return
      }
      userEditedRef.current = true
      updateState(
        state.savedContent === null ? { input: formatted, savedContent: '' } : { input: formatted }
      )
      setFormatError(null)
      setLastAction(`Formatted ${state.syntax.toUpperCase()}`, 'success')
    } catch (err) {
      // Prettier refuses CSS it cannot parse. Do not apply a fallback formatter because rewriting
      // invalid text can alter unchecked content.
      setFormatError(err instanceof Error ? err.message : 'Could not format this stylesheet')
      setLastAction('Format failed', 'error')
    } finally {
      setIsFormatting(false)
    }
  }, [
    formatter,
    isFormatting,
    state.savedContent,
    state.syntax,
    updateState,
    setLastAction,
    userEditedRef,
    inputRef,
  ])

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
