import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushAll, registerFlusher } from '@/lib/flush-on-exit'

const unregisters: Array<() => void> = []

afterEach(() => {
  unregisters.splice(0).forEach((unregister) => unregister())
  vi.useRealTimers()
})

function register(flusher: () => Promise<void>): () => void {
  const unregister = registerFlusher(flusher)
  unregisters.push(unregister)
  return unregister
}

describe('flush-on-exit', () => {
  it('runs every registered flusher', async () => {
    const first = vi.fn().mockResolvedValue(undefined)
    const second = vi.fn().mockResolvedValue(undefined)
    register(first)
    register(second)

    await flushAll()

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })

  it('waits for other flushers when one rejects', async () => {
    const successful = vi.fn().mockResolvedValue(undefined)
    register(vi.fn().mockRejectedValue(new Error('write failed')))
    register(successful)

    await expect(flushAll()).resolves.toBeUndefined()
    expect(successful).toHaveBeenCalledOnce()
  })

  it('stops waiting for a hanging flusher', async () => {
    vi.useFakeTimers()
    register(() => new Promise<void>(() => {}))

    const flush = flushAll()
    await vi.advanceTimersByTimeAsync(2_000)

    await expect(flush).resolves.toBeUndefined()
  })

  it('does not run an unregistered flusher', async () => {
    const flusher = vi.fn().mockResolvedValue(undefined)
    register(flusher)()

    await flushAll()

    expect(flusher).not.toHaveBeenCalled()
  })
})
