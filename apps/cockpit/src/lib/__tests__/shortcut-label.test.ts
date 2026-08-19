import { describe, expect, it } from 'vitest'
import { formatShortcut } from '@/lib/shortcut-label'

describe('formatShortcut', () => {
  it('resolves mod per platform', () => {
    expect(formatShortcut('mod+enter', true)).toBe('⌘↵')
    expect(formatShortcut('mod+enter', false)).toBe('Ctrl+Enter')
  })

  it('runs modifiers together on macOS and separates them elsewhere', () => {
    expect(formatShortcut('mod+shift+d', true)).toBe('⌘⇧D')
    expect(formatShortcut('mod+shift+d', false)).toBe('Ctrl+Shift+D')
  })

  it('upper-cases single letters and leaves named keys alone', () => {
    expect(formatShortcut('mod+s', true)).toBe('⌘S')
    expect(formatShortcut('escape', true)).toBe('Esc')
  })

  // The literals this replaced said ⌘ on every platform. A hint that names a key the machine
  // doesn't have is worse than no hint, so this is the regression worth pinning.
  it('never emits the command symbol off macOS', () => {
    for (const combo of ['mod+enter', 'mod+shift+d', 'mod+k', 'mod+o']) {
      expect(formatShortcut(combo, false)).not.toContain('⌘')
    }
  })
})
