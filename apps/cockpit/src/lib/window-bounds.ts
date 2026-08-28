/**
 * Validation for restored window geometry.
 *
 * Fixed coordinate bounds cannot answer the question that matters — "can the user see and grab
 * this window?" — because the answer depends on which displays are attached right now. A position
 * saved on a detached 4K display to the right is a perfectly ordinary number that puts the whole
 * window into empty space. So the saved rectangle is checked against live monitor work areas
 * instead, and recentred when nothing would be reachable.
 */

export type Rect = { x: number; y: number; width: number; height: number }

/** Minimum on-screen slice of the window, in logical pixels: enough titlebar to drag it back. */
export const MIN_VISIBLE_WIDTH = 120
export const MIN_VISIBLE_HEIGHT = 40

/** A monitor as reported by `@tauri-apps/api/window`, in physical pixels. */
export type MonitorLike = {
  workArea: { position: { x: number; y: number }; size: { width: number; height: number } }
  scaleFactor: number
}

/** Work areas converted to the logical coordinate space the saved bounds are stored in. */
export function logicalWorkAreas(monitors: readonly MonitorLike[]): Rect[] {
  return monitors.map((monitor) => {
    // A scale factor of 0 would be nonsense from the platform, but dividing by it would turn a
    // recoverable geometry problem into Infinity.
    const scale = monitor.scaleFactor > 0 ? monitor.scaleFactor : 1
    return {
      x: monitor.workArea.position.x / scale,
      y: monitor.workArea.position.y / scale,
      width: monitor.workArea.size.width / scale,
      height: monitor.workArea.size.height / scale,
    }
  })
}

function overlaps(bounds: Rect, area: Rect): boolean {
  const overlapWidth =
    Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
  const overlapHeight =
    Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
  return (
    overlapWidth >= Math.min(MIN_VISIBLE_WIDTH, bounds.width) &&
    overlapHeight >= Math.min(MIN_VISIBLE_HEIGHT, bounds.height)
  )
}

/** True when the rectangle keeps a usable slice of itself inside at least one work area. */
export function isOnScreen(bounds: Rect, areas: readonly Rect[]): boolean {
  return areas.some((area) => overlaps(bounds, area))
}

/** Centres the window in a work area, without letting it start above or left of that area. */
export function centerIn(bounds: Rect, area: Rect): { x: number; y: number } {
  return {
    x: Math.round(area.x + Math.max(0, (area.width - bounds.width) / 2)),
    y: Math.round(area.y + Math.max(0, (area.height - bounds.height) / 2)),
  }
}

/**
 * The position to restore the window at: the saved one when it is still reachable, otherwise the
 * centre of the first work area. Returns `null` when the position should be left alone — either no
 * monitors were reported (nothing to validate against) or the saved position is already fine.
 */
export function resolveRestorePosition(
  bounds: Rect,
  areas: readonly Rect[]
): { x: number; y: number } | null {
  const [primary] = areas
  if (!primary || isOnScreen(bounds, areas)) return null
  return centerIn(bounds, primary)
}
