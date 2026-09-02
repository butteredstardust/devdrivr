import { describe, it, expect } from 'vitest'
import { assignStateKeys, stateKeyFor } from '@/lib/tab-state-key'

describe('stateKeyFor', () => {
  it('gives the bare tool id to the only tab of a tool', () => {
    expect(stateKeyFor([], 'json-tools', 'a')).toBe('json-tools')
  })

  it('scopes the key once another tab holds the bare one', () => {
    const tabs = [{ id: 'a', toolId: 'json-tools', stateKey: 'json-tools' }]
    expect(stateKeyFor(tabs, 'json-tools', 'b')).toBe('json-tools#b')
  })

  it('does not count the tab being keyed as its own competitor', () => {
    const tabs = [{ id: 'a', toolId: 'json-tools', stateKey: 'json-tools' }]
    expect(stateKeyFor(tabs, 'json-tools', 'a')).toBe('json-tools')
  })

  it('leaves other tools alone', () => {
    const tabs = [{ id: 'a', toolId: 'json-tools', stateKey: 'json-tools' }]
    expect(stateKeyFor(tabs, 'base64', 'b')).toBe('base64')
  })
})

describe('assignStateKeys', () => {
  it('gives the leftmost tab of each tool the state it already had', () => {
    const keyed = assignStateKeys([
      { id: 'a', toolId: 'json-tools' },
      { id: 'b', toolId: 'json-tools' },
      { id: 'c', toolId: 'base64' },
    ])

    expect(keyed.map((t) => t.stateKey)).toEqual(['json-tools', 'json-tools#b', 'base64'])
  })

  it('keeps keys that were already assigned', () => {
    const keyed = assignStateKeys([
      { id: 'a', toolId: 'json-tools', stateKey: 'json-tools#a' },
      { id: 'b', toolId: 'json-tools' },
    ])

    // The first tab kept its scoped key, so the bare one is still free.
    expect(keyed.map((t) => t.stateKey)).toEqual(['json-tools#a', 'json-tools'])
  })
})
