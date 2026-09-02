import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// WCAG 2.1 AA minimum contrast ratio for normal text.
const AA_MIN_CONTRAST = 4.5

type RGB = { r: number; g: number; b: number; a: number }

/**
 * Parses a CSS color value into RGBA components. Supports the two forms
 * used in tokens.css: 6-digit hex (`#rrggbb`) and `rgba(r, g, b, a)`.
 */
function parseColor(value: string): RGB {
  const trimmed = value.trim()

  const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(trimmed)
  if (hexMatch?.[1]) {
    const hex = hexMatch[1]
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    }
  }

  const rgbaMatch =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(trimmed)
  if (rgbaMatch?.[1] && rgbaMatch[2] && rgbaMatch[3]) {
    return {
      r: parseFloat(rgbaMatch[1]),
      g: parseFloat(rgbaMatch[2]),
      b: parseFloat(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    }
  }

  throw new Error(`Unrecognized color format: "${value}"`)
}

/** Composites a (possibly translucent) foreground color over an opaque backdrop. */
function flattenOverBackdrop(fg: RGB, backdrop: RGB): RGB {
  return {
    r: fg.r * fg.a + backdrop.r * (1 - fg.a),
    g: fg.g * fg.a + backdrop.g * (1 - fg.a),
    b: fg.b * fg.a + backdrop.b * (1 - fg.a),
    a: 1,
  }
}

/** WCAG 2.1 relative luminance from sRGB channel values (0-255). */
function relativeLuminance({ r, g, b }: RGB): number {
  const toLinear = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const rl = toLinear(r)
  const gl = toLinear(g)
  const bl = toLinear(b)
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

/** WCAG 2.1 contrast ratio between two opaque colors. */
function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Computes the AA contrast ratio of a (possibly translucent) muted-text color over a backdrop. */
function contrastAgainst(mutedRaw: string, backdropRaw: string): number {
  const muted = parseColor(mutedRaw)
  const backdrop = parseColor(backdropRaw)
  const flattened = flattenOverBackdrop(muted, backdrop)
  return contrastRatio(flattened, backdrop)
}

type ThemeTokens = {
  name: string
  textMuted: string
  surface: string
  bg: string
}

function parseThemes(css: string): ThemeTokens[] {
  // Match every top-level class block: `.theme-name { ...declarations... }`.
  // tokens.css only nests one level (no `.theme :hover { ... }` etc.), so a
  // non-greedy match up to the next `}` correctly captures each block.
  const blockPattern = /\.([a-z0-9-]+)\s*\{([^}]*)\}/g
  const themes: ThemeTokens[] = []

  let match: RegExpExecArray | null
  while ((match = blockPattern.exec(css)) !== null) {
    const [, name, body] = match
    if (!name || !body) continue

    const textMuted = /--color-text-muted:\s*([^;]+);/.exec(body)?.[1]
    const surface = /--color-surface:\s*([^;]+);/.exec(body)?.[1]
    const bg = /--color-bg:\s*([^;]+);/.exec(body)?.[1]

    // Only blocks that define all three tokens are theme blocks (skips
    // unrelated selectors like `:root` sections that only set z-index/spacing).
    if (textMuted && surface && bg) {
      themes.push({ name, textMuted: textMuted.trim(), surface: surface.trim(), bg: bg.trim() })
    }
  }

  return themes
}

describe('theme text-muted contrast (WCAG AA)', () => {
  const cssPath = resolve(__dirname, '../tokens.css')
  const css = readFileSync(cssPath, 'utf-8')
  const themes = parseThemes(css)

  it('finds all 31 themes', () => {
    // Guards against a parser regression silently matching zero/few blocks,
    // which would make the per-theme assertions below vacuously pass.
    expect(themes.length).toBe(31)
  })

  it.each(themes.map((t) => [t.name, t] as const))(
    '%s: --color-text-muted clears 4.5:1 on both surface and bg',
    (_name, theme) => {
      const onSurface = contrastAgainst(theme.textMuted, theme.surface)
      const onBg = contrastAgainst(theme.textMuted, theme.bg)

      expect(onSurface, `on surface (${theme.surface})`).toBeGreaterThanOrEqual(AA_MIN_CONTRAST)
      expect(onBg, `on bg (${theme.bg})`).toBeGreaterThanOrEqual(AA_MIN_CONTRAST)
    }
  )
})
