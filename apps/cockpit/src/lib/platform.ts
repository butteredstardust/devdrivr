export type Platform = 'mac' | 'windows' | 'linux'

export function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('win')) return 'windows'
  return 'linux'
}

export function getModKey(platform: Platform): string {
  return platform === 'mac' ? 'Cmd' : 'Ctrl'
}

export function getModKeySymbol(platform: Platform): string {
  return platform === 'mac' ? '⌘' : 'Ctrl'
}
