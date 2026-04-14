import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { Alert } from '@/components/shared/Alert'
import { useUiStore } from '@/stores/ui.store'
import { CaretDownIcon } from '@phosphor-icons/react'

type MermaidEditorState = {
  content: string
  exportScale: number
  mode: 'edit' | 'split' | 'preview'
}

type Transform = { x: number; y: number; scale: number }

const MODES = [
  { id: 'edit', label: 'Edit' },
  { id: 'split', label: 'Split' },
  { id: 'preview', label: 'Preview' },
]

const TEMPLATES: Record<string, string> = {
  flowchart: `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Great!]
    B -- No --> D[Debug]
    D --> B`,
  sequence: `sequenceDiagram
    Alice->>+Bob: Hello Bob
    Bob-->>-Alice: Hi Alice
    Alice->>+Bob: How are you?
    Bob-->>-Alice: Fine, thanks!`,
  classDiagram: `classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal: +int age
    Animal: +String gender
    Animal: +isMammal()
    Duck: +String beakColor
    Duck: +swim()
    Fish: +int sizeInFeet
    Fish: +canEat()`,
  er: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
  gantt: `gantt
    title Project Schedule
    dateFormat YYYY-MM-DD
    section Phase 1
    Task 1: a1, 2024-01-01, 30d
    Task 2: a2, after a1, 20d
    section Phase 2
    Task 3: b1, after a2, 25d`,
  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Submit
    Processing --> Success: Valid
    Processing --> Error: Invalid
    Error --> Idle: Reset
    Success --> [*]`,
  pie: `pie title Favorite Languages
    "TypeScript" : 40
    "Rust" : 25
    "Python" : 20
    "Go" : 15`,
}

const EXPORT_SCALES = [1, 2, 3, 4] as const
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scale: 1 }

// Module-level init guard — mermaid.initialize is expensive; call it once
let mermaidInitialized = false
async function getMermaid() {
  const { default: mermaid } = await import('mermaid')
  if (!mermaidInitialized) {
    mermaid.initialize({ startOnLoad: false, theme: 'dark' })
    mermaidInitialized = true
  }
  return mermaid
}

export default function MermaidEditor() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<MermaidEditorState>('mermaid-editor', {
    content: TEMPLATES['flowchart'] ?? '',
    exportScale: 2,
    mode: 'split',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [svgHtml, setSvgHtml] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wheelCleanupRef = useRef<(() => void) | null>(null)
  const templatesRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const mode = state.mode ?? 'split'
  const showEditor = mode === 'edit' || mode === 'split'
  const showPreview = mode === 'preview' || mode === 'split'
  const exportScale = state.exportScale ?? 2

  // ─── Pan & Zoom (local UI state, not persisted) ───────────────────

  const [transform, _setTransform] = useState<Transform>(DEFAULT_TRANSFORM)
  const transformRef = useRef<Transform>(DEFAULT_TRANSFORM)
  const setTransform = useCallback((t: Transform) => {
    transformRef.current = t
    _setTransform(t)
  }, [])

  const isPanning = useRef(false)
  const panStart = useRef({ mouseX: 0, mouseY: 0, originX: 0, originY: 0 })

  const isViewDefault = transform.scale === 1 && transform.x === 0 && transform.y === 0

  // Callback ref — attaches/detaches the non-passive wheel listener whenever the
  // preview pane mounts or unmounts (e.g. on mode switch). A plain useRef + useEffect
  // fails here because the effect fires before the conditional branch is in the DOM.
  const previewRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (wheelCleanupRef.current) {
        wheelCleanupRef.current()
        wheelCleanupRef.current = null
      }
      if (!el) return
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const cursorX = e.clientX - rect.left
        const cursorY = e.clientY - rect.top
        const { x, y, scale } = transformRef.current
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * factor))
        const ratio = newScale / scale
        setTransform({
          x: cursorX + (x - cursorX) * ratio,
          y: cursorY + (y - cursorY) * ratio,
          scale: newScale,
        })
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      wheelCleanupRef.current = () => el.removeEventListener('wheel', onWheel)
    },
    [setTransform]
  )

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    isPanning.current = true
    const { x, y } = transformRef.current
    panStart.current = { mouseX: e.clientX, mouseY: e.clientY, originX: x, originY: y }
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning.current) return
      const { mouseX, mouseY, originX, originY } = panStart.current
      setTransform({
        ...transformRef.current,
        x: originX + (e.clientX - mouseX),
        y: originY + (e.clientY - mouseY),
      })
    },
    [setTransform]
  )

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
  }, [])

  const handleMouseLeave = useCallback(() => {
    isPanning.current = false
  }, [])

  const resetView = useCallback(() => {
    setTransform(DEFAULT_TRANSFORM)
  }, [setTransform])

  // ─── Outside-click dismiss for dropdowns ─────────────────────────

  useEffect(() => {
    if (!showTemplates) return
    const handler = (e: MouseEvent) => {
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) {
        setShowTemplates(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTemplates])

  useEffect(() => {
    if (!showExport) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExport])

  // ─── Mermaid rendering (debounced 500ms) ─────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!state.content.trim()) {
      setSvgHtml('')
      setError(null)
      setIsRendering(false)
      return
    }
    setIsRendering(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const mermaid = await getMermaid()
        const { svg } = await mermaid.render('mermaid-preview', state.content)
        setSvgHtml(svg)
        setError(null)
      } catch (e) {
        setError((e as Error).message)
        setSvgHtml('')
      } finally {
        setIsRendering(false)
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.content])

  // ─── Export handlers ─────────────────────────────────────────────

  const handleCopySvg = useCallback(async () => {
    if (!svgHtml) return
    try {
      await navigator.clipboard.writeText(svgHtml)
      setLastAction('SVG copied to clipboard', 'success')
    } catch {
      setLastAction('Clipboard write failed', 'error')
    }
    setShowExport(false)
  }, [svgHtml, setLastAction])

  const handleDownloadSvg = useCallback(() => {
    if (!svgHtml) return
    const blob = new Blob([svgHtml], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'diagram.svg'
    a.click()
    URL.revokeObjectURL(url)
    setLastAction('SVG downloaded', 'success')
    setShowExport(false)
  }, [svgHtml, setLastAction])

  const renderPngBlob = useCallback(
    (scale: number): Promise<Blob> =>
      new Promise((resolve, reject) => {
        if (!svgHtml) return reject(new Error('No SVG'))
        const blob = new Blob([svgHtml], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const img = new Image()
        img.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('Image load failed'))
        }
        img.onload = () => {
          URL.revokeObjectURL(url)
          const canvas = document.createElement('canvas')
          canvas.width = img.width * scale
          canvas.height = img.height * scale
          const ctx = canvas.getContext('2d')
          if (!ctx) return reject(new Error('No canvas context'))
          ctx.scale(scale, scale)
          ctx.drawImage(img, 0, 0)
          canvas.toBlob((b) => {
            if (b) resolve(b)
            else reject(new Error('toBlob failed'))
          })
        }
        img.src = url
      }),
    [svgHtml]
  )

  const handleCopyPng = useCallback(async () => {
    try {
      const blob = await renderPngBlob(exportScale)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setLastAction(`PNG (${exportScale}×) copied to clipboard`, 'success')
    } catch {
      setLastAction('Clipboard write failed', 'error')
    }
    setShowExport(false)
  }, [renderPngBlob, exportScale, setLastAction])

  const handleDownloadPng = useCallback(async () => {
    try {
      const blob = await renderPngBlob(exportScale)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `diagram-${exportScale}x.png`
      a.click()
      URL.revokeObjectURL(url)
      setLastAction(`PNG (${exportScale}×) downloaded`, 'success')
    } catch {
      setLastAction('Export failed', 'error')
    }
    setShowExport(false)
  }, [renderPngBlob, exportScale, setLastAction])

  const handleCopySource = useCallback(() => {
    navigator.clipboard
      .writeText(state.content)
      .then(() => setLastAction('Source copied to clipboard', 'success'))
      .catch(() => setLastAction('Clipboard write failed', 'error'))
    setShowExport(false)
  }, [state.content, setLastAction])

  return (
    <div className="flex h-full flex-col">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2">
        <TabBar
          tabs={MODES}
          activeTab={mode}
          onTabChange={(id) => updateState({ mode: id as MermaidEditorState['mode'] })}
          noBorder
        />

        <div className="ml-auto flex items-center gap-3 py-2">
          {/* Templates dropdown */}
          <div ref={templatesRef} className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-0.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Templates
              <CaretDownIcon size={10} />
            </button>
            {showTemplates && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg">
                {Object.keys(TEMPLATES).map((name) => (
                  <button
                    key={name}
                    onClick={() => {
                      updateState({ content: TEMPLATES[name] ?? '' })
                      setShowTemplates(false)
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export dropdown */}
          <div ref={exportRef} className="relative">
            <button
              onClick={() => setShowExport(!showExport)}
              className="flex items-center gap-0.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Export
              <CaretDownIcon size={10} />
            </button>
            {showExport && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-[180px] rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg">
                <button
                  onClick={handleCopySvg}
                  disabled={!svgHtml}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Copy SVG
                </button>
                <button
                  onClick={handleDownloadSvg}
                  disabled={!svgHtml}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Download SVG
                </button>

                <div className="my-1 border-t border-[var(--color-border)]" />

                {/* PNG resolution picker */}
                <div className="flex items-center gap-2 px-3 py-1">
                  <span className="text-[10px] text-[var(--color-text-muted)]">PNG res:</span>
                  <div className="flex items-center rounded border border-[var(--color-border)]">
                    {EXPORT_SCALES.map((s) => (
                      <button
                        key={s}
                        onClick={() => updateState({ exportScale: s })}
                        title={`Export PNG at ${s}× resolution`}
                        className={`px-1.5 py-0.5 text-[10px] transition-colors first:rounded-l last:rounded-r ${
                          exportScale === s
                            ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                        }`}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleCopyPng}
                  disabled={!svgHtml}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Copy PNG ({exportScale}×)
                </button>
                <button
                  onClick={handleDownloadPng}
                  disabled={!svgHtml}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Download PNG ({exportScale}×)
                </button>

                <div className="my-1 border-t border-[var(--color-border)]" />

                <button
                  onClick={handleCopySource}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  Copy Source
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Error banner ───────────────────────────────────────────── */}
      {error && (
        <Alert
          variant="error"
          className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
        >
          {error}
        </Alert>
      )}

      {/* ─── Body ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        {showEditor && (
          <div
            className={`${showPreview ? 'w-1/2 border-r border-[var(--color-border)]' : 'w-full'} h-full`}
          >
            <Editor
              theme={monacoTheme}
              value={state.content}
              onChange={(v) => updateState({ content: v ?? '' })}
              options={monacoOptions}
            />
          </div>
        )}

        {/* Preview — pan & zoom canvas */}
        {showPreview && (
          <div
            ref={previewRef}
            className={`relative ${showEditor ? 'w-1/2' : 'w-full'} cursor-grab overflow-hidden bg-[var(--color-surface)] select-none active:cursor-grabbing`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={resetView}
          >
            {/* Transformed layer */}
            <div
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                transformOrigin: '0 0',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                pointerEvents: 'none',
              }}
            >
              {svgHtml ? (
                <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
              ) : (
                <div className="select-none text-center text-sm text-[var(--color-text-muted)]">
                  {isRendering ? (
                    <div className="text-xs opacity-50">Rendering…</div>
                  ) : (
                    <div>
                      {error ? 'Fix syntax errors to see preview' : 'Enter mermaid syntax…'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Persistent interaction hint — bottom-left, always visible */}
            <div className="pointer-events-none absolute bottom-2 left-2 select-none text-[10px] text-[var(--color-text-muted)] opacity-30">
              Scroll · Drag · Double-click to reset
            </div>

            {/* Zoom badge — bottom-right; ↺ always shown, dimmed at default */}
            <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded bg-[var(--color-surface-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
              {isRendering && (
                <span className="mr-0.5 opacity-60" aria-label="Rendering">
                  ⟳
                </span>
              )}
              <span>{Math.round(transform.scale * 100)}%</span>
              <button
                className={`pointer-events-auto ml-0.5 transition-colors ${
                  isViewDefault ? 'cursor-default opacity-30' : 'hover:text-[var(--color-text)]'
                }`}
                title="Reset view (or double-click)"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  if (isViewDefault) return
                  e.stopPropagation()
                  resetView()
                }}
                aria-label="Reset view"
              >
                ↺
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
