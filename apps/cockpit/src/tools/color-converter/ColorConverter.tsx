import { useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'

type ColorConverterState = {
  input: string
  contrastFg: string
  contrastBg: string
}

type RGB = { r: number; g: number; b: number }
type HSL = { h: number; s: number; l: number }

// Parse any color string to RGB
function parseColor(input: string): RGB | null {
  const trimmed = input.trim().toLowerCase()

  // Hex: #rgb, #rrggbb
  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/)
  if (hexMatch?.[1]) {
    const hex = hexMatch[1]
    if (hex.length === 3) {
      return { r: parseInt(hex[0]! + hex[0]!, 16), g: parseInt(hex[1]! + hex[1]!, 16), b: parseInt(hex[2]! + hex[2]!, 16) }
    }
    if (hex.length >= 6) {
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) }
    }
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) }
  }

  // hsl(h, s%, l%)
  const hslMatch = trimmed.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/)
  if (hslMatch) {
    return hslToRgb({ h: Number(hslMatch[1]), s: Number(hslMatch[2]), l: Number(hslMatch[3]) })
  }

  // Named CSS colors (common ones)
  const NAMED: Record<string, RGB> = {
    red: { r: 255, g: 0, b: 0 }, green: { r: 0, g: 128, b: 0 }, blue: { r: 0, g: 0, b: 255 },
    white: { r: 255, g: 255, b: 255 }, black: { r: 0, g: 0, b: 0 },
    yellow: { r: 255, g: 255, b: 0 }, cyan: { r: 0, g: 255, b: 255 }, magenta: { r: 255, g: 0, b: 255 },
    orange: { r: 255, g: 165, b: 0 }, purple: { r: 128, g: 0, b: 128 }, pink: { r: 255, g: 192, b: 203 },
    gray: { r: 128, g: 128, b: 128 }, grey: { r: 128, g: 128, b: 128 },
  }
  const named = NAMED[trimmed]
  if (named) return named

  return null
}

function rgbToHex(rgb: RGB): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`
}

function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToRgb(hsl: HSL): RGB {
  const s = hsl.s / 100, l = hsl.l / 100
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v } }
  const h = hsl.h / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }
  return {
    r: Math.round(hue2rgb(h + 1/3) * 255),
    g: Math.round(hue2rgb(h) * 255),
    b: Math.round(hue2rgb(h - 1/3) * 255),
  }
}

// WCAG relative luminance
function luminance(rgb: RGB): number {
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!
}

function contrastRatio(fg: RGB, bg: RGB): number {
  const l1 = Math.max(luminance(fg), luminance(bg))
  const l2 = Math.min(luminance(fg), luminance(bg))
  return (l1 + 0.05) / (l2 + 0.05)
}

export default function ColorConverter() {
  const [state, updateState] = useToolState<ColorConverterState>('color-converter', {
    input: '#39ff14',
    contrastFg: '#ffffff',
    contrastBg: '#000000',
  })
  const color = useMemo(() => {
    const rgb = parseColor(state.input)
    if (!rgb) return null
    const hsl = rgbToHsl(rgb)
    return {
      rgb,
      hex: rgbToHex(rgb),
      rgbStr: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      hslStr: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    }
  }, [state.input])

  const contrast = useMemo(() => {
    const fg = parseColor(state.contrastFg)
    const bg = parseColor(state.contrastBg)
    if (!fg || !bg) return null
    const ratio = contrastRatio(fg, bg)
    return {
      ratio: ratio.toFixed(2),
      aa: ratio >= 4.5,
      aaLarge: ratio >= 3,
      aaa: ratio >= 7,
    }
  }, [state.contrastFg, state.contrastBg])

  const formats = color
    ? [
        { label: 'Hex', value: color.hex },
        { label: 'RGB', value: color.rgbStr },
        { label: 'HSL', value: color.hslStr },
      ]
    : []

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <section>
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Color Input</h2>
        <div className="flex items-center gap-3">
          <input
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder="#39ff14, rgb(255,0,0), hsl(120,100%,50%), red"
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
          />
          <input
            type="color"
            value={color?.hex ?? '#000000'}
            onChange={(e) => updateState({ input: e.target.value })}
            title="Pick a color"
            className="h-10 w-10 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          />
        </div>
      </section>

      {formats.length > 0 && (
        <section>
          <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Formats</h2>
          <div className="flex flex-col gap-2">
            {formats.map((f) => (
              <div key={f.label} className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                <div>
                  <span className="text-xs text-[var(--color-text-muted)]">{f.label}: </span>
                  <span className="font-mono text-sm text-[var(--color-text)]">{f.value}</span>
                </div>
                <CopyButton text={f.value} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-pixel text-sm text-[var(--color-text)]">Contrast Ratio (WCAG)</h2>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Foreground</label>
            <div className="flex items-center gap-2">
              <input
                value={state.contrastFg}
                onChange={(e) => updateState({ contrastFg: e.target.value })}
                className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
              {parseColor(state.contrastFg) && (
                <div className="h-6 w-6 shrink-0 rounded border border-[var(--color-border)]" style={{ backgroundColor: state.contrastFg }} />
              )}
            </div>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Background</label>
            <div className="flex items-center gap-2">
              <input
                value={state.contrastBg}
                onChange={(e) => updateState({ contrastBg: e.target.value })}
                className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
              {parseColor(state.contrastBg) && (
                <div className="h-6 w-6 shrink-0 rounded border border-[var(--color-border)]" style={{ backgroundColor: state.contrastBg }} />
              )}
            </div>
          </div>
        </div>
        {contrast && (
          <div className="mt-3 flex items-center gap-4">
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
              <div className="text-xs text-[var(--color-text-muted)]">Ratio</div>
              <div className="font-mono text-lg font-bold text-[var(--color-text)]">{contrast.ratio}:1</div>
            </div>
            <div
              className="flex h-12 items-center justify-center rounded border border-[var(--color-border)] px-6 text-sm font-bold"
              style={{ backgroundColor: state.contrastBg, color: state.contrastFg }}
            >
              Sample Text
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <span className={contrast.aa ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                {contrast.aa ? '✓' : '✗'} AA Normal (≥4.5)
              </span>
              <span className={contrast.aaLarge ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                {contrast.aaLarge ? '✓' : '✗'} AA Large (≥3.0)
              </span>
              <span className={contrast.aaa ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                {contrast.aaa ? '✓' : '✗'} AAA (≥7.0)
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
