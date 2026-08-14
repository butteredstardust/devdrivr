import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * Edge/corner resize handles for client-side-decorated windows.
 *
 * Mounted on every platform, macOS included. An earlier version rendered nothing on macOS on the
 * theory that `decorations: false` only clears the AppKit `NSWindowStyleMask.titled` bit and
 * leaves OS-level edge tracking intact. Tested against the real build (Tauri 2.10.3, macOS 15):
 * that is false — dragging every edge and corner, at ±3px around the frame, resized nothing, so
 * the window could not be resized at all. The same synthetic drag resized a control window
 * normally, ruling out the test method. See documentation/NATIVE_UI_HARNESS.md.
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
              void getCurrentWindow()
                .startResizeDragging(handle.direction)
                .catch((err) =>
                  console.error('[WindowResizeHandles] startResizeDragging failed:', err)
                )
            }}
          />
        )
      })}
    </>
  )
}
