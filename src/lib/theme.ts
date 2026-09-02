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
  'inked',
  'urban-nocturne',
  'amethyst-haze',
  'lapis-velvet',
  'amethyst-mint',
  'fireside',
  'marina',
  'pearl',
  'yacht-club',
]

const LIGHT_EFFECTIVE_THEMES = new Set<EffectiveTheme>([
  'soft-focus',
  'tokyo-night-light',
  'catppuccin-latte',
  'github-light',
  'solarized-light',
  'marina',
  'pearl',
  'yacht-club',
])

export function isLightEffectiveTheme(theme: EffectiveTheme): boolean {
  return LIGHT_EFFECTIVE_THEMES.has(theme)
}

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
  inked: { shortLabel: 'Inked', fullLabel: 'Inked' },
  'urban-nocturne': { shortLabel: 'Urban', fullLabel: 'Urban Nocturne' },
  'amethyst-haze': { shortLabel: 'Amthy', fullLabel: 'Amethyst Haze' },
  'lapis-velvet': { shortLabel: 'Lapis', fullLabel: 'Lapis Velvet' },
  'amethyst-mint': { shortLabel: 'Mint', fullLabel: 'Amethyst Mint' },
  fireside: { shortLabel: 'Fire', fullLabel: 'Fireside' },
  marina: { shortLabel: 'Marina', fullLabel: 'Marina' },
  pearl: { shortLabel: 'Pearl', fullLabel: 'Pearl' },
  'yacht-club': { shortLabel: 'Yacht', fullLabel: 'Yacht Club' },
}

export function getEffectiveTheme(theme: Theme): EffectiveTheme {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'midnight' : 'soft-focus'
  }
  return theme
}

/** Class that arms the whole-window colour cross-fade. Defined in index.css. */
export const THEME_TRANSITION_CLASS = 'theme-transition'

/**
 * Mirrors `--duration-theme` in src/styles/tokens.css. The class has to be
 * removed on a timer (there is no transitionend for "all of them"), so the
 * duration exists in both places; tokens.test.ts asserts the two agree.
 */
export const THEME_TRANSITION_MS = 260

/** Grace period before the class comes off, so the last frame isn't cut short. */
const THEME_TRANSITION_CLEANUP_MS = THEME_TRANSITION_MS + 60

let transitionTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Swaps the theme class on <html>, cross-fading into it.
 *
 * A no-op when `effective` is already applied — which is the case for the
 * settings store's first applyTheme() at boot, since index.html has already
 * restored the cached class synchronously. Without that check every launch
 * would open with a 260ms fade from nothing in particular.
 */
export function setThemeClass(effective: EffectiveTheme): void {
  const html = document.documentElement
  if (html.classList.contains(effective)) return

  html.classList.add(THEME_TRANSITION_CLASS)
  html.classList.remove(...ALL_THEMES)
  html.classList.add(effective)

  // Re-armed rather than stacked, so arrowing through the theme picker leaves
  // exactly one pending cleanup however fast the previews change.
  if (transitionTimer !== undefined) clearTimeout(transitionTimer)
  transitionTimer = setTimeout(() => {
    transitionTimer = undefined
    html.classList.remove(THEME_TRANSITION_CLASS)
  }, THEME_TRANSITION_CLEANUP_MS)
}

export function applyTheme(theme: Theme): void {
  const effective = getEffectiveTheme(theme)
  setThemeClass(effective)
  try {
    localStorage.setItem('theme-cache', effective)
  } catch {
    /* intentional — localStorage may be unavailable */
  }
}
