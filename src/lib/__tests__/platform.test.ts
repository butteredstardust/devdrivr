import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectPlatform, getModKey, getModKeySymbol, _resetPlatformCache } from '../platform'

describe('detectPlatform', () => {
  afterEach(() => {
    _resetPlatformCache()
    vi.unstubAllGlobals()
  })

  it('returns mac for macOS user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
    expect(detectPlatform()).toBe('mac')
  })

  it('returns windows for Windows user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
    expect(detectPlatform()).toBe('windows')
  })

  it('returns linux for Linux user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
    expect(detectPlatform()).toBe('linux')
  })
})

describe('getModKey', () => {
  it('returns Cmd for mac', () => {
    expect(getModKey('mac')).toBe('Cmd')
  })

  it('returns Ctrl for windows', () => {
    expect(getModKey('windows')).toBe('Ctrl')
  })
})

describe('getModKeySymbol', () => {
  it('returns ⌘ for mac', () => {
    expect(getModKeySymbol('mac')).toBe('⌘')
  })

  it('returns Ctrl for windows', () => {
    expect(getModKeySymbol('windows')).toBe('Ctrl')
  })
})
