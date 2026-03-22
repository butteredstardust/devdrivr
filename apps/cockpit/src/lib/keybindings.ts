import { detectPlatform } from '@/lib/platform'

export type KeyCombo = {
  key: string
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  const platform = detectPlatform()
  const modKey = platform === 'mac' ? event.metaKey : event.ctrlKey

  if (combo.mod && !modKey) return false
  if (!combo.mod && modKey) return false
  if (combo.shift && !event.shiftKey) return false
  if (!combo.shift && event.shiftKey) return false
  if (combo.alt && !event.altKey) return false
  if (!combo.alt && event.altKey) return false

  return event.key.toLowerCase() === combo.key.toLowerCase()
}

export function formatCombo(combo: KeyCombo, modSymbol: string): string {
  const parts: string[] = []
  if (combo.mod) parts.push(modSymbol)
  if (combo.shift) parts.push('Shift')
  if (combo.alt) parts.push('Alt')
  parts.push(combo.key.toUpperCase())
  return parts.join('+')
}
