import { getCurrentWindow } from '@tauri-apps/api/window'
import { isMacOS } from '@/lib/platform'

/**
 * Edge/corner resize handles for client-side-decorated windows.
 *
 * macOS keeps native edge/corner resizing after `decorations: false`: Tauri's window builder
 * only clears the AppKit `NSWindowStyleMask.titled` bit to hide the titlebar — the `resizable`
 * bit (and the OS-level edge tracking that comes with it) is untouched, and `tauri.conf.json`
 * does not set `resizable: false`. So this component renders nothing on macOS; only
 * Windows/WebView2 and Linux/WebKitGTK lose resize affordances when the native chrome goes away,
 * because those platforms' resize handling was part of the titlebar/border decorations Tauri
 * just stripped. Confirm this on a real build if the resize behaviour ever looks off — style-mask
 * behaviour like this is exactly the kind of thing that can drift between Tauri/macOS versions.
 *
 * Handles sit at `--z-scrim` minus one (39) — below every documented overlay tier in
 * src/styles/tokens.css (scrim 40 through toast 80) — so modals, popovers, tooltips, and toasts
 * always win the stacking fight. Each handle is a thin absolutely-positioned strip so it doesn't
 * intercept clicks on app content away from the window edge.
 */
const HANDLE_SIZE = 4
const HANDLE_Z = 'z-[39]'

type EdgeHandle = {
  direction:
    | 'North'
    | 'South'
    | 'East'
    | 'West'
    | 'NorthEast'
    | 'NorthWest'
    | 'SouthEast'
    | 'SouthWest'
  className: string
  cursor: string
}

const HANDLES: EdgeHandle[] = [
  { direction: 'North', className: 'top-0 left-0 right-0', cursor: 'cursor-n-resize' },
  { direction: 'South', className: 'bottom-0 left-0 right-0', cursor: 'cursor-s-resize' },
  { direction: 'West', className: 'top-0 bottom-0 left-0', cursor: 'cursor-w-resize' },
  { direction: 'East', className: 'top-0 bottom-0 right-0', cursor: 'cursor-e-resize' },
  { direction: 'NorthWest', className: 'top-0 left-0', cursor: 'cursor-nw-resize' },
  { direction: 'NorthEast', className: 'top-0 right-0', cursor: 'cursor-ne-resize' },
  { direction: 'SouthWest', className: 'bottom-0 left-0', cursor: 'cursor-sw-resize' },
  { direction: 'SouthEast', className: 'bottom-0 right-0', cursor: 'cursor-se-resize' },
]

const EDGE_DIRECTIONS = new Set(['North', 'South', 'East', 'West'])

export function WindowResizeHandles() {
  if (isMacOS()) return null

  return (
    <>
      {HANDLES.map((handle) => {
        const isEdge = EDGE_DIRECTIONS.has(handle.direction)
        const size = isEdge ? HANDLE_SIZE : HANDLE_SIZE * 2.5
        return (
          <div
            key={handle.direction}
            aria-hidden="true"
            data-testid={`resize-handle-${handle.direction}`}
            className={`fixed ${handle.className} ${handle.cursor} ${HANDLE_Z}`}
            style={
              isEdge
                ? handle.direction === 'North' || handle.direction === 'South'
                  ? { height: size }
                  : { width: size }
                : { width: size, height: size }
            }
            onMouseDown={(event) => {
              // Only the primary button should start a resize-drag.
              if (event.button !== 0) return
              event.preventDefault()
              void getCurrentWindow().startResizeDragging(handle.direction)
            }}
          />
        )
      })}
    </>
  )
}
