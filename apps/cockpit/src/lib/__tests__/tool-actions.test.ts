import { describe, expect, it, vi } from 'vitest'
import { subscribeToolAction, dispatchToolAction, type ToolAction } from '../tool-actions'

describe('tool-actions pub/sub', () => {
  it('dispatches to a subscriber', () => {
    const handler = vi.fn()
    const unsub = subscribeToolAction(handler)

    dispatchToolAction({ type: 'execute' })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ type: 'execute' })
    unsub()
  })

  it('dispatches to multiple subscribers', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = subscribeToolAction(a)
    const unsubB = subscribeToolAction(b)

    dispatchToolAction({ type: 'copy-output' })

    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
    unsubA()
    unsubB()
  })

  it('stops receiving after unsubscribe', () => {
    const handler = vi.fn()
    const unsub = subscribeToolAction(handler)

    unsub()
    dispatchToolAction({ type: 'execute' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('passes action payload through', () => {
    const handler = vi.fn()
    const unsub = subscribeToolAction(handler)

    const action: ToolAction = { type: 'switch-tab', tab: 2 }
    dispatchToolAction(action)

    expect(handler).toHaveBeenCalledWith(action)
    unsub()
  })

  it('handles dispatch with no subscribers', () => {
    // Should not throw
    expect(() => dispatchToolAction({ type: 'execute' })).not.toThrow()
  })
})
