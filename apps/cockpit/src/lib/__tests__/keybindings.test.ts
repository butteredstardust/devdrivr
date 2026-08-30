import { beforeEach, describe, expect, it, vi } from 'vitest'
import { matchesCombo, formatCombo } from '../keybindings'

const platform = vi.hoisted(() => ({ current: 'mac' as 'mac' | 'windows' }))

vi.mock('../platform', () => ({
  detectPlatform: () => platform.current,
}))

beforeEach(() => {
  platform.current = 'mac'
})

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

  it('requires Control independently from the macOS modifier', () => {
    const combo = { key: 'f', mod: true, ctrl: true }
    expect(matchesCombo(makeEvent({ key: 'f', metaKey: true, ctrlKey: true }), combo)).toBe(true)
    expect(matchesCombo(makeEvent({ key: 'f', metaKey: true }), combo)).toBe(false)
  })

  it('rejects an unexpected Control modifier on macOS', () => {
    const event = makeEvent({ key: 'k', metaKey: true, ctrlKey: true })
    expect(matchesCombo(event, { key: 'k', mod: true })).toBe(false)
  })

  it('matches an explicit Control-only combo on Windows', () => {
    platform.current = 'windows'
    const event = makeEvent({ key: 'Tab', ctrlKey: true })
    expect(matchesCombo(event, { key: 'Tab', ctrl: true })).toBe(true)
  })
})

describe('formatCombo', () => {
  it('formats mod+key', () => {
    expect(formatCombo({ key: 'k', mod: true }, '⌘')).toBe('⌘+K')
  })

  it('formats mod+shift+key', () => {
    expect(formatCombo({ key: 'n', mod: true, shift: true }, '⌘')).toBe('⌘+Shift+N')
  })

  it('formats Control separately from the platform modifier', () => {
    expect(formatCombo({ key: 'f', mod: true, ctrl: true }, '⌘')).toBe('Ctrl+⌘+F')
  })
})
