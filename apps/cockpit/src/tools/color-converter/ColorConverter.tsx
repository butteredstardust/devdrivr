import { useCallback, useMemo, useRef, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'

// ── Types ────────────────────────────────────────────────────────────

type RGB = { r: number; g: number; b: number }
type HSL = { h: number; s: number; l: number }
type HSB = { h: number; s: number; b: number }

type ColorConverterState = {
  input: string
  contrastFg: string
  contrastBg: string
  history: string[]
  cssVarName: string
}

// ── CSS Named Colors (full 148) ──────────────────────────────────────

const CSS_NAMED_COLORS: Record<string, string> = {
  aliceblue: 'f0f8ff',
  antiquewhite: 'faebd7',
  aqua: '00ffff',
  aquamarine: '7fffd4',
  azure: 'f0ffff',
  beige: 'f5f5dc',
  bisque: 'ffe4c4',
  black: '000000',
  blanchedalmond: 'ffebcd',
  blue: '0000ff',
  blueviolet: '8a2be2',
  brown: 'a52a2a',
  burlywood: 'deb887',
  cadetblue: '5f9ea0',
  chartreuse: '7fff00',
  chocolate: 'd2691e',
  coral: 'ff7f50',
  cornflowerblue: '6495ed',
  cornsilk: 'fff8dc',
  crimson: 'dc143c',
  cyan: '00ffff',
  darkblue: '00008b',
  darkcyan: '008b8b',
  darkgoldenrod: 'b8860b',
  darkgray: 'a9a9a9',
  darkgreen: '006400',
  darkgrey: 'a9a9a9',
  darkkhaki: 'bdb76b',
  darkmagenta: '8b008b',
  darkolivegreen: '556b2f',
  darkorange: 'ff8c00',
  darkorchid: '9932cc',
  darkred: '8b0000',
  darksalmon: 'e9967a',
  darkseagreen: '8fbc8f',
  darkslateblue: '483d8b',
  darkslategray: '2f4f4f',
  darkslategrey: '2f4f4f',
  darkturquoise: '00ced1',
  darkviolet: '9400d3',
  deeppink: 'ff1493',
  deepskyblue: '00bfff',
  dimgray: '696969',
  dimgrey: '696969',
  dodgerblue: '1e90ff',
  firebrick: 'b22222',
  floralwhite: 'fffaf0',
  forestgreen: '228b22',
  fuchsia: 'ff00ff',
  gainsboro: 'dcdcdc',
  ghostwhite: 'f8f8ff',
  gold: 'ffd700',
  goldenrod: 'daa520',
  gray: '808080',
  green: '008000',
  greenyellow: 'adff2f',
  grey: '808080',
  honeydew: 'f0fff0',
  hotpink: 'ff69b4',
  indianred: 'cd5c5c',
  indigo: '4b0082',
  ivory: 'fffff0',
  khaki: 'f0e68c',
  lavender: 'e6e6fa',
  lavenderblush: 'fff0f5',
  lawngreen: '7cfc00',
  lemonchiffon: 'fffacd',
  lightblue: 'add8e6',
  lightcoral: 'f08080',
  lightcyan: 'e0ffff',
  lightgoldenrodyellow: 'fafad2',
  lightgray: 'd3d3d3',
  lightgreen: '90ee90',
  lightgrey: 'd3d3d3',
  lightpink: 'ffb6c1',
  lightsalmon: 'ffa07a',
  lightseagreen: '20b2aa',
  lightskyblue: '87cefa',
  lightslategray: '778899',
  lightslategrey: '778899',
  lightsteelblue: 'b0c4de',
  lightyellow: 'ffffe0',
  lime: '00ff00',
  limegreen: '32cd32',
  linen: 'faf0e6',
  magenta: 'ff00ff',
  maroon: '800000',
  mediumaquamarine: '66cdaa',
  mediumblue: '0000cd',
  mediumorchid: 'ba55d3',
  mediumpurple: '9370db',
  mediumseagreen: '3cb371',
  mediumslateblue: '7b68ee',
  mediumspringgreen: '00fa9a',
  mediumturquoise: '48d1cc',
  mediumvioletred: 'c71585',
  midnightblue: '191970',
  mintcream: 'f5fffa',
  mistyrose: 'ffe4e1',
  moccasin: 'ffe4b5',
  navajowhite: 'ffdead',
  navy: '000080',
  oldlace: 'fdf5e6',
  olive: '808000',
  olivedrab: '6b8e23',
  orange: 'ffa500',
  orangered: 'ff4500',
  orchid: 'da70d6',
  palegoldenrod: 'eee8aa',
  palegreen: '98fb98',
  paleturquoise: 'afeeee',
  palevioletred: 'db7093',
  papayawhip: 'ffefd5',
  peachpuff: 'ffdab9',
  peru: 'cd853f',
  pink: 'ffc0cb',
  plum: 'dda0dd',
  powderblue: 'b0e0e6',
  purple: '800080',
  rebeccapurple: '663399',
  red: 'ff0000',
  rosybrown: 'bc8f8f',
  royalblue: '4169e1',
  saddlebrown: '8b4513',
  salmon: 'fa8072',
  sandybrown: 'f4a460',
  seagreen: '2e8b57',
  seashell: 'fff5ee',
  sienna: 'a0522d',
  silver: 'c0c0c0',
  skyblue: '87ceeb',
  slateblue: '6a5acd',
  slategray: '708090',
  slategrey: '708090',
  snow: 'fffafa',
  springgreen: '00ff7f',
  steelblue: '4682b4',
  tan: 'd2b48c',
  teal: '008080',
  thistle: 'd8bfd8',
  tomato: 'ff6347',
  turquoise: '40e0d0',
  violet: 'ee82ee',
  wheat: 'f5deb3',
  white: 'ffffff',
  whitesmoke: 'f5f5f5',
  yellow: 'ffff00',
  yellowgreen: '9acd32',
}

// ── Color Math ───────────────────────────────────────────────────────

function parseColor(input: string): RGB | null {
  const trimmed = input.trim().toLowerCase()

  // Hex: #rgb, #rrggbb, #rrggbbaa
  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/)
  if (hexMatch?.[1]) {
    const hex = hexMatch[1]
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0]! + hex[0]!, 16),
        g: parseInt(hex[1]! + hex[1]!, 16),
        b: parseInt(hex[2]! + hex[2]!, 16),
      }
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      }
    }
  }

  // rgb(r, g, b) or rgba(r, g, b, a) — also modern space syntax
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/)
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) }
  }

  // hsl(h, s%, l%) — also modern space syntax
  const hslMatch = trimmed.match(/hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%/)
  if (hslMatch) {
    return hslToRgb({ h: Number(hslMatch[1]), s: Number(hslMatch[2]), l: Number(hslMatch[3]) })
  }

  // oklch(L C H) — parse and convert
  const oklchMatch = trimmed.match(/oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/)
  if (oklchMatch) {
    const L = Number(oklchMatch[1]) > 1 ? Number(oklchMatch[1]) / 100 : Number(oklchMatch[1])
    return oklchToRgb(L, Number(oklchMatch[2]), Number(oklchMatch[3]))
  }

  // Named CSS colors
  const named = CSS_NAMED_COLORS[trimmed]
  if (named) {
    return {
      r: parseInt(named.slice(0, 2), 16),
      g: parseInt(named.slice(2, 4), 16),
      b: parseInt(named.slice(4, 6), 16),
    }
  }

  return null
}

function rgbToHex(rgb: RGB): string {
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`
}

function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
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
  const s = hsl.s / 100
  const l = hsl.l / 100
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const h = hsl.h / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return {
    r: Math.round(hue2rgb(h + 1 / 3) * 255),
    g: Math.round(hue2rgb(h) * 255),
    b: Math.round(hue2rgb(h - 1 / 3) * 255),
  }
}

function rgbToHsb(rgb: RGB): HSB {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  const s = max === 0 ? 0 : d / max
  return { h: Math.round(h * 360), s: Math.round(s * 100), b: Math.round(max * 100) }
}

// ── OKLCH conversion (approximate) ───────────────────────────────────

function rgbToOklch(rgb: RGB): { l: number; c: number; h: number } {
  // sRGB → linear
  const toLinear = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const lr = toLinear(rgb.r)
  const lg = toLinear(rgb.g)
  const lb = toLinear(rgb.b)

  // Linear sRGB → OKLab via LMS
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bVal = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const C = Math.sqrt(a * a + bVal * bVal)
  let H = (Math.atan2(bVal, a) * 180) / Math.PI
  if (H < 0) H += 360

  return {
    l: Math.round(L * 1000) / 10,
    c: Math.round(C * 1000) / 1000,
    h: Math.round(H * 10) / 10,
  }
}

function oklchToRgb(L: number, C: number, H: number): RGB {
  const hRad = (H * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l3 = l_ * l_ * l_
  const m3 = m_ * m_ * m_
  const s3 = s_ * s_ * s_

  const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  const toSrgb = (v: number) => {
    const c = Math.max(0, Math.min(1, v))
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)
  }

  return { r: toSrgb(lr), g: toSrgb(lg), b: toSrgb(lb) }
}

// ── WCAG ─────────────────────────────────────────────────────────────

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

// ── Shade/Tint Generator ─────────────────────────────────────────────

function generateScale(rgb: RGB): { label: string; hex: string; rgb: RGB }[] {
  const hsl = rgbToHsl(rgb)
  const steps = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95]
  return steps.map((l) => {
    const stepRgb = hslToRgb({ h: hsl.h, s: hsl.s, l })
    return { label: `${l}%`, hex: rgbToHex(stepRgb), rgb: stepRgb }
  })
}

// ── Color Harmonies ──────────────────────────────────────────────────

function harmonies(rgb: RGB): { label: string; hex: string }[] {
  const hsl = rgbToHsl(rgb)
  const make = (offset: number) =>
    rgbToHex(hslToRgb({ h: (hsl.h + offset) % 360, s: hsl.s, l: hsl.l }))
  return [
    { label: 'Complementary', hex: make(180) },
    { label: 'Analogous −30°', hex: make(330) },
    { label: 'Analogous +30°', hex: make(30) },
    { label: 'Triadic +120°', hex: make(120) },
    { label: 'Triadic −120°', hex: make(240) },
    { label: 'Split-comp +150°', hex: make(150) },
    { label: 'Split-comp −150°', hex: make(210) },
  ]
}

// ── Find CSS name ────────────────────────────────────────────────────

function findCssName(hex: string): string | null {
  const h = hex.replace('#', '').toLowerCase()
  for (const [name, val] of Object.entries(CSS_NAMED_COLORS)) {
    if (val === h) return name
  }
  return null
}

// ── Contrast Inputs (avoids double parseColor calls) ─────────────────

function ContrastInputs({
  contrastFg,
  contrastBg,
  onFgChange,
  onBgChange,
  onSwap,
}: {
  contrastFg: string
  contrastBg: string
  onFgChange: (v: string) => void
  onBgChange: (v: string) => void
  onSwap: () => void
}) {
  const fgRgb = useMemo(() => parseColor(contrastFg), [contrastFg])
  const bgRgb = useMemo(() => parseColor(contrastBg), [contrastBg])
  const fgHex = fgRgb ? rgbToHex(fgRgb) : '#ffffff'
  const bgHex = bgRgb ? rgbToHex(bgRgb) : '#000000'

  return (
    <div className="flex items-end gap-4">
      <div className="flex-1">
        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Foreground</label>
        <div className="flex items-center gap-2">
          <Input
            value={contrastFg}
            onChange={(e) => onFgChange(e.target.value)}
            size="md"
            className="flex-1"
          />
          <input
            type="color"
            value={fgHex}
            onChange={(e) => onFgChange(e.target.value)}
            className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          />
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={onSwap}
        className="mb-1"
        title="Swap foreground and background"
      >
        ⇄
      </Button>
      <div className="flex-1">
        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Background</label>
        <div className="flex items-center gap-2">
          <Input
            value={contrastBg}
            onChange={(e) => onBgChange(e.target.value)}
            size="md"
            className="flex-1"
          />
          <input
            type="color"
            value={bgHex}
            onChange={(e) => onBgChange(e.target.value)}
            className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          />
        </div>
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────

export default function ColorConverter() {
  const [state, updateState] = useToolState<ColorConverterState>('color-converter', {
    input: '#39ff14',
    contrastFg: '#ffffff',
    contrastBg: '#000000',
    history: [],
    cssVarName: '--color-primary',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [activeSection, setActiveSection] = useState<'formats' | 'scale' | 'harmony' | 'cssvar'>('formats')

  const color = useMemo(() => {
    const rgb = parseColor(state.input)
    if (!rgb) return null
    const hsl = rgbToHsl(rgb)
    const hsb = rgbToHsb(rgb)
    const oklch = rgbToOklch(rgb)
    const cssName = findCssName(rgbToHex(rgb))
    return { rgb, hsl, hsb, oklch, hex: rgbToHex(rgb), cssName }
  }, [state.input])

  const historyRef = useRef(state.history)
  historyRef.current = state.history

  const handleInputChange = useCallback(
    (value: string) => {
      updateState({ input: value })
      const rgb = parseColor(value)
      if (rgb) {
        const hex = rgbToHex(rgb)
        const prev = historyRef.current.filter((h) => h !== hex)
        const next = [hex, ...prev].slice(0, 12)
        updateState({ history: next })
      }
    },
    [updateState]
  )

  const formats = useMemo(() => {
    if (!color) return []
    return [
      { label: 'Hex', value: color.hex },
      { label: 'RGB', value: `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})` },
      { label: 'HSL', value: `hsl(${color.hsl.h}, ${color.hsl.s}%, ${color.hsl.l}%)` },
      { label: 'HSB', value: `hsb(${color.hsb.h}, ${color.hsb.s}%, ${color.hsb.b}%)` },
      { label: 'OKLCH', value: `oklch(${color.oklch.l}% ${color.oklch.c} ${color.oklch.h})` },
      ...(color.cssName ? [{ label: 'CSS Name', value: color.cssName }] : []),
    ]
  }, [color])

  const scale = useMemo(() => (color ? generateScale(color.rgb) : []), [color])
  const harmony = useMemo(() => (color ? harmonies(color.rgb) : []), [color])

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

  const swapContrast = useCallback(() => {
    updateState({ contrastFg: state.contrastBg, contrastBg: state.contrastFg })
    setLastAction('Swapped contrast colors', 'info')
  }, [state.contrastFg, state.contrastBg, updateState, setLastAction])

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      {/* ── Input ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 font-mono text-sm text-[var(--color-text)]">Color Input</h2>
        <div className="flex items-center gap-3">
          <Input
            value={state.input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="#39ff14, rgb(255,0,0), hsl(120,100%,50%), oklch(87% 0.35 145), red"
            size="md"
            className="flex-1"
          />
          <input
            type="color"
            value={color?.hex ?? '#000000'}
            onChange={(e) => handleInputChange(e.target.value)}
            title="Pick a color"
            className="h-10 w-10 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          />
          {color && (
            <div
              className="h-10 w-10 shrink-0 rounded border border-[var(--color-border)]"
              style={{ backgroundColor: color.hex }}
              title={color.hex}
            />
          )}
        </div>

        {/* History */}
        {state.history.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-xs text-[var(--color-text-muted)]">Recent:</span>
            {state.history.map((hex) => (
              <button
                key={hex}
                onClick={() => updateState({ input: hex })}
                className="h-5 w-5 rounded border border-[var(--color-border)] transition-transform hover:scale-125"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Section Tabs ──────────────────────────────── */}
      {color && (
        <>
          <div className="flex gap-2 border-b border-[var(--color-border)] pb-1">
            {(['formats', 'scale', 'harmony', 'cssvar'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveSection(tab)}
                className={`px-3 py-1 text-xs font-mono rounded-t ${
                  activeSection === tab
                    ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {tab === 'formats' ? 'Formats' : tab === 'scale' ? 'Shades & Tints' : tab === 'harmony' ? 'Harmony' : 'CSS Var'}
              </button>
            ))}
          </div>

          {/* ── Formats ─────────────────────────────────── */}
          {activeSection === 'formats' && (
            <section className="flex flex-col gap-2">
              {formats.map((f) => (
                <div
                  key={f.label}
                  className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                >
                  <div>
                    <span className="text-xs text-[var(--color-text-muted)]">{f.label}: </span>
                    <span className="font-mono text-sm text-[var(--color-text)]">{f.value}</span>
                  </div>
                  <CopyButton text={f.value} />
                </div>
              ))}
            </section>
          )}

          {/* ── Shades & Tints ──────────────────────────── */}
          {activeSection === 'scale' && (
            <section>
              <div className="flex flex-wrap gap-2">
                {scale.map((step) => (
                  <button
                    key={step.label}
                    onClick={() => updateState({ input: step.hex })}
                    className="group flex flex-col items-center gap-1"
                    title={step.hex}
                  >
                    <div
                      className="h-10 w-10 rounded border border-[var(--color-border)] transition-transform group-hover:scale-110"
                      style={{ backgroundColor: step.hex }}
                    />
                    <span className="text-[10px] text-[var(--color-text-muted)]">{step.label}</span>
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                      {step.hex}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Harmony ─────────────────────────────────── */}
          {activeSection === 'harmony' && (
            <section>
              <div className="flex flex-col gap-2">
                {harmony.map((h) => (
                  <div
                    key={h.label}
                    className="flex items-center gap-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                  >
                    <div
                      className="h-8 w-8 shrink-0 rounded border border-[var(--color-border)]"
                      style={{ backgroundColor: h.hex }}
                    />
                    <div className="flex-1">
                      <span className="text-xs text-[var(--color-text-muted)]">{h.label}</span>
                      <span className="ml-2 font-mono text-sm text-[var(--color-text)]">
                        {h.hex}
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => updateState({ input: h.hex })}
                    >
                      Use
                    </Button>
                    <CopyButton text={h.hex} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── CSS Variable Preview ─────────────────────── */}
          {activeSection === 'cssvar' && (
            <section className="flex flex-col gap-4">
              {/* Variable name input */}
              <div className="flex items-center gap-3">
                <label className="shrink-0 text-xs text-[var(--color-text-muted)]">
                  Variable name
                </label>
                <Input
                  value={state.cssVarName}
                  onChange={(e) => updateState({ cssVarName: e.target.value })}
                  placeholder="--color-primary"
                  className="flex-1 font-mono"
                />
              </div>

              {/* Declarations to copy */}
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Hex', value: `${state.cssVarName}: ${color.hex};` },
                  {
                    label: 'RGB',
                    value: `${state.cssVarName}: rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b});`,
                  },
                  {
                    label: 'HSL',
                    value: `${state.cssVarName}: hsl(${color.hsl.h}, ${color.hsl.s}%, ${color.hsl.l}%);`,
                  },
                  {
                    label: 'OKLCH',
                    value: `${state.cssVarName}: oklch(${color.oklch.l}% ${color.oklch.c} ${color.oklch.h});`,
                  },
                ].map((decl) => (
                  <div
                    key={decl.label}
                    className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                  >
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">{decl.label}: </span>
                      <span className="font-mono text-sm text-[var(--color-text)]">{decl.value}</span>
                    </div>
                    <CopyButton text={decl.value} />
                  </div>
                ))}
              </div>

              {/* Live UI mockup */}
              <div>
                <div className="mb-2 text-xs text-[var(--color-text-muted)]">Preview</div>
                <div className="flex flex-wrap items-center gap-3 rounded border border-[var(--color-border)] p-4">
                  {/* Surface swatch */}
                  <div
                    className="flex h-10 w-24 items-center justify-center rounded border border-[var(--color-border)] font-mono text-xs"
                    style={{ backgroundColor: color.hex, color: color.oklch.l > 55 ? '#000' : '#fff' }}
                  >
                    surface
                  </div>
                  {/* Button */}
                  <button
                    className="rounded px-3 py-1.5 text-xs font-bold"
                    style={{ backgroundColor: color.hex, color: color.oklch.l > 55 ? '#000' : '#fff' }}
                  >
                    Button
                  </button>
                  {/* Badge */}
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: color.hex + '33', color: color.hex }}
                  >
                    Badge
                  </span>
                  {/* Text */}
                  <span className="text-sm font-bold" style={{ color: color.hex }}>
                    Text color
                  </span>
                  {/* Border sample */}
                  <div
                    className="h-10 w-10 rounded"
                    style={{ border: `2px solid ${color.hex}` }}
                    title="border color"
                  />
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Contrast Ratio ─────────────────────────────── */}
      <section>
        <h2 className="mb-2 font-mono text-sm text-[var(--color-text)]">Contrast Ratio (WCAG)</h2>
        <ContrastInputs
          contrastFg={state.contrastFg}
          contrastBg={state.contrastBg}
          onFgChange={(v) => updateState({ contrastFg: v })}
          onBgChange={(v) => updateState({ contrastBg: v })}
          onSwap={swapContrast}
        />
        {contrast && (
          <div className="mt-3 flex items-center gap-4">
            <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
              <div className="text-xs text-[var(--color-text-muted)]">Ratio</div>
              <div className="font-mono text-lg font-bold text-[var(--color-text)]">
                {contrast.ratio}:1
              </div>
            </div>
            <div
              className="flex h-12 items-center justify-center rounded border border-[var(--color-border)] px-6 text-sm font-bold"
              style={{ backgroundColor: state.contrastBg, color: state.contrastFg }}
            >
              Sample Text
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <span
                className={
                  contrast.aa ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                }
              >
                {contrast.aa ? '✓' : '✗'} AA Normal (≥4.5)
              </span>
              <span
                className={
                  contrast.aaLarge ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                }
              >
                {contrast.aaLarge ? '✓' : '✗'} AA Large (≥3.0)
              </span>
              <span
                className={
                  contrast.aaa ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                }
              >
                {contrast.aaa ? '✓' : '✗'} AAA (≥7.0)
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
