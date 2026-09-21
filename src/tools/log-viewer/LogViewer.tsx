import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { OnMount } from '@monaco-editor/react'
import {
  ArrowDownIcon,
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
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useMonaco } from '@/hooks/useMonaco'
import { useNativeFileDrop } from '@/hooks/useNativeFileDrop'
import { useReloadOnFileChange, type ReloadedTextFile } from '@/hooks/useReloadOnFileChange'
import { useToolAction } from '@/hooks/useToolAction'
import { useIsInstanceActive } from '@/app/tool-instance'
import { isLikelyBinaryText, openFileDialog } from '@/lib/file-io'
import {
  countTextLines,
  logFileLimitMessage,
  MAX_LOG_FILE_BYTES,
  prepareLogContent,
} from '@/lib/log-viewer'
import { useUiStore } from '@/stores/ui.store'

type OpenedLog = Omit<ReloadedTextFile, 'path'> & { path: string | null }

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function LogViewer() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [followTail, setFollowTail] = useState(true)
  const [truncated, setTruncated] = useState(false)
  const [reloadBlocked, setReloadBlocked] = useState(false)
  const [pendingReload, setPendingReload] = useState<OpenedLog | null>(null)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const contentRef = useRef(content)
  const pausedRef = useRef(paused)
  const pendingReloadRef = useRef(pendingReload)
  const rootRef = useRef<HTMLDivElement>(null)
  const isInstanceActive = useIsInstanceActive()
  contentRef.current = content
  pausedRef.current = paused
  pendingReloadRef.current = pendingReload

  const lineCount = useMemo(() => countTextLines(content), [content])
  const editorOptions = useMemo(
    () => ({
      ...monacoOptions,
      readOnly: true,
      domReadOnly: true,
      renderValidationDecorations: 'off' as const,
    }),
    [monacoOptions]
  )

  const scrollToEnd = useCallback(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model) return
    editor.revealLine(model.getLineCount())
  }, [])

  useEffect(() => {
    if (!followTail || !content) return
    if (typeof requestAnimationFrame === 'undefined') {
      scrollToEnd()
      return
    }
    const frame = requestAnimationFrame(scrollToEnd)
    return () => cancelAnimationFrame(frame)
  }, [content, followTail, scrollToEnd])

  const applyLog = useCallback(
    (file: OpenedLog, message: string) => {
      const prepared = prepareLogContent(file.content)
      setContent(prepared.content)
      setTruncated(prepared.truncated)
      setFileName(file.filename)
      setFilePath(file.path)
      setReloadBlocked(false)
      pendingReloadRef.current = null
      setPendingReload(null)
      setLastAction(message, 'success')
    },
    [setLastAction]
  )

  const openLog = useCallback(
    (file: OpenedLog) => {
      setPaused(false)
      setFollowTail(true)
      applyLog(file, `Opened ${file.filename}`)
    },
    [applyLog]
  )

  const handleOpen = useCallback(async () => {
    try {
      const file = await openFileDialog({ maxBytes: MAX_LOG_FILE_BYTES })
      if (file) openLog({ content: file.content, filename: file.filename, path: file.path })
    } catch (error) {
      setLastAction(`Open failed: ${describe(error)}`, 'error')
    }
  }, [openLog, setLastAction])

  const openDroppedFile = useCallback(
    async (file: File, path: string | null) => {
      try {
        if (file.size > MAX_LOG_FILE_BYTES) {
          setLastAction(logFileLimitMessage(), 'error')
          return
        }
        const text = await file.text()
        if (isLikelyBinaryText(text)) {
          setLastAction(`Unsupported binary file: ${file.name}`, 'error')
          return
        }
        openLog({ content: text, filename: file.name, path })
      } catch (error) {
        setLastAction(`Open failed: ${describe(error)}`, 'error')
      }
    },
    [openLog, setLastAction]
  )

  const { isDragging } = useNativeFileDrop(
    rootRef,
    {
      onFile: (file, path) => void openDroppedFile(file, path),
      onError: (message) => setLastAction(`Open failed: ${message}`, 'error'),
      maxBytes: MAX_LOG_FILE_BYTES,
      onTooLarge: () => setLastAction(logFileLimitMessage(), 'error'),
    },
    isInstanceActive
  )

  const handleBrowserDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const file = event.dataTransfer.files[0]
      if (file) void openDroppedFile(file, null)
    },
    [openDroppedFile]
  )

  useReloadOnFileChange({
    filePath,
    maxBytes: MAX_LOG_FILE_BYTES,
    // While paused, compare the disk with the newest queued snapshot rather than the older text
    // still on screen. If the file changes twice (or reverts), Resume must apply the true latest.
    getContent: () => pendingReloadRef.current?.content ?? contentRef.current,
    onReload: (file) => {
      if (pausedRef.current) {
        pendingReloadRef.current = file
        setPendingReload(file)
        setLastAction(`Update waiting for ${file.filename}`, 'info')
        return
      }
      applyLog(file, `Reloaded ${file.filename} from disk`)
    },
    onError: () => setReloadBlocked(true),
  })

  const togglePaused = useCallback(() => {
    if (paused) {
      setPaused(false)
      if (pendingReload) {
        applyLog(pendingReload, `Reloaded ${pendingReload.filename} from disk`)
      } else {
        setLastAction('Live updates resumed', 'info')
      }
      return
    }
    setPaused(true)
    setLastAction('Live updates paused', 'info')
  }, [applyLog, paused, pendingReload, setLastAction])

  const closeLog = useCallback(() => {
    setContent('')
    setFileName(null)
    setFilePath(null)
    setTruncated(false)
    setReloadBlocked(false)
    setPaused(false)
    pendingReloadRef.current = null
    setPendingReload(null)
    setLastAction('Log closed', 'info')
  }, [setLastAction])

  const openFind = useCallback(() => {
    const editor = editorRef.current
    editor?.focus()
    void editor?.getAction('actions.find')?.run()
  }, [])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      openLog({
        content: action.content,
        filename: action.filename,
        path: action.path ?? null,
      })
    }
    if (action.type === 'open-file-dialog') void handleOpen()
    if (action.type === 'copy-output' && contentRef.current) {
      void copy(contentRef.current, { success: 'Log copied', failure: 'Copy failed' })
    }
  })

  const status = fileName
    ? `${lineCount.toLocaleString()} lines · ${content.length.toLocaleString()} characters${
        pendingReload ? ' · update waiting' : ''
      }${truncated ? ' · showing tail' : ''}${reloadBlocked ? ' · reload stopped' : ''}`
    : 'Open a text log to begin'

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
              variant={followTail ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFollowTail((current) => !current)}
              disabled={!filePath}
              aria-pressed={followTail}
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
              onClick={() => void copy(content, { success: 'Log copied', failure: 'Copy failed' })}
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
          <div className="min-h-0 flex-1 overflow-hidden border-t border-[var(--color-border)]">
            <Editor
              path={filePath ?? 'log-viewer'}
              theme={monacoTheme}
              language="plaintext"
              value={content}
              onMount={(editor) => {
                editorRef.current = editor
                if (!followTail) return
                if (typeof requestAnimationFrame === 'undefined') scrollToEnd()
                else requestAnimationFrame(scrollToEnd)
              }}
              options={editorOptions}
            />
          </div>
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
