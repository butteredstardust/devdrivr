import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  ArrowRightIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FilePlusIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  GraphIcon,
} from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolHistory } from '@/hooks/useToolHistory'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Select } from '@/components/shared/Select'
import { Toolbar } from '@/components/shared/Toolbar'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Toggle } from '@/components/shared/Toggle'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { getEffectiveTheme, isLightEffectiveTheme } from '@/lib/theme'
import {
  exportFile,
  filenameFromPath,
  openFileDialog,
  saveFileDialog,
  saveFileToPath,
} from '@/lib/file-io'
import MermaidPreview from './MermaidPreview'
import {
  TEMPLATES,
  countStatements,
  detectDiagramType,
  exportFileName,
  parseMermaidError,
  svgSize,
  svgWithExplicitSize,
  templateById,
  withSourceLine,
  type MermaidError,
} from './mermaid-helpers'

type EditorMode = 'edit' | 'split' | 'preview'
type ExportFormat = 'svg' | 'png'

type MermaidEditorState = {
  content: string
  fileName: string | null
  filePath: string | null
  /** What is on disk (or what was loaded), so "Modified" means something. */
  savedContent: string
  mode: EditorMode
  templateId: string
  exportFormat: ExportFormat
  exportScale: number
  transparentBackground: boolean
}

/** A buffer swap that would discard unsaved work — held until confirmed. */
type PendingDocument = {
  content: string
  fileName: string | null
  filePath: string | null
  savedContent: string
  successMessage: string
}

const MODE_OPTIONS: { value: EditorMode; label: string }[] = [
  { value: 'edit', label: 'Edit' },
  { value: 'split', label: 'Split' },
  { value: 'preview', label: 'Preview' },
]

const EXPORT_SCALES = [1, 2, 3, 4]
const DEFAULT_TEMPLATE = TEMPLATES[0]?.content ?? ''
const RENDER_DEBOUNCE_MS = 500

let initializedMermaidTheme: 'default' | 'dark' | null = null

async function getMermaid(theme: 'default' | 'dark') {
  const { default: mermaid } = await import('mermaid')
  if (initializedMermaidTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      theme,
      // HTML labels live in a `<foreignObject>`, which WebKit refuses to
      // rasterise from an SVG data URL — every PNG export of a flowchart or
      // class diagram came out with blank nodes.
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
    })
    initializedMermaidTheme = theme
  }
  return mermaid
}

/**
 * Deletes the scratch nodes `mermaid.render` leaves in `<body>`.
 *
 * Mermaid appends `div#d<id>` (plus `iframe#i<id>` when sandboxed) to measure
 * text, and removes it only on the success path — the parse-error branch throws
 * first. Since each render uses a fresh id, its own `removeExistingElements`
 * never catches them either, so a debounced editor leaks one subtree per
 * keystroke that fails to parse.
 */
function removeMermaidScratchNodes(renderId: string) {
  for (const id of [`d${renderId}`, `i${renderId}`]) {
    document.getElementById(id)?.remove()
  }
}

export default function MermaidEditor() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const appTheme = useSettingsStore((s) => s.theme)
  const mermaidTheme = isLightEffectiveTheme(getEffectiveTheme(appTheme)) ? 'default' : 'dark'
  const setLastAction = useUiStore((s) => s.setLastAction)
  const { record } = useToolHistory({ toolId: 'mermaid-editor' })

  const [state, updateState] = useToolState<MermaidEditorState>('mermaid-editor', {
    content: DEFAULT_TEMPLATE,
    fileName: null,
    filePath: null,
    savedContent: DEFAULT_TEMPLATE,
    mode: 'split',
    templateId: TEMPLATES[0]?.id ?? 'flowchart',
    exportFormat: 'svg',
    exportScale: 2,
    transparentBackground: false,
  })

  const [svgHtml, setSvgHtml] = useState('')
  const [error, setError] = useState<MermaidError | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renderSeqRef = useRef(0)
  /** Render ids whose scratch nodes may still be in `<body>`. */
  const scratchIdsRef = useRef(new Set<string>())
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  // `useToolState` hydrates asynchronously, so a render triggered by restored
  // state is indistinguishable from one the user caused — except by this flag,
  // which only typing and explicit buffer swaps set.
  const userEditedRef = useRef(false)

  const mode = state.mode ?? 'split'
  const showEditor = mode === 'edit' || mode === 'split'
  const showPreview = mode === 'preview' || mode === 'split'
  const content = state.content ?? ''
  const isDirty = content !== state.savedContent
  const diagramType = useMemo(() => detectDiagramType(content), [content])
  const statementCount = useMemo(() => countStatements(content), [content])

  // ─── Buffer swaps ─────────────────────────────────────────────────

  const applyDocument = useCallback(
    (document: PendingDocument) => {
      userEditedRef.current = true
      updateState({
        content: document.content,
        fileName: document.fileName,
        filePath: document.filePath,
        savedContent: document.savedContent,
      })
      setPendingDocument(null)
      setLastAction(document.successMessage, 'success')
    },
    [updateState, setLastAction]
  )

  // Loading a template used to overwrite the buffer outright, with no undo and
  // no warning — the one destructive action in the tool.
  const requestDocument = useCallback(
    (document: PendingDocument) => {
      // An empty buffer has nothing to lose, so it never earns a confirmation.
      if (isDirty && content.trim()) {
        setPendingDocument(document)
        return
      }
      applyDocument(document)
    },
    [isDirty, content, applyDocument]
  )

  const handleNewDiagram = useCallback(() => {
    requestDocument({
      content: '',
      fileName: null,
      filePath: null,
      savedContent: '',
      successMessage: 'New diagram created',
    })
  }, [requestDocument])

  const handleLoadTemplate = useCallback(
    (templateId?: string) => {
      const template = templateById(templateId ?? state.templateId)
      if (!template) return
      requestDocument({
        content: template.content,
        fileName: null,
        filePath: null,
        // A template is the buffer's starting point, not a modification of it —
        // reporting a freshly loaded template as "Modified" was noise, and it
        // made loading a second template ask to discard changes nobody made.
        savedContent: template.content,
        successMessage: `Loaded the ${template.label.toLowerCase()} template`,
      })
    },
    [state.templateId, requestDocument]
  )

  const handleContentChange = useCallback(
    (value: string | undefined) => {
      userEditedRef.current = true
      updateState({ content: value ?? '' })
    },
    [updateState]
  )

  // ─── Rendering (debounced) ────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const renderSeq = (renderSeqRef.current += 1)

    if (!content.trim()) {
      setSvgHtml('')
      setError(null)
      setIsRendering(false)
      return
    }

    setIsRendering(true)
    debounceRef.current = setTimeout(async () => {
      const renderId = `mermaid-preview-${renderSeq}`
      scratchIdsRef.current.add(renderId)
      try {
        const mermaid = await getMermaid(mermaidTheme)
        const { svg } = await mermaid.render(renderId, content)
        if (renderSeq !== renderSeqRef.current) return
        setSvgHtml(svg)
        setError(null)
        if (userEditedRef.current) {
          record({
            input: content,
            output: `${detectDiagramType(content) ?? 'Diagram'} · ${countStatements(content)} lines`,
            success: true,
          })
        }
      } catch (e) {
        if (renderSeq !== renderSeqRef.current) return
        // Mermaid reports lines against a copy with comments and front matter
        // stripped, so a commented diagram pointed at the wrong line.
        const parsed = withSourceLine(parseMermaidError(e), content)
        setError(parsed)
        // The last good diagram stays on screen: clearing it meant the preview
        // blanked out on every half-typed line.
        if (userEditedRef.current) {
          record({ input: content, output: '', success: false, error: parsed.message })
        }
      } finally {
        removeMermaidScratchNodes(renderId)
        scratchIdsRef.current.delete(renderId)
        if (renderSeq === renderSeqRef.current) setIsRendering(false)
      }
    }, RENDER_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [content, mermaidTheme, record])

  // A render still in flight when the tool closes would leave its scratch node
  // behind for good.
  useEffect(
    () => () => {
      scratchIdsRef.current.forEach(removeMermaidScratchNodes)
      scratchIdsRef.current.clear()
    },
    []
  )

  // ─── Error surfacing in the editor ────────────────────────────────

  const syncMarkers = useCallback((current: MermaidError | null) => {
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel()
    if (!monaco || !model) return
    // A stale line from a since-shortened document would make Monaco throw.
    const line = current?.line ? Math.min(current.line, model.getLineCount()) : null
    monaco.editor.setModelMarkers(
      model,
      'mermaid',
      line
        ? [
            {
              severity: monaco.MarkerSeverity.Error,
              message: current?.message ?? 'Mermaid could not render this diagram',
              startLineNumber: line,
              endLineNumber: line,
              startColumn: 1,
              endColumn: model.getLineMaxColumn(line),
            },
          ]
        : []
    )
  }, [])

  // The effect below can only run against a mounted editor, so an error raised
  // while the Preview-only pane was showing had no marker once Edit came back.
  const errorRef = useRef<MermaidError | null>(null)
  errorRef.current = error

  const handleEditorMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      syncMarkers(errorRef.current)
    },
    [syncMarkers]
  )

  useEffect(() => {
    syncMarkers(error)
  }, [error, syncMarkers])

  // Markers live on the model, which outlives this component.
  useEffect(() => () => syncMarkers(null), [syncMarkers])

  const goToError = useCallback(() => {
    const line = error?.line
    if (!line) return
    const reveal = () => {
      const editor = editorRef.current
      if (!editor) return
      editor.revealLineInCenter(line)
      editor.setPosition({ lineNumber: line, column: 1 })
      editor.focus()
    }
    if (mode === 'preview') {
      updateState({ mode: 'split' })
      // The editor pane does not exist yet; reveal once React has mounted it.
      requestAnimationFrame(reveal)
      return
    }
    reveal()
  }, [error, mode, updateState])

  // ─── Files ────────────────────────────────────────────────────────

  const handleOpen = useCallback(async () => {
    try {
      const result = await openFileDialog()
      if (!result) return
      requestDocument({
        content: result.content,
        fileName: result.filename,
        filePath: result.path,
        savedContent: result.content,
        successMessage: `Opened ${result.filename}`,
      })
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [requestDocument, setLastAction])

  const handleSaveAs = useCallback(async () => {
    try {
      const path = await saveFileDialog(content, state.fileName ?? 'diagram.mmd')
      if (!path) {
        setLastAction('Save cancelled', 'info')
        return
      }
      const fileName = filenameFromPath(path)
      updateState({ filePath: path, fileName, savedContent: content })
      setLastAction(`Saved ${fileName}`, 'success')
    } catch (err) {
      setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [content, state.fileName, updateState, setLastAction])

  const handleSave = useCallback(async () => {
    if (!state.filePath) {
      await handleSaveAs()
      return
    }
    try {
      await saveFileToPath(state.filePath, content)
      updateState({ savedContent: content })
      setLastAction(`Saved ${state.fileName ?? filenameFromPath(state.filePath)}`, 'success')
    } catch (err) {
      setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [state.filePath, state.fileName, content, updateState, setLastAction, handleSaveAs])

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
    if (action.type === 'save-file') void handleSave()
    if (action.type === 'copy-output') {
      navigator.clipboard
        .writeText(content)
        .then(() => setLastAction('Source copied to clipboard', 'success'))
        .catch(() => setLastAction('Clipboard write failed', 'error'))
    }
  })

  // ─── Image export ─────────────────────────────────────────────────

  const exportFormat = state.exportFormat ?? 'svg'
  const exportScale = state.exportScale ?? 2
  const transparent = state.transparentBackground ?? false
  // Mermaid's SVG carries `style="max-width: …"` and no pixel width, so the
  // browser sized it at the 300×150 default and every PNG came out cropped.
  const sizedSvg = useMemo(
    () => (svgHtml ? svgWithExplicitSize(svgHtml, svgSize(svgHtml)) : ''),
    [svgHtml]
  )

  const renderPngBlob = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!sizedSvg) {
        reject(new Error('Nothing to export'))
        return
      }
      const size = svgSize(sizedSvg)
      const url = URL.createObjectURL(new Blob([sizedSvg], { type: 'image/svg+xml' }))
      const image = new Image()
      image.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('The diagram could not be rasterised'))
      }
      image.onload = () => {
        URL.revokeObjectURL(url)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(size.width * exportScale))
        canvas.height = Math.max(1, Math.round(size.height * exportScale))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('No canvas context'))
          return
        }
        // A transparent PNG shows dark diagram text as invisible on most chat
        // and document backgrounds, so an opaque canvas is the default.
        if (!transparent) {
          context.fillStyle = mermaidTheme === 'dark' ? '#1e1e1e' : '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) =>
          blob ? resolve(blob) : reject(new Error('The image could not be encoded'))
        )
      }
      image.src = url
    })
  }, [sizedSvg, exportScale, transparent, mermaidTheme])

  const handleCopyImage = useCallback(async () => {
    setIsExporting(true)
    try {
      if (exportFormat === 'svg') {
        await navigator.clipboard.writeText(sizedSvg)
        setLastAction('SVG copied to clipboard', 'success')
      } else {
        // WebKit ties clipboard writes to the user gesture that started them, so
        // the promise has to be handed over rather than awaited first.
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderPngBlob() })])
        setLastAction(`PNG (${exportScale}×) copied to clipboard`, 'success')
      }
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : 'Copy failed', 'error')
    } finally {
      setIsExporting(false)
    }
  }, [exportFormat, sizedSvg, renderPngBlob, exportScale, setLastAction])

  const handleExportImage = useCallback(async () => {
    setIsExporting(true)
    try {
      const name = exportFileName(state.fileName, exportFormat)
      const data = exportFormat === 'svg' ? sizedSvg : await renderPngBlob()
      const path = await exportFile(data, name)
      setLastAction(
        path ? `Exported ${filenameFromPath(path)}` : 'Export cancelled',
        path ? 'success' : 'info'
      )
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : 'Export failed', 'error')
    } finally {
      setIsExporting(false)
    }
  }, [exportFormat, state.fileName, sizedSvg, renderPngBlob, setLastAction])

  const handleCopySource = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setLastAction('Source copied to clipboard', 'success')
    } catch {
      setLastAction('Clipboard write failed', 'error')
    }
  }, [content, setLastAction])

  // ─── Render ───────────────────────────────────────────────────────

  const statusText = content.trim()
    ? [
        diagramType ?? 'Diagram',
        `${statementCount} line${statementCount === 1 ? '' : 's'}`,
        isRendering ? 'Rendering…' : error ? `Error on line ${error.line ?? '?'}` : 'Rendered',
      ].join(' · ')
    : 'Empty diagram'

  return (
    <ToolLayout fullBleed>
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex min-h-14 items-center gap-2 px-3 max-[1000px]:flex-wrap max-[1000px]:py-2">
          <div className="min-w-0 flex-1 max-[1000px]:basis-full">
            <div className="flex items-center gap-2">
              <h1
                data-testid="file-name"
                className="truncate text-sm font-semibold text-[var(--color-text)]"
                title={state.filePath ?? state.fileName ?? 'Untitled diagram'}
              >
                {state.fileName ?? 'Untitled diagram'}
              </h1>
              <span
                className={`shrink-0 text-2xs ${isDirty ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
                aria-live="polite"
              >
                {isDirty ? 'Modified' : 'Saved'}
              </span>
            </div>
            <p className="mt-0.5 truncate text-2xs text-[var(--color-text-muted)]">
              {state.filePath ?? 'Local Mermaid diagram'}
            </p>
          </div>

          <SegmentedControl
            aria-label="Editor view mode"
            options={MODE_OPTIONS}
            value={mode}
            onChange={(next) => updateState({ mode: next })}
          />
        </div>

        <Toolbar border={false} className="flex-wrap gap-x-2 gap-y-1 pt-0 pb-2">
          <Button variant="ghost" size="sm" onClick={handleNewDiagram} className="gap-1">
            <FilePlusIcon size={13} aria-hidden="true" />
            New
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleOpen()}
            className="gap-1"
            title="Open a .mmd file (⌘O)"
          >
            <FolderOpenIcon size={13} aria-hidden="true" />
            Open
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleSave()}
            className="gap-1"
            title="Save the source (⌘S)"
          >
            <FloppyDiskIcon size={13} aria-hidden="true" />
            Save
          </Button>

          <span className="h-4 w-px bg-[var(--color-border)]" aria-hidden="true" />

          <Select
            aria-label="Diagram template"
            value={state.templateId}
            onChange={(e) => updateState({ templateId: e.target.value })}
          >
            {TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </Select>
          <Button variant="secondary" size="sm" onClick={() => handleLoadTemplate()}>
            Load
          </Button>

          <span className="h-4 w-px bg-[var(--color-border)]" aria-hidden="true" />

          <Select
            aria-label="Export format"
            value={exportFormat}
            onChange={(e) => updateState({ exportFormat: e.target.value as ExportFormat })}
          >
            <option value="svg">SVG</option>
            <option value="png">PNG</option>
          </Select>
          {exportFormat === 'png' && (
            <>
              <Select
                aria-label="PNG resolution"
                value={String(exportScale)}
                onChange={(e) => updateState({ exportScale: Number(e.target.value) })}
              >
                {EXPORT_SCALES.map((scale) => (
                  <option key={scale} value={scale}>
                    {scale}×
                  </option>
                ))}
              </Select>
              <Toggle
                checked={transparent}
                onChange={(checked) => updateState({ transparentBackground: checked })}
                label="Transparent"
              />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleCopyImage()}
            disabled={!svgHtml}
            loading={isExporting}
            className="gap-1"
          >
            <CopyIcon size={13} aria-hidden="true" />
            Copy {exportFormat.toUpperCase()}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleExportImage()}
            disabled={!svgHtml}
            loading={isExporting}
            className="gap-1"
          >
            <DownloadSimpleIcon size={13} aria-hidden="true" />
            Export
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleCopySource()}
            className="ml-auto gap-1"
          >
            <CopyIcon size={13} aria-hidden="true" />
            Copy source
          </Button>
        </Toolbar>
      </header>

      {error && (
        <Alert
          variant="error"
          className="flex items-center gap-3 rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          <span className="min-w-0 flex-1 truncate" title={error.message}>
            {/* Mermaid usually names the line itself — don't say it twice. */}
            {error.line && !/\bline \d+/i.test(error.message) ? `Line ${error.line}: ` : ''}
            {error.message}
          </span>
          {error.line !== null && (
            <Button variant="ghost" size="xs" onClick={goToError} className="shrink-0 gap-1">
              <ArrowRightIcon size={12} aria-hidden="true" />
              Go to line {error.line}
            </Button>
          )}
        </Alert>
      )}

      {/* Below ~900px a 50/50 split leaves two unusable columns, so the panes stack. */}
      <div className="flex min-h-0 flex-1 overflow-hidden max-[900px]:flex-col">
        {showEditor && (
          <div
            className={`min-h-0 overflow-hidden ${
              showPreview
                ? 'h-full w-1/2 border-r border-[var(--color-border)] max-[900px]:h-1/2 max-[900px]:w-full max-[900px]:border-r-0 max-[900px]:border-b'
                : 'h-full w-full'
            }`}
          >
            <Editor
              theme={monacoTheme}
              language="markdown"
              value={content}
              onChange={handleContentChange}
              onMount={handleEditorMount}
              options={monacoOptions}
            />
          </div>
        )}

        {showPreview && (
          <div
            className={`min-h-0 ${showEditor ? 'h-full w-1/2 max-[900px]:h-1/2 max-[900px]:w-full' : 'h-full w-full'}`}
          >
            <MermaidPreview
              svg={svgHtml}
              isRendering={isRendering}
              errorMessage={error?.message ?? null}
              emptyState={
                <EmptyState
                  icon={GraphIcon}
                  size="sm"
                  title={error ? 'Nothing has rendered yet' : 'No diagram yet'}
                  description={
                    error
                      ? 'Fix the error above and the preview will appear here.'
                      : 'Write Mermaid syntax on the left, or load a template.'
                  }
                  action={
                    !error && (
                      <Button variant="secondary" size="sm" onClick={() => handleLoadTemplate()}>
                        Load template
                      </Button>
                    )
                  }
                />
              }
            />
          </div>
        )}
      </div>

      <footer className="flex min-h-7 shrink-0 items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-2xs text-[var(--color-text-muted)]">
        <span data-testid="diagram-status" role="status" aria-live="polite">
          {statusText}
        </span>
        <span className="ml-auto">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
      </footer>

      {pendingDocument && (
        <Dialog
          title="Replace unsaved changes?"
          onClose={() => setPendingDocument(null)}
          className="w-[min(30rem,calc(100vw-2rem))]"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPendingDocument(null)}>
                Keep editing
              </Button>
              <Button type="button" variant="danger" onClick={() => applyDocument(pendingDocument)}>
                Discard changes
              </Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            The current diagram has changes that have not been saved to a file. Continuing will
            replace them.
          </p>
        </Dialog>
      )}
    </ToolLayout>
  )
}
