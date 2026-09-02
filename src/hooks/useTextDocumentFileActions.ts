import { useCallback, useRef } from 'react'
import { filenameFromPath, openFileDialog, saveFileDialog, saveFileToPath } from '@/lib/file-io'
import { dispatchToolAction } from '@/lib/tool-actions'
import { useUiStore } from '@/stores/ui.store'

/**
 * Open / Save / Save As for the tools that edit one plain-text document.
 *
 * XML, JSON, YAML, Code Formatter and Refactoring Toolkit each carried their own copy of these
 * three handlers. The copies were near-identical and still managed to disagree: only Code
 * Formatter refused to write an empty document, and the "nothing to save yet" guard for the
 * toolbar action lived in a different place in every file. This is the one contract; tools that
 * need richer document semantics (CSS, HTML, Markdown) keep their local versions until those
 * semantics line up.
 *
 * Content is read through `getContent` at the moment of saving rather than passed in, because the
 * editors keep the live text in a ref — a captured value would write whatever the last render saw.
 */
export type TextDocumentFileActionsOptions = {
  getContent: () => string
  /** Path the document was last written to, or `null` if it has never been saved. */
  filePath: string | null
  /** Name shown in the toolbar; also the Save As default once a file has been opened. */
  fileName: string | null
  /** Save As default when there is no `fileName` yet. A function is re-read per save. */
  defaultFileName: string | (() => string)
  /** Persist the path and name a successful Save As established. */
  onSaved: (next: { filePath: string; fileName: string }) => void
}

export type TextDocumentFileActions = {
  handleOpen: () => Promise<void>
  handleSave: () => Promise<void>
  handleSaveAs: () => Promise<void>
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function useTextDocumentFileActions(
  options: TextDocumentFileActionsOptions
): TextDocumentFileActions {
  const setLastAction = useUiStore((s) => s.setLastAction)
  // Every handler is stable, so the toolbar buttons and the `save-file` tool action do not get a
  // new identity on each keystroke of the document they save.
  const optionsRef = useRef(options)
  optionsRef.current = options

  const handleSaveAs = useCallback(async () => {
    const { getContent, fileName, defaultFileName, onSaved } = optionsRef.current
    const content = getContent()
    if (!content.trim()) {
      setLastAction('Nothing to save yet', 'info')
      return
    }
    const suggested =
      fileName ?? (typeof defaultFileName === 'function' ? defaultFileName() : defaultFileName)
    try {
      const path = await saveFileDialog(content, suggested)
      if (!path) {
        setLastAction('Save cancelled', 'info')
        return
      }
      onSaved({ filePath: path, fileName: filenameFromPath(path) })
      setLastAction(`Saved ${path}`, 'success')
    } catch (err) {
      setLastAction(`Save failed: ${describe(err)}`, 'error')
    }
  }, [setLastAction])

  const handleSave = useCallback(async () => {
    const { getContent, filePath, fileName } = optionsRef.current
    if (!filePath) {
      await handleSaveAs()
      return
    }
    const content = getContent()
    if (!content.trim()) {
      setLastAction('Nothing to save yet', 'info')
      return
    }
    try {
      await saveFileToPath(filePath, content)
      setLastAction(`Saved ${fileName ?? filenameFromPath(filePath)}`, 'success')
    } catch (err) {
      setLastAction(`Save failed: ${describe(err)}`, 'error')
    }
  }, [handleSaveAs, setLastAction])

  const handleOpen = useCallback(async () => {
    try {
      const opened = await openFileDialog()
      // Dispatched rather than applied here: each tool decides what opening a file means for the
      // rest of its state (language detection, cleared diffs, dropped undo buffers).
      if (opened) dispatchToolAction({ type: 'open-file', ...opened })
    } catch (err) {
      setLastAction(`Open failed: ${describe(err)}`, 'error')
    }
  }, [setLastAction])

  return { handleOpen, handleSave, handleSaveAs }
}
