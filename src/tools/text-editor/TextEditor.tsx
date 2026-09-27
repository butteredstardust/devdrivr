import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OnMount } from '@monaco-editor/react'
import {
  BracketsCurlyIcon,
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
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useMonaco } from '@/hooks/useMonaco'
import { useReloadOnFileChange, type ReloadedTextFile } from '@/hooks/useReloadOnFileChange'
import { useTabDirty } from '@/hooks/useTabDirty'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolState } from '@/hooks/useToolState'
import { useWorker } from '@/hooks/useWorker'
import {
  filenameFromPath,
  openEncodedTextFileDialog,
  readEncodedTextFile,
  saveEncodedTextFile,
  saveFileDialog,
} from '@/lib/file-io'
import { MAX_EDITABLE_TEXT_FILE_BYTES } from '@/lib/file-limits'
import { formatShortcut } from '@/lib/shortcut-label'
import { textEncodingLabel, type DecodedText, type TextFileEncoding } from '@/lib/text-encoding'
import { useRecentFilesStore } from '@/stores/recent-files.store'
import { LANGUAGES as FORMATTER_LANGUAGES } from '@/tools/code-formatter/languages'
import { useUiStore } from '@/stores/ui.store'
import {
  countLines,
  detectTextEditorLanguage,
  lineEndingLabel,
  type LineEnding,
  type SelectionSummary,
} from '@/tools/text-editor/text-editor-model'
import { RecentFilesMenu } from '@/components/shared/RecentFilesMenu'
import { TextTransformMenu } from '@/tools/text-editor/TextTransformMenu'
import {
  selectedLineSpans,
  transformText,
  type LineTransform,
} from '@/tools/text-editor/text-transforms'
import { registerTomlLanguage } from '@/tools/text-editor/toml-language'
import { TextEditorStatusBar, type Indentation } from '@/tools/text-editor/TextEditorStatusBar'
import { FORMATTER_WORKER_METHODS } from '@/workers/formatter.methods'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'

type TextEditorState = {
  content: string
  savedContent: string
  fileName: string | null
  filePath: string | null
  language: string
  /** The encoding that the next save writes. */
  encoding: TextFileEncoding
  /** The encoding of the file on disk. A different `encoding` is an unsaved change. */
  savedEncoding: TextFileEncoding
  /** True after the user picks a language. Save As then keeps it instead of detecting one. */
  languageManual: boolean
  /** Wraps long lines in this tab. `null` follows Settings. */
  wordWrap: boolean | null
}

type PendingDocument = Omit<TextEditorState, 'savedEncoding' | 'languageManual' | 'wordWrap'> & {
  source: 'document' | 'disk'
  successMessage: string
}

type MonacoInstance = Parameters<OnMount>[0]
type TextModel = NonNullable<ReturnType<MonacoInstance['getModel']>>
type EditRange = Parameters<TextModel['getValueInRange']>[0]

// The languages that the Code Formatter formats. The editor uses the same worker.
const FORMATTABLE_LANGUAGES = new Set(FORMATTER_LANGUAGES.map((language) => language.id))

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const readEditableText = (path: string): Promise<DecodedText> =>
  readEncodedTextFile(path, { maxBytes: MAX_EDITABLE_TEXT_FILE_BYTES })

// The detected languages that differ from the build that saved state without `languageManual`.
const EARLIER_DETECTED_LANGUAGE: Record<string, string> = {
  toml: 'ini',
  bash: 'plaintext',
  cjs: 'plaintext',
  cts: 'plaintext',
  mjs: 'plaintext',
  mts: 'plaintext',
  pm: 'plaintext',
  tf: 'plaintext',
}

function earlierDetectedLanguage(fileName: string | null): string {
  const extension = fileName?.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined
  return extension && Object.hasOwn(EARLIER_DETECTED_LANGUAGE, extension)
    ? (EARLIER_DETECTED_LANGUAGE[extension] ?? 'plaintext')
    : detectTextEditorLanguage(fileName)
}

/**
 * Marks a restored language as manual when no detection produced it. State saved before
 * `languageManual` existed restores it as `false`. A language from the earlier detection changes
 * to the current one, so a `.toml` tab gets the TOML grammar and stays automatic. A document with
 * `false` always has the detected language, so this rule is exact for current state too.
 */
function restoreLanguageManual(state: TextEditorState): TextEditorState {
  const detected = detectTextEditorLanguage(state.fileName)
  if (state.languageManual || state.language === detected) return state
  if (state.language === earlierDetectedLanguage(state.fileName)) {
    return { ...state, language: detected }
  }
  return { ...state, languageManual: true }
}

export default function TextEditor() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const instanceKey = useToolInstance()?.stateKey ?? 'text-editor'
  const [state, updateState] = useToolState<TextEditorState>(
    'text-editor',
    {
      content: '',
      savedContent: '',
      fileName: null,
      filePath: null,
      language: 'plaintext',
      encoding: 'utf-8',
      savedEncoding: 'utf-8',
      languageManual: false,
      wordWrap: null,
    },
    { validate: restoreLanguageManual }
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const recordRecentFile = useRecentFilesStore((s) => s.record)
  const removeRecentFile = useRecentFilesStore((s) => s.remove)
  const copy = useCopyToClipboard()
  const editorRef = useRef<MonacoInstance | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  const editorSubscriptionsRef = useRef<{ dispose(): void }[]>([])
  // Discards a slow file read when the user starts another open before it finishes.
  const openRequestRef = useRef(0)
  const monacoOptionsRef = useRef(monacoOptions)
  monacoOptionsRef.current = monacoOptions
  const contentRef = useRef(state.content)
  const savedContentRef = useRef(state.savedContent)
  const encodingChangedRef = useRef(false)
  const savedEncodingRef = useRef(state.savedEncoding)
  const filePathRef = useRef(state.filePath)
  // Set after the first check of a restored file's encoding, or after a document is applied.
  const encodingCheckedRef = useRef(false)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [selection, setSelection] = useState<SelectionSummary>({ characters: 0, selections: 1 })
  // The model owns the line ending. It stays set on a document with no line break yet.
  const [modelLineEnding, setModelLineEnding] = useState<LineEnding | null>(null)
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null)
  // The model owns the indentation. Monaco detects it from the file, so Settings can differ.
  const [indentation, setIndentation] = useState<Indentation | null>(null)
  // Counts applied documents. Each change runs indentation detection on the new text.
  const [documentGeneration, setDocumentGeneration] = useState(0)
  contentRef.current = state.content
  savedContentRef.current = state.savedContent
  encodingChangedRef.current = state.encoding !== state.savedEncoding
  savedEncodingRef.current = state.savedEncoding
  filePathRef.current = state.filePath

  const isDirty = state.content !== state.savedContent || state.encoding !== state.savedEncoding
  useTabDirty(isDirty)

  // Reads refs, so an event handler sees an edit from the current keystroke.
  const hasUnsavedChanges = useCallback(
    () => contentRef.current !== savedContentRef.current || encodingChangedRef.current,
    []
  )

  const applyDocument = useCallback(
    (document: PendingDocument) => {
      contentRef.current = document.content
      savedContentRef.current = document.savedContent
      savedEncodingRef.current = document.encoding
      filePathRef.current = document.filePath
      encodingCheckedRef.current = true
      updateState({
        content: document.content,
        savedContent: document.savedContent,
        fileName: document.fileName,
        filePath: document.filePath,
        language: document.language,
        encoding: document.encoding,
        savedEncoding: document.encoding,
        languageManual: false,
      })
      encodingChangedRef.current = false
      setPendingDocument(null)
      setDocumentGeneration((generation) => generation + 1)
      setCursor({ line: 1, column: 1 })
      setLastAction(document.successMessage, 'success')
      if (document.filePath && document.source === 'document') {
        void recordRecentFile(document.filePath)
      }
    },
    [recordRecentFile, setLastAction, updateState]
  )

  const requestDocument = useCallback(
    (document: PendingDocument) => {
      if (hasUnsavedChanges()) {
        setPendingDocument(document)
        return
      }
      applyDocument(document)
    },
    [applyDocument, hasUnsavedChanges]
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
    // A slow open must not replace the new document when it finishes.
    openRequestRef.current++
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
      if (request === openRequestRef.current) {
        setLastAction(`Open failed: ${describe(error)}`, 'error')
      }
    }
  }, [openDocument, setLastAction])

  const openRecentFile = useCallback(
    async (path: string) => {
      const request = ++openRequestRef.current
      try {
        const decoded = await readEditableText(path)
        if (request === openRequestRef.current) {
          openDocument({ ...decoded, filename: filenameFromPath(path), path })
        }
      } catch (error) {
        if (request !== openRequestRef.current) return
        // A file that cannot be read now is moved, removed or out of scope. Keep the list useful.
        void removeRecentFile(path)
        setLastAction(`Open failed: ${describe(error)}. Removed it from recent files.`, 'error')
      }
    },
    [openDocument, removeRecentFile, setLastAction]
  )

  const markSaved = useCallback(
    (saved: {
      filePath: string
      fileName: string
      content: string
      encoding: TextFileEncoding
      language?: string
    }) => {
      savedContentRef.current = saved.content
      savedEncodingRef.current = saved.encoding
      filePathRef.current = saved.filePath
      encodingCheckedRef.current = true
      encodingChangedRef.current = false
      updateState({
        filePath: saved.filePath,
        fileName: saved.fileName,
        savedContent: saved.content,
        savedEncoding: saved.encoding,
        ...(saved.language ? { language: saved.language } : {}),
      })
      void recordRecentFile(saved.filePath)
    },
    [recordRecentFile, updateState]
  )

  const handleSaveAs = useCallback(async () => {
    const content = contentRef.current
    const encoding = state.encoding
    try {
      const path = await saveFileDialog(content, state.fileName ?? 'untitled.txt', encoding)
      if (!path) {
        setLastAction('Save cancelled', 'info')
        return
      }
      const fileName = filenameFromPath(path)
      // A new extension usually means a new language, unless the user already picked one.
      const language = state.languageManual ? undefined : detectTextEditorLanguage(fileName)
      markSaved({
        filePath: path,
        fileName,
        content,
        encoding,
        ...(language ? { language } : {}),
      })
      setLastAction(`Saved ${fileName}`, 'success')
    } catch (error) {
      setLastAction(`Save failed: ${describe(error)}`, 'error')
    }
  }, [markSaved, setLastAction, state.encoding, state.fileName, state.languageManual])

  const handleSave = useCallback(async () => {
    if (!state.filePath) {
      await handleSaveAs()
      return
    }
    const content = contentRef.current
    const encoding = state.encoding
    try {
      await saveEncodedTextFile(state.filePath, content, encoding)
      markSaved({
        filePath: state.filePath,
        fileName: state.fileName ?? filenameFromPath(state.filePath),
        content,
        encoding,
      })
      setLastAction(`Saved ${state.fileName ?? filenameFromPath(state.filePath)}`, 'success')
    } catch (error) {
      setLastAction(`Save failed: ${describe(error)}`, 'error')
    }
  }, [handleSaveAs, markSaved, setLastAction, state.encoding, state.fileName, state.filePath])

  useReloadOnFileChange({
    filePath: state.filePath,
    maxBytes: MAX_EDITABLE_TEXT_FILE_BYTES,
    getContent: () => contentRef.current,
    getSavedEncoding: () => savedEncodingRef.current,
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
      if (hasUnsavedChanges()) {
        setPendingDocument(document)
      } else {
        applyDocument(document)
      }
    },
  })

  const runEditorAction = useCallback((id: string) => {
    const editor = editorRef.current
    editor?.focus()
    void editor?.getAction(id)?.run()
  }, [])

  /**
   * Replaces text as one undoable edit. Each edit gives its range and new text.
   * Returns false when no text changes.
   */
  const replaceText = useCallback(
    (source: string, edits: { range: EditRange; before: string; text: string }[]): boolean => {
      const editor = editorRef.current
      const changed = edits.filter((edit) => edit.text !== edit.before)
      if (!editor || changed.length === 0) return false
      editor.pushUndoStop()
      editor.executeEdits(
        source,
        changed.map(({ range, text }) => ({ range, text, forceMoveMarkers: true }))
      )
      editor.pushUndoStop()
      editor.focus()
      return true
    },
    []
  )

  const reportTransform = useCallback(
    (label: string, changed: boolean) => {
      setLastAction(changed ? label : `${label}: nothing to change`, changed ? 'success' : 'info')
    },
    [setLastAction]
  )

  // Change the whole lines of each selection, or the whole document when nothing is selected.
  const runLineTransform = useCallback(
    (transform: LineTransform) => {
      const editor = editorRef.current
      const model = editor?.getModel()
      if (!editor || !model) return
      const eol = model.getEOL()
      const edits = selectedLineSpans(editor.getSelections() ?? [], model.getLineCount()).map(
        ({ start, end }) => {
          const range = {
            startLineNumber: start,
            startColumn: 1,
            endLineNumber: end,
            endColumn: model.getLineMaxColumn(end),
          }
          const before = model.getValueInRange(range)
          return { range, before, text: transformText(before, eol, transform) }
        }
      )
      reportTransform(transform.label, replaceText('devdrivr.lineTransform', edits))
    },
    [replaceText, reportTransform]
  )

  // Change the selected text exactly, or the whole document when nothing is selected.
  const runCaseTransform = useCallback(
    (transform: LineTransform) => {
      const editor = editorRef.current
      const model = editor?.getModel()
      if (!editor || !model) return
      const eol = model.getEOL()
      const selected = (editor.getSelections() ?? []).filter((selection) => !selection.isEmpty())
      const ranges: EditRange[] = selected.length > 0 ? selected : [model.getFullModelRange()]
      const edits = ranges.map((range) => {
        const before = model.getValueInRange(range)
        return { range, before, text: transformText(before, eol, transform) }
      })
      reportTransform(transform.label, replaceText('devdrivr.caseTransform', edits))
    },
    [replaceText, reportTransform]
  )

  const formatLanguage = FORMATTABLE_LANGUAGES.has(state.language) ? state.language : null
  // The formatter worker holds Prettier. Start it only after a formattable document appears.
  const [formatterWanted, setFormatterWanted] = useState(false)
  useEffect(() => {
    if (formatLanguage) setFormatterWanted(true)
  }, [formatLanguage])
  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    FORMATTER_WORKER_METHODS,
    formatterWanted
  )
  // Increments for each format request and on unmount. Only the newest request applies its result.
  const formatRequestRef = useRef(0)

  const handleFormat = useCallback(async () => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model || !formatter || !formatLanguage) return
    const request = ++formatRequestRef.current
    const source = model.getValue()
    const version = model.getVersionId()
    const language = model.getLanguageId()
    const { insertSpaces, tabSize } = model.getOptions()
    // A result must never replace a newer document, edits, language or indentation.
    const isCurrent = () => {
      if (editorRef.current?.getModel() !== model || model.isDisposed()) return false
      const options = model.getOptions()
      return (
        model.getVersionId() === version &&
        model.getLanguageId() === language &&
        options.insertSpaces === insertSpaces &&
        options.tabSize === tabSize
      )
    }
    try {
      // Prettier defaults, because a document here has no project configuration.
      const formatted = await formatter.format(source, {
        language: formatLanguage,
        tabWidth: tabSize,
        useTabs: !insertSpaces,
        singleQuote: false,
        semi: true,
        trailingComma: 'all',
      })
      if (formatRequestRef.current !== request) return
      if (!isCurrent()) {
        setLastAction('Format skipped: the document changed', 'info')
        return
      }
      const text = formatted.replace(/\r?\n/g, model.getEOL())
      const changed = replaceText('devdrivr.format', [
        { range: model.getFullModelRange(), before: source, text },
      ])
      setLastAction(changed ? 'Formatted' : 'Already formatted', changed ? 'success' : 'info')
    } catch (error) {
      // A newer request or unmount supersedes this one, and its error means nothing now.
      if (formatRequestRef.current !== request) return
      setLastAction(`Format failed: ${describe(error)}`, 'error')
    }
  }, [formatLanguage, formatter, replaceText, setLastAction])
  const handleFormatRef = useRef(handleFormat)
  handleFormatRef.current = handleFormat

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

  const wordWrap = state.wordWrap ?? monacoOptions.wordWrap === 'on'
  const wordWrapRef = useRef(wordWrap)
  wordWrapRef.current = wordWrap
  const toggleWordWrap = useCallback(() => {
    updateState({ wordWrap: !wordWrapRef.current })
  }, [updateState])
  const toggleWordWrapRef = useRef(toggleWordWrap)
  toggleWordWrapRef.current = toggleWordWrap

  const editorOptions = useMemo(
    () => ({
      ...monacoOptions,
      renderValidationDecorations: 'on' as const,
      wordWrap: wordWrap ? ('on' as const) : ('off' as const),
      // Pin the horizontal scrollbar when lines do not wrap. Monaco hides it until a scroll.
      scrollbar: { ...monacoOptions.scrollbar, horizontal: wordWrap ? 'auto' : 'visible' } as const,
    }),
    [monacoOptions, wordWrap]
  )
  const lineCount = useMemo(() => countLines(state.content), [state.content])
  const shownIndentation = indentation ?? {
    insertSpaces: monacoOptions.insertSpaces,
    tabSize: monacoOptions.tabSize,
  }
  const lineEnding = modelLineEnding ?? lineEndingLabel(state.content)

  const changeIndentation = useCallback((next: Indentation) => {
    editorRef.current?.getModel()?.updateOptions(next)
  }, [])

  const detectIndentation = useCallback(() => {
    const options = monacoOptionsRef.current
    editorRef.current?.getModel()?.detectIndentation(options.insertSpaces, options.tabSize)
  }, [])

  // `pushEOL` rewrites every line break as one undoable edit. The change event updates content.
  const changeLineEnding = useCallback((next: LineEnding) => {
    const model = editorRef.current?.getModel()
    const monaco = monacoRef.current
    if (!model || !monaco) return
    const { LF, CRLF } = monaco.editor.EndOfLineSequence
    model.pushEOL(next === 'CRLF' ? CRLF : LF)
  }, [])

  // `model.setValue` keeps the previous document's indentation. Detect it again for the new text.
  // The editor's own effect has already pushed the new value, because child effects run first.
  useEffect(() => {
    if (documentGeneration === 0) return
    const model = editorRef.current?.getModel()
    if (!model || model.getValue() !== contentRef.current) return
    const options = monacoOptionsRef.current
    model.detectIndentation(options.insertSpaces, options.tabSize)
  }, [documentGeneration])

  // State saved before encodings were tracked restores as UTF-8. A file with a BOM or in UTF-16
  // would then save back without its original encoding. Read the file once to find it.
  useEffect(() => {
    const filePath = state.filePath
    if (encodingCheckedRef.current || !filePath) return
    encodingCheckedRef.current = true
    if (state.encoding !== 'utf-8' || state.savedEncoding !== 'utf-8') return
    readEditableText(filePath)
      .then((decoded) => {
        if (decoded.encoding === 'utf-8' || filePathRef.current !== filePath) return
        // Adopt the disk encoding only when the editor still holds the disk content.
        if (hasUnsavedChanges() || decoded.content !== contentRef.current) return
        savedEncodingRef.current = decoded.encoding
        updateState({ encoding: decoded.encoding, savedEncoding: decoded.encoding })
      })
      .catch(() => {
        // The file watcher reports a missing or unreadable file.
      })
  }, [hasUnsavedChanges, state.encoding, state.filePath, state.savedEncoding, updateState])

  useEffect(
    () => () => {
      // A file read or format that finishes after unmount must not change anything.
      openRequestRef.current++
      formatRequestRef.current++
      editorSubscriptionsRef.current.forEach((subscription) => subscription.dispose())
      editorSubscriptionsRef.current = []
    },
    []
  )

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    editorSubscriptionsRef.current.forEach((subscription) => subscription.dispose())
    const updateCursor = () => {
      const position = editor.getPosition()
      if (position) setCursor({ line: position.lineNumber, column: position.column })
    }
    const updateSelection = () => {
      const model = editor.getModel()
      const selections = editor.getSelections() ?? []
      const characters = model
        ? selections.reduce((sum, range) => sum + model.getValueLengthInRange(range), 0)
        : 0
      setSelection({ characters, selections: Math.max(1, selections.length) })
    }
    let modelSubscriptions: { dispose(): void }[] = []
    const watchModel = () => {
      modelSubscriptions.forEach((subscription) => subscription.dispose())
      modelSubscriptions = []
      const model = editor.getModel()
      if (!model) return
      const syncIndentation = () => {
        const { insertSpaces, tabSize } = model.getOptions()
        setIndentation({ insertSpaces, tabSize })
      }
      const syncLineEnding = () => setModelLineEnding(model.getEOL() === '\r\n' ? 'CRLF' : 'LF')
      syncIndentation()
      syncLineEnding()
      modelSubscriptions = [
        model.onDidChangeOptions(syncIndentation),
        model.onDidChangeContent(syncLineEnding),
      ]
    }
    updateCursor()
    updateSelection()
    watchModel()
    editorSubscriptionsRef.current = [
      editor.addAction({
        id: 'devdrivr.toggleWordWrap',
        label: 'Toggle Word Wrap',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
        run: () => toggleWordWrapRef.current(),
      }),
      editor.addAction({
        id: 'devdrivr.formatDocument',
        label: 'Format Document',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        run: () => handleFormatRef.current(),
      }),
      editor.onDidChangeCursorPosition(updateCursor),
      editor.onDidChangeCursorSelection(updateSelection),
      editor.onDidChangeModel(watchModel),
      { dispose: () => modelSubscriptions.forEach((subscription) => subscription.dispose()) },
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
          <RecentFilesMenu
            store={useRecentFilesStore}
            onOpen={(path) => void openRecentFile(path)}
          />
          <ToolbarGroup label="Edit" separated>
            <Button
              variant="icon"
              size="sm"
              onClick={() => void handleFormat()}
              disabled={!formatLanguage || !formatter}
              aria-label="Format document"
              title={
                formatLanguage
                  ? `Format document (${formatShortcut('shift+alt+f')})`
                  : 'Format document: not available for this language'
              }
            >
              <BracketsCurlyIcon size={14} aria-hidden="true" />
            </Button>
            <TextTransformMenu
              onLineTransform={runLineTransform}
              onCaseTransform={runCaseTransform}
            />
          </ToolbarGroup>
          <ToolbarGroup label="Search and copy" separated>
            <Button
              variant="icon"
              size="sm"
              onClick={() => runEditorAction('actions.find')}
              aria-label="Find"
            >
              <MagnifyingGlassIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              variant="icon"
              size="sm"
              onClick={() => runEditorAction('editor.action.startFindReplaceAction')}
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
          beforeMount={registerTomlLanguage}
          onMount={handleMount}
          options={editorOptions}
        />
      </div>
      <TextEditorStatusBar
        cursor={cursor}
        selection={selection}
        onGoToLine={() => runEditorAction('editor.action.gotoLine')}
        wordWrap={wordWrap}
        onToggleWordWrap={toggleWordWrap}
        indentation={shownIndentation}
        onIndentationChange={changeIndentation}
        onConvertIndentation={(to) =>
          runEditorAction(
            to === 'spaces'
              ? 'editor.action.indentationToSpaces'
              : 'editor.action.indentationToTabs'
          )
        }
        onDetectIndentation={detectIndentation}
        lineEnding={lineEnding}
        onLineEndingChange={changeLineEnding}
        encoding={state.encoding}
        onEncodingChange={(encoding) => updateState({ encoding })}
        language={state.language}
        onLanguageChange={(language) => updateState({ language, languageManual: true })}
      />

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
