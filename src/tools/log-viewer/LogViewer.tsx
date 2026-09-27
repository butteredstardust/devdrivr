import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import type { OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditorTypes } from 'monaco-editor'
import {
  ArrowDownIcon,
  CaretDownIcon,
  CaretUpIcon,
  CopyIcon,
  FileIcon,
  MagnifyingGlassIcon,
  PauseIcon,
  PlayIcon,
  XIcon,
} from '@phosphor-icons/react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { Button } from '@/components/shared/Button'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { EmptyState } from '@/components/shared/EmptyState'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { SearchInput } from '@/components/shared/SearchInput'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useLogTail } from '@/hooks/useLogTail'
import { useMonaco } from '@/hooks/useMonaco'
import { useNativeFileDrop } from '@/hooks/useNativeFileDrop'
import { useToolAction } from '@/hooks/useToolAction'
import { useIsInstanceActive } from '@/app/tool-instance'
import { filenameFromPath, isLikelyBinaryText, pickTextFilePath } from '@/lib/file-io'
import {
  filterLog,
  findLogLevel,
  indexLog,
  isFilterActive,
  LOG_LEVELS,
  type LogFilter,
  type LogLevel,
} from '@/lib/log-levels'
import { stripAnsi, type LogEncoding } from '@/lib/log-tail'
import { appendLogText, countLineBreaks, countTextLines } from '@/lib/log-viewer'
import { formatShortcut } from '@/lib/shortcut-label'
import { decodeTextBytes } from '@/lib/text-encoding'
import { useUiStore } from '@/stores/ui.store'
import { LOG_LANGUAGE_ID, registerLogLanguage } from './log-language'

type LogEditor = MonacoEditorTypes.IStandaloneCodeEditor
type LogModel = MonacoEditorTypes.ITextModel

const ENCODING_LABELS: Record<LogEncoding, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  'windows-1252': 'Windows-1252',
}

/** The distance in pixels from the end that still counts as the end of the log. */
const END_TOLERANCE = 4
/** The part of a line that the level colouring reads. A level appears near the line start. */
const LEVEL_SEARCH_CHARACTERS = 1000

const LEVEL_LABELS: Record<LogLevel, string> = {
  error: 'Error',
  warn: 'Warn',
  info: 'Info',
  debug: 'Debug',
  trace: 'Trace',
}

const NO_FILTER: LogFilter = { query: '', regex: false, levels: [] }

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

/**
 * Colours the level word of each visible line. Monaco themes have no token colour for a log
 * level, so the colour comes from a decoration class in `index.css`.
 */
function colourLevels(editor: LogEditor): void {
  const levels = editor.createDecorationsCollection()
  let frame = 0
  const paint = () => {
    frame = 0
    const model = editor.getModel()
    if (!model) return
    const decorations: MonacoEditorTypes.IModelDeltaDecoration[] = []
    for (const range of editor.getVisibleRanges()) {
      for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
        const content = model.getLineContent(line).slice(0, LEVEL_SEARCH_CHARACTERS)
        const match = findLogLevel(content)
        if (!match) continue
        decorations.push({
          range: {
            startLineNumber: line,
            startColumn: match.start + 1,
            endLineNumber: line,
            endColumn: match.end + 1,
          },
          options: { inlineClassName: `log-level-${match.level}` },
        })
      }
    }
    levels.set(decorations)
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(paint)
  }
  editor.onDidScrollChange(schedule)
  editor.onDidChangeModelContent(schedule)
  editor.onDidChangeModel(schedule)
  editor.onDidDispose(() => cancelAnimationFrame(frame))
  schedule()
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function scrollToEnd(editor: LogEditor): void {
  editor.setScrollTop(editor.getScrollHeight())
}

/**
 * Appends `text` to the model and removes `removed` characters from its start, in one edit.
 *
 * A full `setValue` resets the scroll position and the selection. This edit keeps both, and it
 * keeps the visible lines in place when lines above them are removed.
 */
function editModel(
  editor: LogEditor,
  model: LogModel,
  text: string,
  removed: number,
  following: boolean
): void {
  const scrollTop = editor.getScrollTop()
  const cut = model.getPositionAt(removed)
  const shift = removed > 0 && !following ? editor.getTopForLineNumber(cut.lineNumber) : 0
  const end = model.getPositionAt(model.getValueLength())
  const edits = [
    {
      range: {
        startLineNumber: end.lineNumber,
        startColumn: end.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
      text,
    },
  ]
  if (removed > 0) {
    edits.push({
      range: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: cut.lineNumber,
        endColumn: cut.column,
      },
      text: '',
    })
  }
  model.applyEdits(edits)
  if (following) scrollToEnd(editor)
  else if (shift > 0) editor.setScrollTop(Math.max(0, scrollTop - shift))
}

export default function LogViewer() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  /** Starts a new read of the tail, also for a second open of the same path. */
  const [session, setSession] = useState(0)
  const [paused, setPaused] = useState(false)
  const [following, setFollowingState] = useState(true)
  const [newLines, setNewLines] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [reloadBlocked, setReloadBlocked] = useState(false)
  const [waiting, setWaiting] = useState(false)
  /** `null` until the first read of a path finishes. */
  const [encoding, setEncoding] = useState<LogEncoding | null>(null)
  const [revealToken, setRevealToken] = useState(0)
  const [filter, setFilter] = useState<LogFilter>(NO_FILTER)
  const [wordWrap, setWordWrap] = useState(monacoOptions.wordWrap === 'on')
  const editorRef = useRef<LogEditor | null>(null)
  const textRef = useRef('')
  const fileNameRef = useRef<string | null>(null)
  const followingRef = useRef(true)
  const reloadBlockedRef = useRef(false)
  const waitingRef = useRef(false)
  /** The scroll position to restore after the editor `value` replaces a filtered view. */
  const keepScrollRef = useRef<number | null>(null)
  const toggleWordWrapRef = useRef(() => {})
  const rootRef = useRef<HTMLDivElement>(null)
  const isInstanceActive = useIsInstanceActive()

  const lineCount = useMemo(() => countTextLines(content), [content])
  const logIndex = useMemo(() => indexLog(content), [content])
  // Typing in the filter must not wait for a filter of the whole log.
  const activeFilter = useDeferredValue(filter)
  const filtered = useMemo(
    () => (isFilterActive(activeFilter) ? filterLog(logIndex, activeFilter) : null),
    [activeFilter, logIndex]
  )
  const shownLines = filtered?.ok ? filtered.lineNumbers : null
  const viewText = filtered?.ok ? filtered.text : content
  /** The one-based view lines of the lines that name `error`. */
  const errorViewLines = useMemo(() => {
    if (!shownLines) return logIndex.errorLines.map((line) => line + 1)
    return shownLines.flatMap((line, index) =>
      logIndex.own[line - 1] === 'error' ? [index + 1] : []
    )
  }, [logIndex, shownLines])

  const editorOptions = useMemo(
    () => ({
      ...monacoOptions,
      readOnly: true,
      domReadOnly: true,
      renderValidationDecorations: 'off' as const,
      // The end of the log is the end of the scroll range, so "at the end" has one meaning.
      scrollBeyondLastLine: false,
      wordWrap: wordWrap ? ('on' as const) : ('off' as const),
      scrollbar: { ...monacoOptions.scrollbar, horizontal: wordWrap ? 'auto' : 'visible' } as const,
      // A filtered view shows the line numbers of the full log.
      ...(shownLines
        ? {
            lineNumbers: (line: number) => String(shownLines[line - 1] ?? ''),
            lineNumbersMinChars: Math.max(5, String(shownLines.at(-1) ?? 0).length + 1),
          }
        : {}),
    }),
    [monacoOptions, shownLines, wordWrap]
  )

  const toggleWordWrap = useCallback(() => setWordWrap((current) => !current), [])
  toggleWordWrapRef.current = toggleWordWrap

  const setFollowing = useCallback((next: boolean) => {
    followingRef.current = next
    setFollowingState(next)
    if (!next) return
    setNewLines(0)
    if (editorRef.current) scrollToEnd(editorRef.current)
  }, [])

  // A replace, and each update of a filtered view, goes through the editor `value`. The editor
  // applies it in its own effect, which runs first. Scroll after it.
  useEffect(() => {
    const editor = editorRef.current
    const keep = keepScrollRef.current
    keepScrollRef.current = null
    if (!editor) return
    if (followingRef.current) scrollToEnd(editor)
    else if (keep !== null) editor.setScrollTop(keep)
  }, [revealToken])

  /** Returns the number of characters removed from the start of the text. */
  const writeText = useCallback((kind: 'append' | 'replace', text: string): number => {
    const previous = textRef.current
    const { content: next, removed } =
      kind === 'append' ? appendLogText(previous, text) : appendLogText('', text)
    textRef.current = next
    const editor = editorRef.current
    const model = editor?.getModel()
    if (
      kind === 'append' &&
      editor &&
      model &&
      model.getValueLength() === previous.length &&
      (removed === 0 || removed < previous.length)
    ) {
      // The model now equals `next`, so the editor `value` update below changes nothing.
      editModel(editor, model, text, removed, followingRef.current)
    } else {
      // A filtered view has other text than the model, so an append replaces it. Keep the lines
      // that the user reads in place.
      keepScrollRef.current = kind === 'append' && editor ? editor.getScrollTop() : null
      setRevealToken((token) => token + 1)
    }
    setContent(next)
    return removed
  }, [])

  const resetView = useCallback(() => {
    textRef.current = ''
    setContent('')
    setTruncated(false)
    reloadBlockedRef.current = false
    setReloadBlocked(false)
    waitingRef.current = false
    setWaiting(false)
    setEncoding(null)
    setPaused(false)
    setFollowing(true)
  }, [setFollowing])

  const closeView = useCallback(() => {
    resetView()
    editorRef.current = null
    fileNameRef.current = null
    setFileName(null)
    setFilePath(null)
  }, [resetView])

  /** Opens a file that the viewer reads and tails from its path. */
  const openPath = useCallback(
    (path: string) => {
      resetView()
      const name = filenameFromPath(path)
      fileNameRef.current = name
      setFileName(name)
      setFilePath(path)
      setSession((current) => current + 1)
    },
    [resetView]
  )

  /** Opens text without a path. Nothing tails it. */
  const openContent = useCallback(
    (raw: string, name: string) => {
      // Escape sequences use control characters, which the binary check rejects.
      const text = stripAnsi(raw).replace(/\r\n?/g, '\n')
      if (isLikelyBinaryText(text)) {
        setLastAction(`Unsupported binary file: ${name}`, 'error')
        return
      }
      resetView()
      fileNameRef.current = name
      setFileName(name)
      setFilePath(null)
      const removed = writeText('replace', text)
      setTruncated(removed > 0)
      setLastAction(`Opened ${name}`, 'success')
    },
    [resetView, setLastAction, writeText]
  )

  useLogTail(filePath, session, paused, {
    onUpdate: (update, stream) => {
      const name = fileNameRef.current ?? 'log'
      if (update.kind === 'append') {
        if (writeText('append', update.text) > 0) setTruncated(true)
        // The first byte above 0x7f can change the encoding of an ASCII log.
        setEncoding(stream.encoding)
        if (!followingRef.current) setNewLines((count) => count + countLineBreaks(update.text))
        return
      }
      if (update.reason === 'open' && isLikelyBinaryText(update.text)) {
        closeView()
        setLastAction(`Unsupported binary file: ${name}`, 'error')
        return
      }
      const removed = writeText('replace', update.text)
      setTruncated(removed > 0 || stream.startsMidFile)
      setEncoding(stream.encoding)
      setNewLines(0)
      if (update.reason === 'open') setLastAction(`Opened ${name}`, 'success')
      else if (update.reason === 'rotated') setLastAction(`Log rotated: ${name}`, 'info')
      else setLastAction(`Lines arrived too fast. Showing the newest lines of ${name}`, 'info')
    },
    onWaiting: () => {
      if (waitingRef.current) return
      waitingRef.current = true
      setWaiting(true)
      setLastAction(`Update waiting for ${fileNameRef.current ?? 'log'}`, 'info')
    },
    onError: (message, first) => {
      if (first) {
        closeView()
        setLastAction(`Open failed: ${message}`, 'error')
        return
      }
      if (reloadBlockedRef.current) return
      reloadBlockedRef.current = true
      setReloadBlocked(true)
      setLastAction(`Reading ${fileNameRef.current ?? 'log'} failed: ${message}`, 'error')
    },
    onRead: () => {
      if (!reloadBlockedRef.current) return
      reloadBlockedRef.current = false
      setReloadBlocked(false)
    },
  })

  const handleOpen = useCallback(async () => {
    try {
      const path = await pickTextFilePath()
      if (path) openPath(path)
    } catch (error) {
      setLastAction(`Open failed: ${describe(error)}`, 'error')
    }
  }, [openPath, setLastAction])

  const { isDragging } = useNativeFileDrop(
    rootRef,
    {
      onPath: openPath,
      onError: (message) => setLastAction(`Open failed: ${message}`, 'error'),
    },
    isInstanceActive
  )

  const handleBrowserDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const file = event.dataTransfer.files[0]
      if (!file) return
      void file
        .arrayBuffer()
        .then((buffer) => openContent(decodeTextBytes(new Uint8Array(buffer)).content, file.name))
        .catch((error: unknown) => setLastAction(`Open failed: ${describe(error)}`, 'error'))
    },
    [openContent, setLastAction]
  )

  const handleMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor
      colourLevels(editor)
      editor.addAction({
        id: 'devdrivr.toggleWordWrap',
        label: 'Toggle Word Wrap',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
        run: () => toggleWordWrapRef.current(),
      })
      editor.onDidScrollChange((event) => {
        // A content or layout change moves the scroll position too. Only a scroll by the user
        // changes the scroll position alone.
        if (!event.scrollTopChanged || event.scrollHeightChanged) return
        const atEnd =
          event.scrollTop + editor.getLayoutInfo().height >= event.scrollHeight - END_TOLERANCE
        if (atEnd !== followingRef.current) setFollowing(atEnd)
      })
      editor.onDidContentSizeChange(() => {
        if (followingRef.current) scrollToEnd(editor)
      })
      editor.onDidLayoutChange(() => {
        if (followingRef.current) scrollToEnd(editor)
      })
      if (followingRef.current) scrollToEnd(editor)
    },
    [setFollowing]
  )

  const togglePaused = useCallback(() => {
    if (paused) {
      waitingRef.current = false
      setWaiting(false)
      setPaused(false)
      setLastAction('Live updates resumed', 'info')
      return
    }
    setPaused(true)
    setLastAction('Live updates paused', 'info')
  }, [paused, setLastAction])

  const closeLog = useCallback(() => {
    closeView()
    setLastAction('Log closed', 'info')
  }, [closeView, setLastAction])

  /** Moves the cursor to the next error line after the cursor, or the previous one before it. */
  const goToError = useCallback(
    (direction: 1 | -1) => {
      const editor = editorRef.current
      if (!editor || errorViewLines.length === 0) return
      const current = editor.getPosition()?.lineNumber ?? 0
      const target =
        direction === 1
          ? (errorViewLines.find((line) => line > current) ?? errorViewLines[0])
          : (errorViewLines.findLast((line) => line < current) ?? errorViewLines.at(-1))
      if (target === undefined) return
      setFollowing(false)
      editor.setPosition({ lineNumber: target, column: 1 })
      editor.revealLineInCenter(target)
      editor.focus()
    },
    [errorViewLines, setFollowing]
  )

  const toggleLevel = useCallback((level: LogLevel) => {
    setFilter((current) => ({
      ...current,
      levels: current.levels.includes(level)
        ? current.levels.filter((item) => item !== level)
        : [...current.levels, level],
    }))
  }, [])

  const openFind = useCallback(() => {
    const editor = editorRef.current
    editor?.focus()
    void editor?.getAction('actions.find')?.run()
  }, [])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      if (action.path) openPath(action.path)
      else openContent(action.content, action.filename)
    }
    if (action.type === 'open-file-dialog') void handleOpen()
    if (action.type === 'copy-output' && textRef.current) {
      void copy(textRef.current, { success: 'Log copied', failure: 'Copy failed' })
    }
  })

  const reading = filePath !== null && encoding === null
  const status = !fileName
    ? 'Open a text log to begin'
    : reading
      ? 'Reading…'
      : [
          shownLines
            ? `${shownLines.length.toLocaleString()} of ${plural(lineCount, 'line', 'lines')}`
            : plural(lineCount, 'line', 'lines'),
          `${content.length.toLocaleString()} characters`,
          logIndex.errorLines.length > 0
            ? plural(logIndex.errorLines.length, 'error', 'errors')
            : null,
          logIndex.warningLines.length > 0
            ? plural(logIndex.warningLines.length, 'warning', 'warnings')
            : null,
          encoding && encoding !== 'utf-8' ? ENCODING_LABELS[encoding] : null,
          waiting ? 'update waiting' : null,
          truncated ? 'showing tail' : null,
          reloadBlocked ? 'reload stopped' : null,
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <ToolLayout
      ref={rootRef}
      fullBleed
      className="relative"
      toolbar={
        <DocumentToolbar aria-label="Log viewer actions">
          <DocumentIdentity
            icon={<FileIcon size={16} aria-hidden="true" />}
            title={fileName ?? 'No log open'}
            {...(filePath ? { titleTooltip: filePath } : {})}
            {...(filePath
              ? { stateLabel: reloadBlocked ? 'Stopped' : paused ? 'Paused' : 'Live' }
              : {})}
            stateChanged={Boolean(filePath && !paused && !reloadBlocked)}
            status={status}
            statusLive={false}
          />
          <DocumentFileActions open={{ onClick: () => void handleOpen(), label: 'Open log' }} />
          <ToolbarGroup label="Live updates">
            <Button
              variant="secondary"
              size="sm"
              onClick={togglePaused}
              disabled={!filePath}
              aria-label={paused ? 'Resume live updates' : 'Pause live updates'}
            >
              {paused ? (
                <PlayIcon size={14} aria-hidden="true" />
              ) : (
                <PauseIcon size={14} aria-hidden="true" />
              )}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant={following ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFollowing(!following)}
              disabled={!fileName}
              aria-pressed={following}
            >
              <ArrowDownIcon size={14} aria-hidden="true" />
              Follow
            </Button>
          </ToolbarGroup>
          <ToolbarGroup label="Log actions" separated>
            <Button
              variant="icon"
              size="sm"
              onClick={openFind}
              disabled={!content}
              aria-label="Find in log"
            >
              <MagnifyingGlassIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              variant="icon"
              size="sm"
              onClick={() =>
                void copy(textRef.current, { success: 'Log copied', failure: 'Copy failed' })
              }
              disabled={!content}
              aria-label="Copy log"
            >
              <CopyIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              variant="icon"
              size="sm"
              onClick={closeLog}
              disabled={!fileName}
              aria-label="Close log"
            >
              <XIcon size={14} aria-hidden="true" />
            </Button>
          </ToolbarGroup>
        </DocumentToolbar>
      }
    >
      {/* tool-contract-ignore: html-drop-is-dead — retained for the remote browser harness. */}
      <div
        className="contents"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleBrowserDrop}
      >
        {fileName ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] px-3 py-1.5">
              <SearchInput
                value={filter.query}
                onValueChange={(query) => setFilter((current) => ({ ...current, query }))}
                placeholder={filter.regex ? 'Filter lines by regex' : 'Filter lines'}
                aria-label="Filter lines"
                clearLabel="Clear filter"
                className="w-56"
              />
              <Button
                variant={filter.regex ? 'primary' : 'ghost'}
                size="xs"
                onClick={() => setFilter((current) => ({ ...current, regex: !current.regex }))}
                aria-pressed={filter.regex}
                aria-label="Regular expression"
                title="Filter with a regular expression"
                className="h-6 font-mono"
              >
                .*
              </Button>
              <ToolbarGroup label="Levels" className="gap-1">
                {LOG_LEVELS.map((level) => {
                  const pressed = filter.levels.includes(level)
                  return (
                    <Button
                      key={level}
                      variant="ghost"
                      size="xs"
                      onClick={() => toggleLevel(level)}
                      aria-pressed={pressed}
                      className={
                        pressed ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''
                      }
                    >
                      {LEVEL_LABELS[level]}
                    </Button>
                  )
                })}
              </ToolbarGroup>
              {filtered && !filtered.ok && (
                <span role="alert" className="text-xs text-[var(--color-error)]">
                  Invalid regex: {filtered.error}
                </span>
              )}
              <span className="ml-auto" />
              <ToolbarGroup label="Errors" className="gap-1">
                <Button
                  variant="icon"
                  size="sm"
                  onClick={() => goToError(-1)}
                  disabled={errorViewLines.length === 0}
                  aria-label="Previous error"
                >
                  <CaretUpIcon size={14} aria-hidden="true" />
                </Button>
                <Button
                  variant="icon"
                  size="sm"
                  onClick={() => goToError(1)}
                  disabled={errorViewLines.length === 0}
                  aria-label="Next error"
                >
                  <CaretDownIcon size={14} aria-hidden="true" />
                </Button>
              </ToolbarGroup>
              <Button
                variant="ghost"
                size="xs"
                onClick={toggleWordWrap}
                aria-pressed={wordWrap}
                title={`Toggle word wrap (${formatShortcut('alt+z')})`}
              >
                Wrap: {wordWrap ? 'On' : 'Off'}
              </Button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden border-t border-[var(--color-border)]">
              <Editor
                path={filePath ?? 'log-viewer'}
                theme={monacoTheme}
                language={LOG_LANGUAGE_ID}
                beforeMount={registerLogLanguage}
                value={viewText}
                onMount={handleMount}
                options={editorOptions}
              />
              {!following && content && (
                <Button
                  variant="primary"
                  size="sm"
                  className="absolute right-6 bottom-3 z-10"
                  onClick={() => setFollowing(true)}
                >
                  <ArrowDownIcon size={14} aria-hidden="true" />
                  {newLines > 0
                    ? `Jump to end · ${newLines.toLocaleString()} new ${newLines === 1 ? 'line' : 'lines'}`
                    : 'Jump to end'}
                </Button>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            icon={FileIcon}
            title="No log open"
            description="Open or drop a text log to watch it update on disk."
            className="flex-1"
            action={
              <Button variant="primary" size="sm" onClick={() => void handleOpen()}>
                Open log
              </Button>
            }
          />
        )}
      </div>
      {isDragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-surface)]/90 text-sm font-medium text-[var(--color-text)]">
          Drop log to open
        </div>
      )}
    </ToolLayout>
  )
}
