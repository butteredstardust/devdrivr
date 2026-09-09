/**
 * Tests for useFrameThrottle:
 * 1. Several calls in one frame collapse to one, carrying the newest arguments
 * 2. flush() delivers a pending call at once, so a gesture's last position is not lost
 * 3. cancel() and unmount drop a pending call
 * 4. A host without requestAnimationFrame still gets every call
 *
 * WARNING: this harness does not put requestAnimationFrame on globalThis (see src/test-setup.ts),
 * so the hook would take its synchronous fallback and none of the coalescing would be exercised.
 * Each test that cares installs a frame queue it drains by hand, which also makes the timing
 * deterministic rather than dependent on a real frame arriving.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFrameThrottle } from '@/hooks/useFrameThrottle'

let frames: Array<(time: number) => void>

function drainFrame(): void {
  const pending = frames
  frames = []
  for (const frame of pending) frame(0)
}

function installFrameQueue(): void {
  frames = []
  let nextHandle = 1
  const handles = new Map<number, (time: number) => void>()

  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: (time: number) => void) => {
      const handle = nextHandle++
      handles.set(handle, callback)
      frames.push((time) => {
        if (handles.delete(handle)) callback(time)
      })
      return handle
    },
  })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (handle: number) => handles.delete(handle),
  })
}

function removeFrameQueue(): void {
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame')
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame')
}

describe('useFrameThrottle', () => {
  beforeEach(installFrameQueue)
  afterEach(removeFrameQueue)

  it('collapses a burst into one call carrying the newest arguments', () => {
    const spy = vi.fn()
    const { result } = renderHook(() => useFrameThrottle(spy))

    act(() => {
      result.current.run(1)
      result.current.run(2)
      result.current.run(3)
    })

    // Nothing has run yet: the point is that the first two never reach React at all.
    expect(spy).not.toHaveBeenCalled()

    act(drainFrame)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(3)
  })

  it('schedules a new frame for the call after one lands', () => {
    const spy = vi.fn()
    const { result } = renderHook(() => useFrameThrottle(spy))

    act(() => result.current.run(1))
    act(drainFrame)
    act(() => result.current.run(2))
    act(drainFrame)

    expect(spy.mock.calls).toEqual([[1], [2]])
  })

  it('flush delivers the pending call immediately', () => {
    const spy = vi.fn()
    const { result } = renderHook(() => useFrameThrottle(spy))

    act(() => {
      result.current.run('a')
      result.current.flush()
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('a')
  })

  it('does not run a flushed call again on the next frame', () => {
    const spy = vi.fn()
    const { result } = renderHook(() => useFrameThrottle(spy))

    act(() => {
      result.current.run('a')
      result.current.flush()
    })
    act(drainFrame)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('flush does nothing when no call is pending', () => {
    const spy = vi.fn()
    const { result } = renderHook(() => useFrameThrottle(spy))

    act(() => result.current.flush())

    expect(spy).not.toHaveBeenCalled()
  })

  it('cancel drops the pending call', () => {
    const spy = vi.fn()
    const { result } = renderHook(() => useFrameThrottle(spy))

    act(() => {
      result.current.run('a')
      result.current.cancel()
    })
    act(drainFrame)

    expect(spy).not.toHaveBeenCalled()
  })

  it('does not call back after unmount', () => {
    const spy = vi.fn()
    const { result, unmount } = renderHook(() => useFrameThrottle(spy))

    act(() => result.current.run('a'))
    unmount()
    act(drainFrame)

    expect(spy).not.toHaveBeenCalled()
  })

  it('runs the newest callback, not the one captured when run was called', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(({ cb }) => useFrameThrottle(cb), {
      initialProps: { cb: first },
    })

    act(() => result.current.run('a'))
    rerender({ cb: second })
    act(drainFrame)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('a')
  })

  it('keeps run, flush and cancel stable across renders', () => {
    const { result, rerender } = renderHook(() => useFrameThrottle(vi.fn()))
    const before = result.current

    rerender()

    // Listener effects depend on these. A new identity per render would re-subscribe the
    // pointer handlers this hook exists to keep cheap.
    expect(result.current.run).toBe(before.run)
    expect(result.current.flush).toBe(before.flush)
    expect(result.current.cancel).toBe(before.cancel)
  })

  it('calls back synchronously on a host with no requestAnimationFrame', () => {
    removeFrameQueue()
    const spy = vi.fn()
    const { result } = renderHook(() => useFrameThrottle(spy))

    act(() => {
      result.current.run(1)
      result.current.run(2)
    })

    // Coalescing is lost without a frame clock, but no call may be dropped.
    expect(spy.mock.calls).toEqual([[1], [2]])
  })
})
