import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getEffectiveTheme } from '@/lib/theme'

import { loader } from '@monaco-editor/react'

// Themes where Monaco should use a light (vs) base
const LIGHT_APP_THEMES = new Set<string>(['soft-focus', 'tokyo-night-light', 'catppuccin-latte'])

// Static fallback themes — used when the user explicitly picks cockpit-dark or cockpit-light
const DARK_THEME = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1a1a1a',
    'editor.foreground': '#e0e0e0',
    'editorLineNumber.foreground': '#555555',
    'editor.selectionBackground': '#39ff1433',
    'editor.lineHighlightBackground': '#252525',
    'editorCursor.foreground': '#39ff14',
  },
}

const LIGHT_THEME = {
  base: 'vs' as const,
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1a1a1a',
    'editorLineNumber.foreground': '#999999',
    'editor.selectionBackground': '#00875a33',
    'editor.lineHighlightBackground': '#f0eee6',
    'editorCursor.foreground': '#00875a',
  },
}

let themesRegistered = false

/** Convert an rgb()/rgba() string returned by getComputedStyle to a Monaco-compatible hex */
function rgbToMonacoHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m || !m[1] || !m[2] || !m[3]) return '#808080'
  return '#' + [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('')
}

/**
 * Resolve a CSS custom property to a hex color.
 * Appends a temporary element to the body so that theme-class CSS vars on <html> resolve correctly.
 */
function getCssColor(varName: string): string {
  const tmp = document.createElement('div')
  tmp.style.color = `var(${varName})`
  tmp.style.position = 'absolute'
  tmp.style.opacity = '0'
  tmp.style.pointerEvents = 'none'
  document.body.appendChild(tmp)
  const computed = getComputedStyle(tmp).color
  document.body.removeChild(tmp)
  return rgbToMonacoHex(computed)
}

/**
 * Build a Monaco theme definition by reading the current app CSS custom properties.
 * Called every time the app theme changes so editors always reflect the active palette.
 */
function buildCockpitTheme(isLight: boolean) {
  const bg = getCssColor('--color-surface')
  const fg = getCssColor('--color-text')
  const muted = getCssColor('--color-text-muted')
  const accent = getCssColor('--color-accent')
  const raised = getCssColor('--color-surface-raised')
  return {
    base: (isLight ? 'vs' : 'vs-dark') as 'vs' | 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editorLineNumber.foreground': muted,
      'editor.selectionBackground': accent + '33',
      'editor.lineHighlightBackground': raised,
      'editorCursor.foreground': accent,
    },
  }
}

function resolveMonacoTheme(editorTheme: string): string {
  if (editorTheme === 'cockpit-dark') return 'cockpit-dark'
  if (editorTheme === 'cockpit-light') return 'cockpit-light'
  // 'match-app': use a dynamic theme that tracks the active app palette
  return 'cockpit-current'
}

export function useMonacoSettings() {
  const theme = useSettingsStore((s) => s.theme)
  const editorTheme = useSettingsStore((s) => s.editorTheme)
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const editorFont = useSettingsStore((s) => s.editorFont)
  const defaultIndentSize = useSettingsStore((s) => s.defaultIndentSize)
  const formatOnPaste = useSettingsStore((s) => s.formatOnPaste)
  const resolvedTheme = resolveMonacoTheme(editorTheme)

  useEffect(() => {
    loader.init().then((monaco) => {
      if (!themesRegistered) {
        monaco.editor.defineTheme('cockpit-dark', DARK_THEME)
        monaco.editor.defineTheme('cockpit-light', LIGHT_THEME)
        themesRegistered = true
      }
      if (resolvedTheme === 'cockpit-current') {
        // Redefine cockpit-current from CSS vars every time the app theme changes.
        // defineTheme with an existing name updates it in place; setTheme then repaints all editors.
        const effective = getEffectiveTheme(theme)
        const isLight = LIGHT_APP_THEMES.has(effective)
        monaco.editor.defineTheme('cockpit-current', buildCockpitTheme(isLight))
      }
      monaco.editor.setTheme(resolvedTheme)
    })
    // `theme` is included so the effect re-runs when the app theme changes while editorTheme
    // stays 'match-app' (resolvedTheme stays 'cockpit-current' and never changes on its own)
  }, [resolvedTheme, theme])

  return {
    theme: resolvedTheme,
    fontSize: editorFontSize,
    fontFamily: editorFont,
    tabSize: defaultIndentSize,
    formatOnPaste,
  }
}

export function useMonacoTheme(): string {
  const { theme } = useMonacoSettings()
  return theme
}

export function useMonacoOptions(overrides: Record<string, unknown> = {}) {
  const settings = useMonacoSettings()

  return {
    ...EDITOR_OPTIONS,
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    tabSize: settings.tabSize,
    formatOnPaste: settings.formatOnPaste,
    ...overrides,
  }
}

/**
 * Base Monaco editor options shared across all tools.
 */
export const EDITOR_OPTIONS = {
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  wordWrap: 'on' as const,
  padding: { top: 12, bottom: 12 },
} as const
