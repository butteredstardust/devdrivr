import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwiseIcon,
  ArrowsOutSimpleIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Spinner } from '@/components/shared/Spinner'
import { Toolbar, ToolbarSpacer } from '@/components/shared/Toolbar'
import { fitScale, svgSize, type SvgSize } from './mermaid-helpers'

type Transform = { x: number; y: number; scale: number }

type MermaidPreviewProps = {
  svg: string
  isRendering: boolean
  /** Set when the last render failed — the previous diagram stays on screen. */
  errorMessage: string | null
  emptyState: React.ReactNode
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const PAN_STEP = 48
const ZOOM_STEP = 1.2
const IDENTITY: Transform = { x: 0, y: 0, scale: 1 }

function clampScale(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

export default function MermaidPreview({
  svg,
  isRendering,
  errorMessage,
  emptyState,
}: MermaidPreviewProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [transform, setTransformState] = useState<Transform>(IDENTITY)
  // The wheel and drag handlers run outside React's render cycle and must see
  // the current transform without re-subscribing on every frame.
  const transformRef = useRef<Transform>(IDENTITY)
  const setTransform = useCallback((next: Transform) => {
    transformRef.current = next
    setTransformState(next)
  }, [])
  // Auto-fitting on every successful render would yank the view back while the
  // user is zoomed in on one corner and still typing.
  const hasUserAdjusted = useRef(false)

  // React 19 compares `dangerouslySetInnerHTML` by object identity, not by the
  // `__html` string, so an inline literal re-writes innerHTML on every render —
  // which resets the rendered SVG mid-pan.
  const svgProp = useMemo(() => ({ __html: svg }), [svg])
  const size = useMemo<SvgSize | null>(() => (svg ? svgSize(svg) : null), [svg])

  const viewport = useCallback((): SvgSize | null => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return { width: rect.width, height: rect.height }
  }, [])

  /** Centres the diagram at the largest scale that shows all of it. */
  const fitToView = useCallback(() => {
    // Asking to fit hands the view back to auto-fitting.
    hasUserAdjusted.current = false
    const box = viewport()
    if (!size || !box) {
      setTransform(IDENTITY)
      return
    }
    const scale = fitScale(size, box)
    setTransform({
      x: (box.width - size.width * scale) / 2,
      y: (box.height - size.height * scale) / 2,
      scale,
    })
  }, [size, viewport, setTransform])

  // A diagram wider than the pane used to open at 100% with its left edge in
  // the corner, so the first thing the user saw was a fragment.
  const fittedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!svg) {
      // Emptying the pane ends the session that zoom belonged to.
      fittedFor.current = null
      hasUserAdjusted.current = false
      return
    }
    if (fittedFor.current === svg) return
    fittedFor.current = svg
    if (hasUserAdjusted.current) return
    fitToView()
  }, [svg, fitToView])

  const zoomBy = useCallback(
    (factor: number, origin?: { x: number; y: number }) => {
      hasUserAdjusted.current = true
      const box = viewport()
      const { x, y, scale } = transformRef.current
      const next = clampScale(scale * factor)
      const ratio = next / scale
      const anchor = origin ?? { x: (box?.width ?? 0) / 2, y: (box?.height ?? 0) / 2 }
      setTransform({
        x: anchor.x + (x - anchor.x) * ratio,
        y: anchor.y + (y - anchor.y) * ratio,
        scale: next,
      })
    },
    [viewport, setTransform]
  )

  const panBy = useCallback(
    (dx: number, dy: number) => {
      hasUserAdjusted.current = true
      const { x, y, scale } = transformRef.current
      setTransform({ x: x + dx, y: y + dy, scale })
    },
    [setTransform]
  )

  const resetView = useCallback(() => {
    hasUserAdjusted.current = true
    setTransform(IDENTITY)
  }, [setTransform])

  // Wheel zoom has to be non-passive to call preventDefault, which rules out
  // the React prop; a callback ref re-attaches it whenever the pane remounts on
  // a mode switch, where a useEffect would fire before the branch is in the DOM.
  const wheelCleanup = useRef<(() => void) | null>(null)
  const attachCanvas = useCallback(
    (el: HTMLDivElement | null) => {
      wheelCleanup.current?.()
      wheelCleanup.current = null
      canvasRef.current = el
      if (!el) return
      const onWheel = (event: WheelEvent) => {
        event.preventDefault()
        const rect = el.getBoundingClientRect()
        zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1, {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      wheelCleanup.current = () => el.removeEventListener('wheel', onWheel)
    },
    [zoomBy]
  )

  useEffect(() => () => wheelCleanup.current?.(), [])

  const panning = useRef(false)
  const panOrigin = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 })

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    // Mermaid diagrams can carry links and clickable nodes; dragging must not
    // swallow them.
    if (
      event.target instanceof Element &&
      event.target.closest('a, button, [role="button"], [href], .clickable')
    ) {
      return
    }
    panning.current = true
    hasUserAdjusted.current = true
    const { x, y } = transformRef.current
    panOrigin.current = { mouseX: event.clientX, mouseY: event.clientY, x, y }
  }, [])

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!panning.current) return
      const { mouseX, mouseY, x, y } = panOrigin.current
      setTransform({
        ...transformRef.current,
        x: x + (event.clientX - mouseX),
        y: y + (event.clientY - mouseY),
      })
    },
    [setTransform]
  )

  const stopPanning = useCallback(() => {
    panning.current = false
  }, [])

  // Zoom and pan used to be reachable only with a wheel and a drag, which left
  // the whole preview unusable from the keyboard.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const actions: Record<string, () => void> = {
        ArrowUp: () => panBy(0, PAN_STEP),
        ArrowDown: () => panBy(0, -PAN_STEP),
        ArrowLeft: () => panBy(PAN_STEP, 0),
        ArrowRight: () => panBy(-PAN_STEP, 0),
        '+': () => zoomBy(ZOOM_STEP),
        '=': () => zoomBy(ZOOM_STEP),
        '-': () => zoomBy(1 / ZOOM_STEP),
        '0': resetView,
        f: fitToView,
      }
      const action = actions[event.key]
      if (!action) return
      event.preventDefault()
      action()
    },
    [panBy, zoomBy, resetView, fitToView]
  )

  const percent = Math.round(transform.scale * 100)

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--color-surface)]">
      <Toolbar className="gap-1" wrap={false} aria-label="Diagram view controls">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          aria-label="Zoom out"
          title="Zoom out (−)"
        >
          <MagnifyingGlassMinusIcon size={14} aria-hidden="true" />
        </Button>
        <span
          className="w-12 text-center font-mono text-2xs text-[var(--color-text-muted)] tabular-nums"
          title="Zoom level"
        >
          {percent}%
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => zoomBy(ZOOM_STEP)}
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          <MagnifyingGlassPlusIcon size={14} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={fitToView}
          disabled={!svg}
          className="gap-1"
          title="Fit the whole diagram in the pane (F)"
        >
          <ArrowsOutSimpleIcon size={14} aria-hidden="true" />
          Fit
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={resetView}
          className="gap-1"
          title="Back to 100% (0)"
        >
          <ArrowCounterClockwiseIcon size={14} aria-hidden="true" />
          Reset
        </Button>

        <ToolbarSpacer />
        <span className="flex items-center gap-1 text-2xs text-[var(--color-text-muted)]">
          {isRendering && (
            <>
              <Spinner size="xs" />
              Rendering…
            </>
          )}
          {!isRendering && errorMessage && svg && (
            <>
              <WarningCircleIcon
                size={12}
                aria-hidden="true"
                className="text-[var(--color-warning)]"
              />
              Showing the last diagram that rendered
            </>
          )}
        </span>
      </Toolbar>

      <div
        ref={attachCanvas}
        data-testid="mermaid-canvas"
        tabIndex={0}
        aria-label="Diagram canvas. Arrow keys pan, plus and minus zoom, F fits, 0 resets."
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden select-none focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopPanning}
        onMouseLeave={stopPanning}
        onDoubleClick={fitToView}
        onKeyDown={handleKeyDown}
      >
        {svg ? (
          <div
            data-testid="mermaid-preview-content"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: '0 0',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
            dangerouslySetInnerHTML={svgProp}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6">{emptyState}</div>
        )}

        {/* Only meaningful once there is something to pan — and in a short pane
            it would otherwise sit on top of the empty state. */}
        {svg && (
          <p className="pointer-events-none absolute bottom-2 left-2 select-none text-2xs text-[var(--color-text-muted)] opacity-40">
            Scroll or +/− to zoom · drag or arrows to pan · double-click to fit
          </p>
        )}
      </div>
    </div>
  )
}
