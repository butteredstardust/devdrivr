import type { Theme } from '@/types/models'

export type EffectiveTheme = Exclude<Theme, 'system'>

export const ALL_THEMES: EffectiveTheme[] = [
  'midnight',
  'warm-terminal',
  'neon-brutalist',
  'earth-code',
  'cyber-luxe',
  'soft-focus',
]

export function getEffectiveTheme(theme: Theme): EffectiveTheme {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'midnight' : 'soft-focus'
  }
  return theme as EffectiveTheme
}

export function applyTheme(theme: Theme): void {
  const effective = getEffectiveTheme(theme)
  const html = document.documentElement
  html.classList.remove(...ALL_THEMES)
  html.classList.add(effective)
  try { localStorage.setItem('theme-cache', effective) } catch { }
}
