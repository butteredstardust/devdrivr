import { useEffect, useMemo } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getEffectiveTheme } from '@/lib/theme'
import { loader } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

// Pre-built Monaco theme JSONs (sourced from monaco-themes package, stored locally)
import draculaTheme from '@/lib/editor-themes/dracula.json'
import monokaiTheme from '@/lib/editor-themes/monokai.json'
import nordTheme from '@/lib/editor-themes/nord.json'
import nightOwlTheme from '@/lib/editor-themes/night-owl.json'
import githubDarkTheme from '@/lib/editor-themes/github-dark.json'
import githubLightTheme from '@/lib/editor-themes/github-light.json'
import solarizedDarkTheme from '@/lib/editor-themes/solarized-dark.json'
import solarizedLightTheme from '@/lib/editor-themes/solarized-light.json'
import tomorrowNightTheme from '@/lib/editor-themes/tomorrow-night.json'
import oceanicNextTheme from '@/lib/editor-themes/oceanic-next.json'

type MonacoThemeData = editor.IStandaloneThemeData

/** App themes backed by a pre-built monaco-themes JSON with full token rules. */
const MONACO_PACKAGE_THEMES: Record<string, { data: MonacoThemeData; monacoId: string }> = {
  dracula: { data: draculaTheme as MonacoThemeData, monacoId: 'dracula' },
  monokai: { data: monokaiTheme as MonacoThemeData, monacoId: 'monokai' },
  nord: { data: nordTheme as MonacoThemeData, monacoId: 'nord' },
  'night-owl': { data: nightOwlTheme as MonacoThemeData, monacoId: 'night-owl' },
  'github-dark': { data: githubDarkTheme as MonacoThemeData, monacoId: 'github-dark' },
  'github-light': { data: githubLightTheme as MonacoThemeData, monacoId: 'github-light' },
  'solarized-dark': { data: solarizedDarkTheme as MonacoThemeData, monacoId: 'solarized-dark' },
  'solarized-light': { data: solarizedLightTheme as MonacoThemeData, monacoId: 'solarized-light' },
  'tomorrow-night': { data: tomorrowNightTheme as MonacoThemeData, monacoId: 'tomorrow-night' },
  'oceanic-next': { data: oceanicNextTheme as MonacoThemeData, monacoId: 'oceanic-next' },
}

// App themes (original 12) where Monaco should use a light (vs) base for cockpit-current
const LIGHT_APP_THEMES = new Set<string>(['soft-focus', 'tokyo-night-light', 'catppuccin-latte'])

// Static fallback themes — used when the user explicitly picks cockpit-dark or cockpit-light
const DARK_THEME: MonacoThemeData = {
  base: 'vs-dark',
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

const LIGHT_THEME: MonacoThemeData = {
  base: 'vs',
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
const EMPTY_OVERRIDES: Record<string, unknown> = {}

/** Convert an rgb()/rgba() string returned by getComputedStyle to a Monaco-compatible hex */
function rgbToMonacoHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m || !m[1] || !m[2] || !m[3]) return '#808080'
  return '#' + [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('')
}

/**
 * Resolve a CSS custom property to a hex color by temporarily injecting a DOM element
 * so that theme-class vars on <html> resolve correctly via inheritance.
 */
function getCssColor(varName: string): string {
  const tmp = document.createElement('div')
  tmp.style.color = `var(${varName})`
  tmp.style.position = 'absolute'
  tmp.style.opacity = '0'
  tmp.style.pointerEvents = 'none'
  document.body.appendChild(tmp)
  const computed = window.getComputedStyle(tmp).color
  document.body.removeChild(tmp)
  return rgbToMonacoHex(computed)
}

/**
 * Build a Monaco theme from the current app CSS custom properties.
 * Used for the original 12 app themes that don't have a pre-built JSON.
 */
function buildCockpitTheme(isLight: boolean): MonacoThemeData {
  const bg = getCssColor('--color-surface')
  const fg = getCssColor('--color-text')
  const muted = getCssColor('--color-text-muted')
  const accent = getCssColor('--color-accent')
  const raised = getCssColor('--color-surface-raised')
  return {
    base: isLight ? 'vs' : 'vs-dark',
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

function resolveMonacoTheme(appTheme: string, editorTheme: string): string {
  if (editorTheme === 'cockpit-dark') return 'cockpit-dark'
  if (editorTheme === 'cockpit-light') return 'cockpit-light'
  // match-app: use the pre-built package theme if available, otherwise cockpit-current
  const pkg = MONACO_PACKAGE_THEMES[appTheme]
  return pkg ? pkg.monacoId : 'cockpit-current'
}

export function useMonacoSettings() {
  const theme = useSettingsStore((s) => s.theme)
  const editorTheme = useSettingsStore((s) => s.editorTheme)
  const editorFontSize = useSettingsStore((s) => s.editorFontSize)
  const editorFont = useSettingsStore((s) => s.editorFont)
  const defaultIndentSize = useSettingsStore((s) => s.defaultIndentSize)
  const formatOnPaste = useSettingsStore((s) => s.formatOnPaste)

  const effective = getEffectiveTheme(theme)
  const resolvedTheme = resolveMonacoTheme(effective, editorTheme)

  useEffect(() => {
    let cancelled = false

    loader.init().then(async (monaco) => {
      if (!themesRegistered) {
        monaco.editor.defineTheme('cockpit-dark', DARK_THEME)
        monaco.editor.defineTheme('cockpit-light', LIGHT_THEME)
        // Pre-register all package themes once
        for (const { data, monacoId } of Object.values(MONACO_PACKAGE_THEMES)) {
          monaco.editor.defineTheme(monacoId, data)
        }
        themesRegistered = true
      }

      if (resolvedTheme === 'cockpit-current') {
        // Redefine from CSS vars on every app theme change
        const isLight = LIGHT_APP_THEMES.has(effective)
        monaco.editor.defineTheme('cockpit-current', buildCockpitTheme(isLight))
      }

      monaco.editor.setTheme(resolvedTheme)

      try {
        await document.fonts?.ready
      } catch {
        // Font readiness can reject in constrained webview environments. Monaco still
        // falls back to its current measurements in that case.
      }

      if (!cancelled && typeof monaco.editor.remeasureFonts === 'function') {
        monaco.editor.remeasureFonts()
      }
    })
    return () => {
      cancelled = true
    }
  }, [resolvedTheme, effective, editorFont])

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

export function useMonacoOptions(overrides: Record<string, unknown> = EMPTY_OVERRIDES) {
  const settings = useMonacoSettings()

  return useMemo(
    () => ({
      ...EDITOR_OPTIONS,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      lineHeight: Math.max(20, Math.ceil(settings.fontSize * 1.5)),
      tabSize: settings.tabSize,
      formatOnPaste: settings.formatOnPaste,
      ...overrides,
    }),
    [settings.fontSize, settings.fontFamily, settings.tabSize, settings.formatOnPaste, overrides]
  )
}

/**
 * Base Monaco editor options shared across all tools.
 */
export const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  wordWrap: 'on' as const,
  padding: { top: 12, bottom: 12 },
} as const
