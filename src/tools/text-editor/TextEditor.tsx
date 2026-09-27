import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OnMount } from '@monaco-editor/react'
import {
  CopyIcon,
  FileTextIcon,
  MagnifyingGlassIcon,
  MagnifyingGlassPlusIcon,
} from '@phosphor-icons/react'
import { useToolInstance } from '@/app/tool-instance'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { Select } from '@/components/shared/Select'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useMonaco } from '@/hooks/useMonaco'
import { useReloadOnFileChange, type ReloadedTextFile } from '@/hooks/useReloadOnFileChange'
import { useTabDirty } from '@/hooks/useTabDirty'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolState } from '@/hooks/useToolState'
import {
  filenameFromPath,
  openEncodedTextFileDialog,
  readEncodedTextFile,
  saveEncodedTextFile,
  saveFileDialog,
} from '@/lib/file-io'
import { MAX_EDITABLE_TEXT_FILE_BYTES } from '@/lib/file-limits'
import { textEncodingLabel, type DecodedText, type TextFileEncoding } from '@/lib/text-encoding'
import { useUiStore } from '@/stores/ui.store'
import {
  countLines,
  detectTextEditorLanguage,
  lineEndingLabel,
  TEXT_EDITOR_LANGUAGES,
} from '@/tools/text-editor/text-editor-model'

type TextEditorState = {
  content: string
  savedContent: string
  fileName: string | null
  filePath: string | null
  language: string
  /** The encoding the file had on disk. Save writes the same encoding back. */
  encoding: TextFileEncoding
}

type PendingDocument = TextEditorState & {
  source: 'document' | 'disk'
  successMessage: string
}

type Indentation = { insertSpaces: boolean; tabSize: number }

type MonacoInstance = Parameters<OnMount>[0]

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const readEditableText = (path: string): Promise<DecodedText> =>
  readEncodedTextFile(path, { maxBytes: MAX_EDITABLE_TEXT_FILE_BYTES })

export default function TextEditor() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const instanceKey = useToolInstance()?.stateKey ?? 'text-editor'
  const [state, updateState] = useToolState<TextEditorState>('text-editor', {
    content: '',
    savedContent: '',
    fileName: null,
    filePath: null,
    language: 'plaintext',
    encoding: 'utf-8',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const editorRef = useRef<MonacoInstance | null>(null)
  const editorSubscriptionsRef = useRef<{ dispose(): void }[]>([])
  // Discards a slow file read when the user starts another open before it finishes.
  const openRequestRef = useRef(0)
  const monacoOptionsRef = useRef(monacoOptions)
  monacoOptionsRef.current = monacoOptions
  const contentRef = useRef(state.content)
  const savedContentRef = useRef(state.savedContent)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null)
  // The model owns the indentation. Monaco detects it from the file, so Settings can differ.
  const [indentation, setIndentation] = useState<Indentation | null>(null)
  // Counts applied documents. Each change runs indentation detection on the new text.
  const [documentGeneration, setDocumentGeneration] = useState(0)
  contentRef.current = state.content
  savedContentRef.current = state.savedContent

  const isDirty = state.content !== state.savedContent
  useTabDirty(isDirty)

  const applyDocument = useCallback(
    (document: PendingDocument) => {
      contentRef.current = document.content
      savedContentRef.current = document.savedContent
      updateState({
        content: document.content,
        savedContent: document.savedContent,
        fileName: document.fileName,
        filePath: document.filePath,
        language: document.language,
        encoding: document.encoding,
      })
      setPendingDocument(null)
      setDocumentGeneration((generation) => generation + 1)
      setCursor({ line: 1, column: 1 })
      setLastAction(document.successMessage, 'success')
    },
    [setLastAction, updateState]
  )

  const requestDocument = useCallback(
    (document: PendingDocument) => {
      if (contentRef.current !== savedContentRef.current) {
        setPendingDocument(document)
        return
      }
      applyDocument(document)
    },
    [applyDocument]
  )

  const openDocument = useCallback(
    (file: { content: string; filename: string; path?: string; encoding: TextFileEncoding }) => {
      const encodingNote =
        file.encoding === 'utf-8' ? '' : ` as ${textEncodingLabel(file.encoding)}`
      requestDocument({
        content: file.content,
        savedContent: file.content,
        fileName: file.filename,
        filePath: file.path ?? null,
        language: detectTextEditorLanguage(file.filename),
        encoding: file.encoding,
        source: 'document',
        successMessage: `Opened ${file.filename}${encodingNote}`,
      })
    },
    [requestDocument]
  )

  // The shell reads files as lossy UTF-8. Read the file again to keep its exact bytes.
  const openShellFile = useCallback(
    async (file: { content: string; filename: string; path?: string }) => {
      const request = ++openRequestRef.current
      if (!file.path) {
        openDocument({ ...file, encoding: 'utf-8' })
        return
      }
      try {
        const decoded = await readEditableText(file.path)
        if (request === openRequestRef.current) openDocument({ ...file, ...decoded })
      } catch (error) {
        if (request === openRequestRef.current) {
          setLastAction(`Open failed: ${describe(error)}`, 'error')
        }
      }
    },
    [openDocument, setLastAction]
  )

  const handleNew = useCallback(() => {
    requestDocument({
      content: '',
      savedContent: '',
      fileName: null,
      filePath: null,
      language: 'plaintext',
      encoding: 'utf-8',
      source: 'document',
      successMessage: 'New text document created',
    })
  }, [requestDocument])

  const handleOpen = useCallback(async () => {
    const request = ++openRequestRef.current
    try {
      const file = await openEncodedTextFileDialog({ maxBytes: MAX_EDITABLE_TEXT_FILE_BYTES })
      if (file && request === openRequestRef.current) openDocument(file)
    } catch (error) {
      setLastAction(`Open failed: ${describe(error)}`, 'error')
    }
  }, [openDocument, setLastAction])

  const markSaved = useCallback(
    (filePath: string, fileName: string, content: string) => {
      savedContentRef.current = content
      updateState({ filePath, fileName, savedContent: content })
    },
    [updateState]
  )

  const handleSaveAs = useCallback(async () => {
    const content = contentRef.current
    try {
      const path = await saveFileDialog(content, state.fileName ?? 'untitled.txt', state.encoding)
      if (!path) {
        setLastAction('Save cancelled', 'info')
        return
      }
      const fileName = filenameFromPath(path)
      markSaved(path, fileName, content)
      setLastAction(`Saved ${fileName}`, 'success')
    } catch (error) {
      setLastAction(`Save failed: ${describe(error)}`, 'error')
    }
  }, [markSaved, setLastAction, state.encoding, state.fileName])

  const handleSave = useCallback(async () => {
    if (!state.filePath) {
      await handleSaveAs()
      return
    }
    const content = contentRef.current
    try {
      await saveEncodedTextFile(state.filePath, content, state.encoding)
      markSaved(state.filePath, state.fileName ?? filenameFromPath(state.filePath), content)
      setLastAction(`Saved ${state.fileName ?? filenameFromPath(state.filePath)}`, 'success')
    } catch (error) {
      setLastAction(`Save failed: ${describe(error)}`, 'error')
    }
  }, [handleSaveAs, markSaved, setLastAction, state.encoding, state.fileName, state.filePath])

  useReloadOnFileChange({
    filePath: state.filePath,
    maxBytes: MAX_EDITABLE_TEXT_FILE_BYTES,
    getContent: () => contentRef.current,
    readText: readEditableText,
    onReload: (file: ReloadedTextFile) => {
      const document: PendingDocument = {
        content: file.content,
        savedContent: file.content,
        fileName: file.filename,
        filePath: file.path,
        language: detectTextEditorLanguage(file.filename),
        encoding: file.encoding ?? 'utf-8',
        source: 'disk',
        successMessage: `Reloaded ${file.filename} from disk`,
      }
      if (contentRef.current !== savedContentRef.current) {
        setPendingDocument(document)
      } else {
        applyDocument(document)
      }
    },
  })

  const openFind = useCallback((replace: boolean) => {
    const editor = editorRef.current
    editor?.focus()
    void editor?.getAction(replace ? 'editor.action.startFindReplaceAction' : 'actions.find')?.run()
  }, [])

  useToolAction((action) => {
    if (action.type === 'open-file') void openShellFile(action)
    if (action.type === 'save-file') void handleSave()
    if (action.type === 'copy-output') {
      void copy(contentRef.current, {
        success: 'Document copied',
        failure: 'Copy failed',
      })
    }
  })

  const editorOptions = useMemo(
    () => ({
      ...monacoOptions,
      renderValidationDecorations: 'on' as const,
    }),
    [monacoOptions]
  )
  const lineCount = useMemo(() => countLines(state.content), [state.content])
  const shownIndentation = indentation ?? {
    insertSpaces: monacoOptions.insertSpaces,
    tabSize: monacoOptions.tabSize,
  }
  const indentationLabel = `${shownIndentation.insertSpaces ? 'Spaces' : 'Tab Size'}: ${shownIndentation.tabSize}`

  // `model.setValue` keeps the previous document's indentation. Detect it again for the new text.
  // The editor's own effect has already pushed the new value, because child effects run first.
  useEffect(() => {
    if (documentGeneration === 0) return
    const model = editorRef.current?.getModel()
    if (!model || model.getValue() !== contentRef.current) return
    const options = monacoOptionsRef.current
    model.detectIndentation(options.insertSpaces, options.tabSize)
  }, [documentGeneration])

  useEffect(
    () => () => {
      editorSubscriptionsRef.current.forEach((subscription) => subscription.dispose())
      editorSubscriptionsRef.current = []
    },
    []
  )

  const handleMount = useCallback((editor: MonacoInstance) => {
    editorRef.current = editor
    editorSubscriptionsRef.current.forEach((subscription) => subscription.dispose())
    const updateCursor = () => {
      const position = editor.getPosition()
      if (position) setCursor({ line: position.lineNumber, column: position.column })
    }
    let modelOptions: { dispose(): void } | undefined
    const watchModel = () => {
      modelOptions?.dispose()
      const model = editor.getModel()
      if (!model) return
      const syncIndentation = () => {
        const { insertSpaces, tabSize } = model.getOptions()
        setIndentation({ insertSpaces, tabSize })
      }
      syncIndentation()
      modelOptions = model.onDidChangeOptions(syncIndentation)
    }
    updateCursor()
    watchModel()
    editorSubscriptionsRef.current = [
      editor.onDidChangeCursorPosition(updateCursor),
      editor.onDidChangeModel(watchModel),
      { dispose: () => modelOptions?.dispose() },
    ]
  }, [])

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <DocumentToolbar aria-label="Text editor actions">
          <DocumentIdentity
            icon={<FileTextIcon size={16} aria-hidden="true" />}
            title={state.fileName ?? 'Untitled.txt'}
            {...(state.filePath ? { titleTooltip: state.filePath } : {})}
            stateLabel={isDirty ? 'Unsaved' : 'Saved'}
            stateChanged={isDirty}
            status={`${lineCount.toLocaleString()} lines · ${state.content.length.toLocaleString()} characters`}
            statusLive={false}
          />
          <DocumentFileActions
            newDocument={{ onClick: handleNew, label: 'New document' }}
            open={{ onClick: () => void handleOpen(), label: 'Open file' }}
            save={{ onClick: () => void handleSave(), label: 'Save file' }}
            saveAs={{ onClick: () => void handleSaveAs(), label: 'Save file as' }}
          />
          <ToolbarGroup label="Language">
            <Select
              aria-label="Language"
              value={state.language}
              onChange={(event) => updateState({ language: event.target.value })}
            >
              {TEXT_EDITOR_LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.label}
                </option>
              ))}
            </Select>
          </ToolbarGroup>
          <ToolbarGroup label="Search and copy" separated>
            <Button variant="icon" size="sm" onClick={() => openFind(false)} aria-label="Find">
              <MagnifyingGlassIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              variant="icon"
              size="sm"
              onClick={() => openFind(true)}
              aria-label="Find and replace"
            >
              <MagnifyingGlassPlusIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              variant="icon"
              size="sm"
              onClick={() =>
                void copy(contentRef.current, {
                  success: 'Document copied',
                  failure: 'Copy failed',
                })
              }
              aria-label="Copy document"
            >
              <CopyIcon size={14} aria-hidden="true" />
            </Button>
          </ToolbarGroup>
        </DocumentToolbar>
      }
    >
      <div className="min-h-0 flex-1 overflow-hidden border-t border-[var(--color-border)]">
        <Editor
          path={instanceKey}
          theme={monacoTheme}
          language={state.language}
          value={state.content}
          onChange={(value) => {
            const content = value ?? ''
            contentRef.current = content
            updateState({ content })
          }}
          onMount={handleMount}
          options={editorOptions}
        />
      </div>
      <footer className="flex min-h-7 shrink-0 items-center gap-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-2xs text-[var(--color-text-muted)]">
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span>{indentationLabel}</span>
        <span>{lineEndingLabel(state.content)}</span>
        <span>{textEncodingLabel(state.encoding)}</span>
        <span className="ml-auto">
          {TEXT_EDITOR_LANGUAGES.find((language) => language.id === state.language)?.label ??
            state.language}
        </span>
      </footer>

      {pendingDocument && (
        <Dialog
          title={
            pendingDocument.source === 'disk' ? 'File changed on disk' : 'Replace unsaved changes?'
          }
          onClose={() => setPendingDocument(null)}
          size="md"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPendingDocument(null)}>
                Keep editing
              </Button>
              <Button type="button" variant="danger" onClick={() => applyDocument(pendingDocument)}>
                {pendingDocument.source === 'disk' ? 'Reload from disk' : 'Discard changes'}
              </Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            {pendingDocument.source === 'disk'
              ? 'The file changed outside devdrivr. Reloading will replace your unsaved edits.'
              : 'Your current document has changes that have not been saved. Continuing will replace them.'}
          </p>
        </Dialog>
      )}
    </ToolLayout>
  )
}
