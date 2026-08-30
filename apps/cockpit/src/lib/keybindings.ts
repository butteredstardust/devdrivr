import { detectPlatform } from '@/lib/platform'

export type KeyCombo = {
  key: string
  mod?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  allowInEditable?: boolean
}

export function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  const platform = detectPlatform()
  const modKey = platform === 'mac' ? event.metaKey : event.ctrlKey
  // On Windows/Linux the physical Control key is also the platform's primary modifier. Treat an
  // explicit `ctrl` combo as expecting that key instead of rejecting it as an unwanted `mod`.
  const expectsModKey = Boolean(combo.mod || (combo.ctrl && platform !== 'mac'))

  if (expectsModKey && !modKey) return false
  if (!expectsModKey && modKey) return false
  if (combo.ctrl && !event.ctrlKey) return false
  if (!combo.ctrl && platform === 'mac' && event.ctrlKey) return false
  if (combo.shift && !event.shiftKey) return false
  if (!combo.shift && event.shiftKey) return false
  if (combo.alt && !event.altKey) return false
  if (!combo.alt && event.altKey) return false

  return event.key.toLowerCase() === combo.key.toLowerCase()
}

export function formatCombo(combo: KeyCombo, modSymbol: string): string {
  const parts: string[] = []
  if (combo.ctrl) parts.push('Ctrl')
  if (combo.mod) parts.push(modSymbol)
  if (combo.shift) parts.push('Shift')
  if (combo.alt) parts.push('Alt')
  parts.push(combo.key.toUpperCase())
  return parts.join('+')
}
