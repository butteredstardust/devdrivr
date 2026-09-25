import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { useReloadOnFileChange } from '@/hooks/useReloadOnFileChange'
import { useToolAction } from '@/hooks/useToolAction'
import { filenameFromPath, openFileDialog, saveFileDialog, saveFileToPath } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'
import {
  TEMPLATE_DATE,
  type MarkdownEditorState,
  type PendingDocument,
  type UpdateMarkdownEditorState,
} from '@/tools/markdown-editor/markdown-model'

type UseMarkdownDocumentOptions = {
  state: MarkdownEditorState
  updateState: UpdateMarkdownEditorState
  isDirty: boolean
  setShowTemplates: Dispatch<SetStateAction<boolean>>
}

export function useMarkdownDocument({
  state,
  updateState,
  isDirty,
  setShowTemplates,
}: UseMarkdownDocumentOptions) {
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null)

  const applyDocument = useCallback(
    (document: PendingDocument) => {
      updateState({
        content: document.content,
        fileName: document.fileName,
        filePath: document.filePath,
        savedContent: document.savedContent,
      })
      setPendingDocument(null)
      setLastAction(document.successMessage, 'success')
    },
    [setLastAction, updateState]
  )

  const requestDocument = useCallback(
    (document: PendingDocument) => {
      if (isDirty) {
        setPendingDocument(document)
        return
      }
      applyDocument(document)
    },
    [applyDocument, isDirty]
  )

  const handleNewDocument = useCallback(() => {
    requestDocument({
      content: '',
      fileName: null,
      filePath: null,
      savedContent: '',
      successMessage: 'New document created',
    })
  }, [requestDocument])

  // The tool owns the whole drop: an image is embedded, any other file opens as a document.
  const handleDroppedTextFile = useCallback(
    (content: string, filename: string, path: string) => {
      requestDocument({
        content,
        fileName: filename,
        filePath: path,
        savedContent: content,
        successMessage: `Opened ${filename}`,
      })
    },
    [requestDocument]
  )
  const handleDropError = useCallback(
    (message: string) => setLastAction(message, 'error'),
    [setLastAction]
  )

  // ─── Open / Save ──────────────────────────────────────────────────

  const handleOpen = useCallback(async () => {
    try {
      const result = await openFileDialog()
      if (result) {
        requestDocument({
          content: result.content,
          fileName: result.filename,
          filePath: result.path,
          savedContent: result.content,
          successMessage: `Opened ${result.filename}`,
        })
      }
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [requestDocument, setLastAction])

  const handleSaveAs = useCallback(async () => {
    try {
      const path = await saveFileDialog(state.content, state.fileName ?? 'document.md')
      if (path) {
        const fileName = filenameFromPath(path)
        updateState({ filePath: path, fileName, savedContent: state.content })
        setLastAction(`Saved ${fileName}`, 'success')
      } else {
        setLastAction('Save cancelled', 'info')
      }
    } catch (err) {
      setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [state.content, state.fileName, updateState, setLastAction])

  // Shared by the File > Save menu item and the ⌘S shortcut so they cannot drift.
  const handleSave = useCallback(async () => {
    if (!state.filePath) {
      await handleSaveAs()
      return
    }
    try {
      await saveFileToPath(state.filePath, state.content)
      updateState({ savedContent: state.content })
      setLastAction(`Saved ${state.fileName ?? filenameFromPath(state.filePath)}`, 'success')
    } catch (err) {
      setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [state.filePath, state.content, state.fileName, updateState, setLastAction, handleSaveAs])

  useReloadOnFileChange({
    filePath: state.filePath,
    getContent: () => state.content,
    onReload: ({ content, filename, path }) => {
      requestDocument({
        content,
        fileName: filename,
        filePath: path,
        savedContent: content,
        successMessage: `Reloaded ${filename} from disk`,
      })
    },
  })

  useToolAction((action) => {
    if (action.type === 'open-file') {
      requestDocument({
        content: action.content,
        fileName: action.filename,
        filePath: action.path ?? null,
        savedContent: action.content,
        successMessage: `Opened ${action.filename}`,
      })
    }
    if (action.type === 'save-file') {
      void handleSave()
    }
  })

  const handleTemplateSelect = useCallback(
    (content: string) => {
      const datedContent = content.replaceAll(TEMPLATE_DATE, new Date().toISOString().slice(0, 10))
      setShowTemplates(false)
      requestDocument({
        content: datedContent,
        fileName: null,
        filePath: null,
        savedContent: '',
        successMessage: 'Template loaded',
      })
    },
    [requestDocument, setShowTemplates]
  )

  return {
    pendingDocument,
    setPendingDocument,
    applyDocument,
    handleNewDocument,
    handleDroppedTextFile,
    handleDropError,
    handleOpen,
    handleSaveAs,
    handleSave,
    handleTemplateSelect,
  }
}
