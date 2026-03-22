export type Platform = 'mac' | 'windows' | 'linux'

// Cached at module level since the platform never changes at runtime.
// detectPlatform is called on every keystroke via matchesCombo.
let cachedPlatform: Platform | null = null

export function detectPlatform(): Platform {
  if (cachedPlatform) return cachedPlatform
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) cachedPlatform = 'mac'
  else if (ua.includes('win')) cachedPlatform = 'windows'
  else cachedPlatform = 'linux'
  return cachedPlatform
}

/** @internal Reset cache — only for tests. */
export function _resetPlatformCache(): void {
  cachedPlatform = null
}

export function getModKey(platform: Platform): string {
  return platform === 'mac' ? 'Cmd' : 'Ctrl'
}

export function getModKeySymbol(platform: Platform): string {
  return platform === 'mac' ? '⌘' : 'Ctrl'
}
