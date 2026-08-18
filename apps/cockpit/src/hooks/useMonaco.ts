import { useEffect, useMemo } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getEffectiveTheme, isLightEffectiveTheme } from '@/lib/theme'
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

/**
 * Convert an rgb()/rgba() string returned by getComputedStyle to a Monaco-compatible hex.
 *
 * Several `--color-text-muted` declarations (and `--color-accent-dim`) are semi-transparent
 * tints of another solid colour, e.g. `rgba(45, 52, 54, 0.6)`. Discarding the alpha channel
 * — as this used to do — collapses them onto the *unblended* RGB triple, which can be
 * byte-identical to an unrelated fully-opaque colour (soft-focus's muted text is
 * `rgba(45, 52, 54, 0.6)`, exactly `--color-text`'s RGB with alpha applied). If `compositeBg`
 * is given and the colour isn't fully opaque, this performs standard source-over compositing
 * (`out = a*fg + (1-a)*bg`) to get the colour as it actually renders against that background.
 */
function rgbToMonacoHex(rgb: string, compositeBg?: [number, number, number]): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (!m || !m[1] || !m[2] || !m[3]) return '#808080'
  const r = parseInt(m[1], 10)
  const g = parseInt(m[2], 10)
  const b = parseInt(m[3], 10)
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1
  if (a >= 1 || !compositeBg) {
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
  }
  const [bgR, bgG, bgB] = compositeBg
  const out = [a * r + (1 - a) * bgR, a * g + (1 - a) * bgG, a * b + (1 - a) * bgB]
  return (
    '#' +
    out
      .map((n) =>
        Math.max(0, Math.min(255, Math.round(n)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

/**
 * Resolve a CSS custom property to a hex color by temporarily injecting a DOM element
 * so that theme-class vars on <html> resolve correctly via inheritance.
 *
 * `compositeBg`, when given, is the hex colour to alpha-composite semi-transparent
 * results over (normally the theme's `--color-surface`) so a var like
 * `--color-text-muted: rgba(45, 52, 54, 0.6)` resolves to the grey it actually renders
 * as, not to its undiluted, alpha-stripped RGB triple.
 */
function getCssColor(varName: string, compositeBg?: string): string {
  const tmp = document.createElement('div')
  tmp.style.color = `var(${varName})`
  tmp.style.position = 'absolute'
  tmp.style.opacity = '0'
  tmp.style.pointerEvents = 'none'
  document.body.appendChild(tmp)
  const computed = window.getComputedStyle(tmp).color
  document.body.removeChild(tmp)
  return rgbToMonacoHex(computed, compositeBg ? hexToRgbTuple(compositeBg) : undefined)
}

// ─── Token colour derivation ────────────────────────────────────────────────
// buildCockpitTheme() has no palette of its own — every token colour below is
// read from the same CSS custom properties the rest of the theme already
// uses (via getCssColor), then nudged for contrast if needed. No hex value
// is invented here.

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) || 0
  const g = parseInt(clean.slice(2, 4), 16) || 0
  const b = parseInt(clean.slice(4, 6), 16) || 0
  return [r, g, b]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [sr, sg, sb] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb
}

/** WCAG contrast ratio between two hex colours (1:1 – 21:1). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgbTuple(hexA))
  const lumB = relativeLuminance(hexToRgbTuple(hexB))
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return (lighter + 0.05) / (darker + 0.05)
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0)
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      default:
        h = (rn - gn) / d + 4
    }
    h /= 6
  }
  return [h, s, l]
}

function hueToRgbChannel(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToHex(h: number, s: number, l: number): string {
  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hueToRgbChannel(p, q, h + 1 / 3)
    g = hueToRgbChannel(p, q, h)
    b = hueToRgbChannel(p, q, h - 1 / 3)
  }
  const toByte = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c * 255)))
      .toString(16)
      .padStart(2, '0')
  return '#' + toByte(r) + toByte(g) + toByte(b)
}

/**
 * If `hex` doesn't clear `minRatio` contrast against `bgHex`, push its HSL
 * lightness away from the background's lightness (in 5% steps) until it
 * does, without touching hue or saturation. This is the "adjust lightness
 * rather than invent a palette" fallback for themes whose accent/info/
 * success/warning variables are already close to the surface colour.
 */
function ensureContrast(hex: string, bgHex: string, minRatio = 3): string {
  if (contrastRatio(hex, bgHex) >= minRatio) return hex
  const [r, g, b] = hexToRgbTuple(hex)
  const [h, s, l] = rgbToHsl(r, g, b)
  const [, , bgL] = rgbToHsl(...hexToRgbTuple(bgHex))
  const goLighter = bgL < 0.5
  let adjustedL = l
  let candidate = hex
  for (let i = 0; i < 20; i++) {
    adjustedL = goLighter ? Math.min(1, adjustedL + 0.05) : Math.max(0, adjustedL - 0.05)
    candidate = hslToHex(h, s, adjustedL)
    if (contrastRatio(candidate, bgHex) >= minRatio) return candidate
    if (adjustedL <= 0 || adjustedL >= 1) break
  }
  // Clamped at the extreme lightness available for this hue — best effort.
  return candidate
}

/** Strip the leading '#' for Monaco's IStandaloneThemeData rule format. */
function stripHash(hex: string): string {
  return hex.replace('#', '')
}

/**
 * Ensure `hex` is visibly distinguishable from `referenceHex` (contrast ratio between
 * the two of at least `minRatioVsReference`), while never dropping below
 * `floorRatioVsBg` contrast against `bgHex`.
 *
 * Used for the comment/delimiter colour (derived from `--color-text-muted`), which can
 * still land very close to the identifier colour (derived from `--color-text`) after alpha
 * compositing — e.g. a muted var with alpha near 1, or a theme where muted and text simply
 * share a hue. `referenceHex` (the identifier colour) is normally already at
 * near-maximum contrast from `bgHex` for readability, so narrowing `hex`'s own contrast
 * against `bgHex` — moving its lightness *toward* the background, the opposite direction
 * from `ensureContrast` — is what widens the gap from `referenceHex`, without ever
 * crossing below the surface legibility floor.
 */
function ensureDistinctFrom(
  hex: string,
  referenceHex: string,
  bgHex: string,
  minRatioVsReference = 1.4,
  floorRatioVsBg = 3
): string {
  if (contrastRatio(hex, referenceHex) >= minRatioVsReference) return hex
  const [r, g, b] = hexToRgbTuple(hex)
  const [h, s, l] = rgbToHsl(r, g, b)
  const [, , bgL] = rgbToHsl(...hexToRgbTuple(bgHex))
  const towardBg = bgL >= l ? 1 : -1
  let adjustedL = l
  let candidate = hex
  for (let i = 0; i < 20; i++) {
    adjustedL = Math.max(0, Math.min(1, adjustedL + towardBg * 0.05))
    const next = hslToHex(h, s, adjustedL)
    // Never trade the surface-contrast floor away for separation from the reference.
    if (contrastRatio(next, bgHex) < floorRatioVsBg) break
    candidate = next
    if (contrastRatio(candidate, referenceHex) >= minRatioVsReference) return candidate
    if (adjustedL <= 0 || adjustedL >= 1) break
  }
  // Best effort — either clamped at an extreme lightness or hit the bg-contrast floor.
  return candidate
}

/**
 * Build a Monaco theme from the current app CSS custom properties.
 * Used for the original 12 app themes that don't have a pre-built JSON.
 */
function buildCockpitTheme(isLight: boolean): MonacoThemeData {
  const bg = getCssColor('--color-surface')
  // Every other colour is alpha-composited over `bg` (a no-op for fully-opaque values,
  // which is every one of these vars except --color-text-muted in most themes) so a
  // semi-transparent var resolves to the colour it actually renders as.
  const fg = getCssColor('--color-text', bg)
  const muted = getCssColor('--color-text-muted', bg)
  const accent = getCssColor('--color-accent', bg)
  const raised = getCssColor('--color-surface-raised', bg)
  const info = getCssColor('--color-info', bg)
  const success = getCssColor('--color-success', bg)
  const warning = getCssColor('--color-warning', bg)

  // Every token colour is checked against the editor background and nudged
  // for legibility (~3:1 or better) before it's used in a rule.
  const contrastSafe = (hex: string) => ensureContrast(hex, bg, 3)

  const stringColor = contrastSafe(success)
  const numberColor = contrastSafe(warning)
  const keywordColor = contrastSafe(accent)
  const typeColor = contrastSafe(info)
  // Function/identifier tokens are the bulk of any file's text, so they use
  // the theme's main foreground colour rather than another accent — it's
  // already guaranteed legible against the surface, and keeps identifiers
  // from competing visually with keywords/types.
  const identifierColor = contrastSafe(fg)
  // Comments must additionally be visibly distinct from identifiers — muted-over-bg
  // can still land close to text-over-bg for some themes (e.g. a near-opaque muted
  // tint, or muted/text sharing a hue), so nudge it toward the background if so.
  const commentColor = ensureDistinctFrom(contrastSafe(muted), identifierColor, bg)
  // Delimiters/operators share the (already-distinct) comment colour: both are
  // low-emphasis, structural rather than semantic, in every one of the 12
  // cockpit-native themes' variable sets.
  const operatorColor = commentColor

  const rules: MonacoThemeData['rules'] = [
    { token: 'comment', foreground: stripHash(commentColor), fontStyle: 'italic' },
    { token: 'string', foreground: stripHash(stringColor) },
    { token: 'string.escape', foreground: stripHash(numberColor) },
    { token: 'number', foreground: stripHash(numberColor) },
    { token: 'number.hex', foreground: stripHash(numberColor) },
    { token: 'number.float', foreground: stripHash(numberColor) },
    { token: 'keyword', foreground: stripHash(keywordColor), fontStyle: 'bold' },
    { token: 'keyword.control', foreground: stripHash(keywordColor), fontStyle: 'bold' },
    { token: 'tag', foreground: stripHash(keywordColor) },
    { token: 'type', foreground: stripHash(typeColor) },
    { token: 'type.identifier', foreground: stripHash(typeColor) },
    { token: 'attribute.name', foreground: stripHash(typeColor) },
    { token: 'attribute.value', foreground: stripHash(stringColor) },
    { token: 'identifier', foreground: stripHash(identifierColor) },
    { token: 'identifier.function', foreground: stripHash(identifierColor) },
    { token: 'variable', foreground: stripHash(identifierColor) },
    { token: 'delimiter', foreground: stripHash(operatorColor) },
    { token: 'operator', foreground: stripHash(operatorColor) },
  ]

  return {
    base: isLight ? 'vs' : 'vs-dark',
    inherit: true,
    rules,
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

export { buildCockpitTheme }

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
        // Redefine from CSS vars on every app theme change. Only non-package-backed
        // themes reach here, so isLightEffectiveTheme's package-backed light entries
        // are unreachable — sharing the one list beats keeping a second in sync.
        monaco.editor.defineTheme(
          'cockpit-current',
          buildCockpitTheme(isLightEffectiveTheme(effective))
        )
      }

      monaco.editor.setTheme(resolvedTheme)

      // Force-load the configured font before any editor measures character
      // widths. The @fontsource fonts use font-display:swap, so the browser
      // won't fetch the woff2 until text actually renders with that family.
      // document.fonts.ready resolves instantly when nothing is loading yet,
      // which means remeasureFonts() below would fire before the real font is
      // available — leaving Monaco with stale fallback-font measurements and
      // the cursor offset from click positions by several characters.
      try {
        await document.fonts.load(`400 1em "${editorFont}"`)
      } catch {
        // Font loading can reject in constrained webview environments. Monaco
        // still falls back to its current measurements in that case.
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

export function useMonaco() {
  const settings = useMonacoSettings()

  const options = useMemo(
    () => ({
      ...EDITOR_OPTIONS,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      lineHeight: Math.max(20, Math.ceil(settings.fontSize * 1.5)),
      tabSize: settings.tabSize,
      formatOnPaste: settings.formatOnPaste,
    }),
    [settings.fontSize, settings.fontFamily, settings.tabSize, settings.formatOnPaste]
  )

  return { theme: settings.theme, options }
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
