import { describe, expect, it, vi } from 'vitest'
import { getEffectiveTheme } from '../theme'

describe('getEffectiveTheme', () => {
  it('returns dark when theme is dark', () => {
    expect(getEffectiveTheme('midnight')).toBe('midnight')
  })

  it('returns light when theme is light', () => {
    expect(getEffectiveTheme('soft-focus')).toBe('soft-focus')
  })

  it('returns midnight when theme is system and prefers dark', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    })
    expect(getEffectiveTheme('system')).toBe('midnight')
    vi.unstubAllGlobals()
  })

  it('returns soft-focus when theme is system and prefers light', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    })
    expect(getEffectiveTheme('system')).toBe('soft-focus')
    vi.unstubAllGlobals()
  })
})
