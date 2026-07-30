import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REGEX_TIMEOUT_MS, useRegexEvaluation } from '@/hooks/useRegexEvaluation'

/**
 * A worker that accepts requests and never answers — exactly how the real worker behaves
 * while it is stuck inside `exec()` on a catastrophic pattern. It cannot be simulated by
 * running the real evaluation here: `(a+)+$` against 30 `a`s plus `!` does not complete,
 * so it would wedge the test runner the same way it wedged the app.
 */
class WedgedWorker {
  static instances: WedgedWorker[] = []
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: ErrorEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  dispatchEvent = vi.fn(() => false)

  constructor() {
    WedgedWorker.instances.push(this)
  }
}

vi.mock('@/workers/regex.worker?worker', () => ({
  default: function WedgedWorkerFactory() {
    return new WedgedWorker()
  },
}))

// The exact reproduction from the bug report.
const CATASTROPHIC = {
  pattern: '(a+)+$',
  flags: 'g',
  text: `${'a'.repeat(30)}!`,
  replacement: '',
}

describe('useRegexEvaluation', () => {
  beforeEach(() => {
    WedgedWorker.instances = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports a timeout for a catastrophic pattern once the budget elapses', () => {
    const { result } = renderHook(() => useRegexEvaluation(CATASTROPHIC))

    expect(result.current.status).toBe('evaluating')

    act(() => {
      vi.advanceTimersByTime(REGEX_TIMEOUT_MS - 1)
    })
    expect(result.current.status).toBe('evaluating')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.status).toBe('timeout')
    // Explicitly not a silent empty result.
    expect(result.current.result).toBeNull()
  })

  it('terminates the wedged worker and respawns a replacement', () => {
    renderHook(() => useRegexEvaluation(CATASTROPHIC))
    const wedged = WedgedWorker.instances[0]
    expect(wedged?.postMessage).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(REGEX_TIMEOUT_MS)
    })

    expect(wedged?.terminate).toHaveBeenCalledTimes(1)
    expect(WedgedWorker.instances).toHaveLength(2)
  })

  it('does not re-evaluate a timed-out input when it is restored from persisted state', () => {
    const { result, rerender, unmount } = renderHook((input) => useRegexEvaluation(input), {
      initialProps: CATASTROPHIC,
    })

    act(() => {
      vi.advanceTimersByTime(REGEX_TIMEOUT_MS)
    })
    expect(result.current.status).toBe('timeout')

    const postCallsAfterTimeout = WedgedWorker.instances.reduce(
      (n, w) => n + w.postMessage.mock.calls.length,
      0
    )

    // Re-render with the identical input, as a reload of persisted tool state would.
    rerender({ ...CATASTROPHIC })
    act(() => {
      vi.advanceTimersByTime(REGEX_TIMEOUT_MS * 3)
    })

    expect(result.current.status).toBe('timeout')
    expect(WedgedWorker.instances.reduce((n, w) => n + w.postMessage.mock.calls.length, 0)).toBe(
      postCallsAfterTimeout
    )

    unmount()
  })

  it('evaluates again as soon as the user edits the pattern', () => {
    const { result, rerender } = renderHook((input) => useRegexEvaluation(input), {
      initialProps: CATASTROPHIC,
    })

    act(() => {
      vi.advanceTimersByTime(REGEX_TIMEOUT_MS)
    })
    expect(result.current.status).toBe('timeout')

    rerender({ ...CATASTROPHIC, pattern: 'a+' })
    expect(result.current.status).toBe('evaluating')

    const live = WedgedWorker.instances[WedgedWorker.instances.length - 1]
    const request = live?.postMessage.mock.calls.at(-1)?.[0] as { id: number; args: unknown[] }
    expect(request.args[0]).toMatchObject({ pattern: 'a+' })
  })

  it('resolves an empty pattern on the main thread without touching the worker', () => {
    const { result } = renderHook(() =>
      useRegexEvaluation({ pattern: '', flags: 'g', text: 'abc', replacement: '' })
    )

    expect(result.current.status).toBe('ready')
    expect(result.current.result?.replaceResult).toBe('abc')
    expect(WedgedWorker.instances).toHaveLength(0)
  })

  it('ignores a reply that arrives after its request was superseded', () => {
    const { result, rerender } = renderHook((input) => useRegexEvaluation(input), {
      initialProps: { pattern: 'a', flags: 'g', text: 'aaa', replacement: '' },
    })

    const worker = WedgedWorker.instances[0]
    const staleId = (worker?.postMessage.mock.calls[0]?.[0] as { id: number }).id

    rerender({ pattern: 'b', flags: 'g', text: 'aaa', replacement: '' })

    act(() => {
      worker?.onmessage?.({
        data: { id: staleId, result: { matches: [{ full: 'stale' }] } },
      } as MessageEvent)
    })

    expect(result.current.status).toBe('evaluating')
  })

  it('ignores a reply that lands after its own request timed out', () => {
    const { result } = renderHook(() => useRegexEvaluation(CATASTROPHIC))
    const worker = WedgedWorker.instances[0]
    const requestId = (worker?.postMessage.mock.calls[0]?.[0] as { id: number }).id

    act(() => {
      vi.advanceTimersByTime(REGEX_TIMEOUT_MS)
    })
    expect(result.current.status).toBe('timeout')

    // `terminate()` does not cancel a reply already queued as a task on this thread, so a
    // match that finished just under the wire can still be delivered afterwards. It must
    // not resurrect a `ready` state for an input now recorded as timed out.
    act(() => {
      worker?.onmessage?.({
        data: { id: requestId, result: { matches: [{ full: 'late' }] } },
      } as MessageEvent)
    })

    expect(result.current.status).toBe('timeout')
    expect(result.current.result).toBeNull()
  })

  it('terminates the worker on unmount', () => {
    const { unmount } = renderHook(() => useRegexEvaluation(CATASTROPHIC))
    const worker = WedgedWorker.instances[0]

    unmount()

    expect(worker?.terminate).toHaveBeenCalledTimes(1)
  })
})
