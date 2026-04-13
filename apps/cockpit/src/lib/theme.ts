import type { Theme } from '@/types/models'

export type EffectiveTheme = Exclude<Theme, 'system'>

export const ALL_THEMES: EffectiveTheme[] = [
  'midnight',
  'warm-terminal',
  'neon-brutalist',
  'earth-code',
  'cyber-luxe',
  'soft-focus',
  'tokyo-night',
  'tokyo-night-light',
  'catppuccin-latte',
  'catppuccin-frappe',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  'dracula',
  'monokai',
  'nord',
  'night-owl',
  'github-dark',
  'github-light',
  'solarized-dark',
  'solarized-light',
  'tomorrow-night',
  'oceanic-next',
]

/** Short status-bar labels (≤6 chars) and full display names for each theme. */
export const THEME_META: Record<EffectiveTheme, { shortLabel: string; fullLabel: string }> = {
  midnight: { shortLabel: 'Mid', fullLabel: 'Midnight Interface' },
  'warm-terminal': { shortLabel: 'Warm', fullLabel: 'Warm Terminal' },
  'neon-brutalist': { shortLabel: 'Neon', fullLabel: 'Neon Brutalist' },
  'earth-code': { shortLabel: 'Earth', fullLabel: 'Earth & Code' },
  'cyber-luxe': { shortLabel: 'Cyber', fullLabel: 'Cyber Luxe' },
  'soft-focus': { shortLabel: 'Soft', fullLabel: 'Soft Focus' },
  'tokyo-night': { shortLabel: 'Tokyo', fullLabel: 'Tokyo Night' },
  'tokyo-night-light': { shortLabel: 'TkyoL', fullLabel: 'Tokyo Night Light' },
  'catppuccin-latte': { shortLabel: 'CppLt', fullLabel: 'Catppuccin Latte' },
  'catppuccin-frappe': { shortLabel: 'CppFr', fullLabel: 'Catppuccin Frappé' },
  'catppuccin-macchiato': { shortLabel: 'CppMc', fullLabel: 'Catppuccin Macchiato' },
  'catppuccin-mocha': { shortLabel: 'CppMo', fullLabel: 'Catppuccin Mocha' },
  dracula: { shortLabel: 'Drac', fullLabel: 'Dracula' },
  monokai: { shortLabel: 'Mono', fullLabel: 'Monokai' },
  nord: { shortLabel: 'Nord', fullLabel: 'Nord' },
  'night-owl': { shortLabel: 'Owl', fullLabel: 'Night Owl' },
  'github-dark': { shortLabel: 'GH', fullLabel: 'GitHub Dark' },
  'github-light': { shortLabel: 'GHLt', fullLabel: 'GitHub Light' },
  'solarized-dark': { shortLabel: 'SolD', fullLabel: 'Solarized Dark' },
  'solarized-light': { shortLabel: 'SolL', fullLabel: 'Solarized Light' },
  'tomorrow-night': { shortLabel: 'Tmrw', fullLabel: 'Tomorrow Night' },
  'oceanic-next': { shortLabel: 'Ocen', fullLabel: 'Oceanic Next' },
}

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
  try {
    localStorage.setItem('theme-cache', effective)
  } catch {
    /* intentional — localStorage may be unavailable */
  }
}
