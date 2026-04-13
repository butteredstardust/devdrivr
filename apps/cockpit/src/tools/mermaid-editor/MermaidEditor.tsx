import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { Alert } from '@/components/shared/Alert'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'

type MermaidEditorState = {
  content: string
  exportScale?: number
}

type Transform = { x: number; y: number; scale: number }

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
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [svgHtml, setSvgHtml] = useState('')
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Non-passive wheel listener so we can call preventDefault (React 19 makes wheel passive by default)
  useEffect(() => {
    const el = previewRef.current
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
    return () => el.removeEventListener('wheel', onWheel)
  }, [setTransform])

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

  // ─── Mermaid rendering (debounced 500ms) ─────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!state.content.trim()) {
        setSvgHtml('')
        setError(null)
        return
      }
      try {
        const mermaid = await getMermaid()
        const { svg } = await mermaid.render('mermaid-preview', state.content)
        setSvgHtml(svg)
        setError(null)
      } catch (e) {
        setError((e as Error).message)
        setSvgHtml('')
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.content])

  // ─── Export handlers ─────────────────────────────────────────────

  const handleExportSvg = useCallback(() => {
    if (!svgHtml) return
    navigator.clipboard.writeText(svgHtml)
    setLastAction('SVG copied to clipboard', 'success')
  }, [svgHtml, setLastAction])

  const handleExportPng = useCallback(async () => {
    if (!svgHtml || !previewRef.current) return
    const scale = state.exportScale ?? 2
    const svgBlob = new Blob([svgHtml], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onerror = () => URL.revokeObjectURL(url)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(async (blob) => {
        if (!blob) return
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          setLastAction(`PNG (${scale}×) copied to clipboard`, 'success')
        } catch {
          setLastAction('Clipboard write failed', 'error')
        }
      })
    }
    img.src = url
  }, [svgHtml, setLastAction, state.exportScale])

  const exportScale = state.exportScale ?? 2

  return (
    <div className="flex h-full flex-col">
      {/* ─── Toolbar ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <span className="font-mono text-xs text-[var(--color-text-muted)]">Templates:</span>
        {Object.keys(TEMPLATES).map((name) => (
          <button
            key={name}
            onClick={() => updateState({ content: TEMPLATES[name] ?? '' })}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
          >
            {name}
          </button>
        ))}
        <div className="mx-2 h-4 w-px bg-[var(--color-border)]" />
        <Button variant="ghost" size="sm" onClick={handleExportSvg} disabled={!svgHtml}>
          Copy SVG
        </Button>
        {/* PNG scale selector + copy button */}
        <div className="flex items-center gap-1.5">
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
          <Button variant="ghost" size="sm" onClick={handleExportPng} disabled={!svgHtml}>
            Copy PNG
          </Button>
        </div>
        <div className="ml-auto">
          <CopyButton text={state.content} label="Copy Source" />
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
        <div className="w-1/2 border-r border-[var(--color-border)]">
          <Editor
            theme={monacoTheme}
            value={state.content}
            onChange={(v) => updateState({ content: v ?? '' })}
            options={monacoOptions}
          />
        </div>

        {/* Preview — pan & zoom canvas */}
        <div
          ref={previewRef}
          className="relative w-1/2 cursor-grab overflow-hidden bg-[var(--color-surface)] select-none active:cursor-grabbing"
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
                <div>{error ? 'Fix syntax errors to see preview' : 'Enter mermaid syntax...'}</div>
                {!error && (
                  <div className="mt-1 text-[10px] opacity-40">
                    Scroll to zoom · Drag to pan · Double-click to reset
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Zoom badge (bottom-right) */}
          <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded bg-[var(--color-surface-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
            <span>{Math.round(transform.scale * 100)}%</span>
            {!isViewDefault && (
              <button
                className="pointer-events-auto ml-0.5 hover:text-[var(--color-text)]"
                title="Reset view"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  resetView()
                }}
              >
                ↺
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
