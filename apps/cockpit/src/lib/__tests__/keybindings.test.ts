import { describe, expect, it, vi } from 'vitest'
import { matchesCombo, formatCombo } from '../keybindings'

// Mock platform as mac for consistent tests
vi.mock('../platform', () => ({
  detectPlatform: () => 'mac' as const,
}))

describe('matchesCombo', () => {
  function makeEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      key: '',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    } as KeyboardEvent
  }

  it('matches simple mod+key combo on mac', () => {
    const event = makeEvent({ key: 'k', metaKey: true })
    expect(matchesCombo(event, { key: 'k', mod: true })).toBe(true)
  })

  it('rejects when mod not pressed', () => {
    const event = makeEvent({ key: 'k', metaKey: false })
    expect(matchesCombo(event, { key: 'k', mod: true })).toBe(false)
  })

  it('matches mod+shift+key', () => {
    const event = makeEvent({ key: 'n', metaKey: true, shiftKey: true })
    expect(matchesCombo(event, { key: 'n', mod: true, shift: true })).toBe(true)
  })

  it('rejects extra shift modifier', () => {
    const event = makeEvent({ key: 'k', metaKey: true, shiftKey: true })
    expect(matchesCombo(event, { key: 'k', mod: true })).toBe(false)
  })

  it('rejects extra alt modifier', () => {
    const event = makeEvent({ key: 'k', metaKey: true, altKey: true })
    expect(matchesCombo(event, { key: 'k', mod: true })).toBe(false)
  })

  it('matches mod+alt+key when alt specified', () => {
    const event = makeEvent({ key: 'k', metaKey: true, altKey: true })
    expect(matchesCombo(event, { key: 'k', mod: true, alt: true })).toBe(true)
  })
})

describe('formatCombo', () => {
  it('formats mod+key', () => {
    expect(formatCombo({ key: 'k', mod: true }, '⌘')).toBe('⌘+K')
  })

  it('formats mod+shift+key', () => {
    expect(formatCombo({ key: 'n', mod: true, shift: true }, '⌘')).toBe('⌘+Shift+N')
  })
})
