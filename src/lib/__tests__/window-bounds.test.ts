import { describe, expect, it } from 'vitest'
import {
  centerIn,
  isOnScreen,
  logicalWorkAreas,
  resolveRestorePosition,
  type MonitorLike,
} from '@/lib/window-bounds'

function monitor(
  x: number,
  y: number,
  width: number,
  height: number,
  scaleFactor = 1
): MonitorLike {
  return { workArea: { position: { x, y }, size: { width, height } }, scaleFactor }
}

const LAPTOP = logicalWorkAreas([monitor(0, 25, 1920, 1055)])

describe('logicalWorkAreas', () => {
  it('converts physical monitor geometry to logical pixels', () => {
    expect(logicalWorkAreas([monitor(0, 50, 3840, 2110, 2)])).toEqual([
      { x: 0, y: 25, width: 1920, height: 1055 },
    ])
  })

  it('treats a nonsensical scale factor as 1 rather than dividing by zero', () => {
    expect(logicalWorkAreas([monitor(0, 0, 1920, 1080, 0)])[0]?.width).toBe(1920)
  })
})

describe('isOnScreen', () => {
  it('accepts a window sitting inside a work area', () => {
    expect(isOnScreen({ x: 100, y: 100, width: 1200, height: 800 }, LAPTOP)).toBe(true)
  })

  it('accepts a window hanging off an edge while a usable slice remains', () => {
    expect(isOnScreen({ x: 1700, y: 200, width: 1200, height: 800 }, LAPTOP)).toBe(true)
  })

  it('rejects a position saved on a monitor that is no longer attached', () => {
    expect(isOnScreen({ x: 3500, y: 300, width: 1200, height: 800 }, LAPTOP)).toBe(false)
  })

  it('rejects a window pushed above the work area', () => {
    expect(isOnScreen({ x: 200, y: -900, width: 1200, height: 800 }, LAPTOP)).toBe(false)
  })

  it('accepts a position that only the second monitor makes valid', () => {
    const dual = logicalWorkAreas([monitor(0, 25, 1920, 1055), monitor(1920, 0, 2560, 1440)])
    expect(isOnScreen({ x: 3500, y: 300, width: 1200, height: 800 }, dual)).toBe(true)
  })
})

describe('resolveRestorePosition', () => {
  it('leaves a reachable position alone', () => {
    expect(resolveRestorePosition({ x: 100, y: 100, width: 1200, height: 800 }, LAPTOP)).toBeNull()
  })

  it('recentres a window stranded on a detached display', () => {
    expect(resolveRestorePosition({ x: 3500, y: 300, width: 1200, height: 800 }, LAPTOP)).toEqual({
      x: 360,
      // 25 + (1055 - 800) / 2 = 152.5, rounded up.
      y: 153,
    })
  })

  it('recentres on the first work area, which is the primary monitor', () => {
    const dual = logicalWorkAreas([monitor(0, 0, 1000, 1000), monitor(4000, 0, 1000, 1000)])
    expect(resolveRestorePosition({ x: -9000, y: 0, width: 800, height: 600 }, dual)).toEqual({
      x: 100,
      y: 200,
    })
  })

  it('leaves the position alone when no monitors were reported', () => {
    expect(resolveRestorePosition({ x: 3500, y: 300, width: 1200, height: 800 }, [])).toBeNull()
  })
})

describe('centerIn', () => {
  it('never places the window above or left of the work area', () => {
    expect(centerIn({ x: 0, y: 0, width: 3000, height: 2000 }, LAPTOP[0]!)).toEqual({ x: 0, y: 25 })
  })
})
