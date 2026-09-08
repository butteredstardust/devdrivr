import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimPendingToolAction,
  clearPendingToolActions,
  dispatchToolAction,
  queueToolAction,
  subscribePendingToolAction,
  subscribeToolAction,
  type ToolAction,
} from '../tool-actions'

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

describe('queued tool actions', () => {
  const file: ToolAction = { type: 'open-file', content: '{}', filename: 'a.json' }

  beforeEach(() => {
    clearPendingToolActions()
  })

  it('waits for the addressed tab to claim it', () => {
    queueToolAction('json-tools', file)

    expect(claimPendingToolAction('csv-tools')).toBeNull()
    expect(claimPendingToolAction('json-tools')).toEqual(file)
  })

  it('runs once', () => {
    queueToolAction('json-tools', file)

    expect(claimPendingToolAction('json-tools')).toEqual(file)
    expect(claimPendingToolAction('json-tools')).toBeNull()
  })

  it('keeps one action per tab', () => {
    queueToolAction('json-tools', file)
    queueToolAction('csv-tools', { type: 'open-file', content: 'a,b', filename: 'b.csv' })

    expect(claimPendingToolAction('json-tools')).toEqual(file)
    expect(claimPendingToolAction('csv-tools')).toMatchObject({ filename: 'b.csv' })
  })

  it('replaces an unclaimed action for the same tab', () => {
    queueToolAction('json-tools', file)
    queueToolAction('json-tools', { type: 'open-file', content: '[]', filename: 'c.json' })

    expect(claimPendingToolAction('json-tools')).toMatchObject({ filename: 'c.json' })
  })

  it('notifies mounted tabs that something is waiting', () => {
    const listener = vi.fn()
    const unsub = subscribePendingToolAction(listener)

    queueToolAction('json-tools', file)

    expect(listener).toHaveBeenCalledOnce()
    unsub()
    queueToolAction('json-tools', file)
    expect(listener).toHaveBeenCalledOnce()
  })
})
