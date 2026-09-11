import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_THEMES,
  SYSTEM_DARK_THEME,
  SYSTEM_LIGHT_THEME,
  THEME_TRANSITION_CLASS,
  THEME_TRANSITION_MS,
  getEffectiveTheme,
  isLightEffectiveTheme,
  setThemeClass,
} from '../theme'

describe('getEffectiveTheme', () => {
  it('returns dark when theme is dark', () => {
    expect(getEffectiveTheme('midnight')).toBe('midnight')
  })

  it('returns light when theme is light', () => {
    expect(getEffectiveTheme('soft-focus')).toBe('soft-focus')
  })

  it('returns the dark default when theme is system and prefers dark', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    })
    expect(getEffectiveTheme('system')).toBe('tomorrow-night')
    vi.unstubAllGlobals()
  })

  it('returns the light default when theme is system and prefers light', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    })
    expect(getEffectiveTheme('system')).toBe('tokyo-night-light')
    vi.unstubAllGlobals()
  })

  // The window paints the class on <html> before it reads the theme cache. A disagreement shows
  // as a flash on a first launch, which no test that reads only the module would catch.
  it('matches the class index.html paints first', () => {
    const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8')
    expect(html).toContain(`<html lang="en" class="${SYSTEM_DARK_THEME}">`)
  })

  it('resolves both defaults to real themes', () => {
    expect(ALL_THEMES).toContain(SYSTEM_DARK_THEME)
    expect(ALL_THEMES).toContain(SYSTEM_LIGHT_THEME)
    expect(isLightEffectiveTheme(SYSTEM_LIGHT_THEME)).toBe(true)
    expect(isLightEffectiveTheme(SYSTEM_DARK_THEME)).toBe(false)
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
