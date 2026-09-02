import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_THEMES,
  THEME_TRANSITION_CLASS,
  THEME_TRANSITION_MS,
  getEffectiveTheme,
  setThemeClass,
} from '../theme'

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

describe('setThemeClass', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.documentElement.className = 'midnight'
  })

  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.className = ''
  })

  const html = () => document.documentElement

  it('swaps the theme class, leaving no previous theme behind', () => {
    setThemeClass('dracula')
    const applied = ALL_THEMES.filter((t) => html().classList.contains(t))
    expect(applied).toEqual(['dracula'])
  })

  it('arms the cross-fade class for the length of the change and then removes it', () => {
    setThemeClass('dracula')
    expect(html().classList.contains(THEME_TRANSITION_CLASS)).toBe(true)

    // Still armed while the fade is in flight — removing it early would cut the
    // transition off mid-way and produce the snap it exists to avoid.
    vi.advanceTimersByTime(THEME_TRANSITION_MS)
    expect(html().classList.contains(THEME_TRANSITION_CLASS)).toBe(true)

    vi.advanceTimersByTime(1000)
    expect(html().classList.contains(THEME_TRANSITION_CLASS)).toBe(false)
  })

  it('does not fade when the theme is already applied', () => {
    // The settings store calls applyTheme() at boot with the theme index.html
    // has already restored, so this is the launch path.
    setThemeClass('midnight')
    expect(html().classList.contains(THEME_TRANSITION_CLASS)).toBe(false)
  })

  it('keeps one pending cleanup across rapid previews', () => {
    setThemeClass('dracula')
    vi.advanceTimersByTime(200)
    setThemeClass('nord')
    // The first switch's cleanup must not strip the class out from under the
    // second one — arrowing through the theme picker fires these back to back.
    vi.advanceTimersByTime(200)
    expect(html().classList.contains(THEME_TRANSITION_CLASS)).toBe(true)

    vi.advanceTimersByTime(1000)
    expect(html().classList.contains(THEME_TRANSITION_CLASS)).toBe(false)
  })
})
