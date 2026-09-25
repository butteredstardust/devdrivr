// ── Types ────────────────────────────────────────────────────────────

export type RGB = { r: number; g: number; b: number; a?: number }
export type HSL = { h: number; s: number; l: number }
export type HSB = { h: number; s: number; b: number }
export type LAB = { l: number; a: number; b: number }
export type LCH = { l: number; c: number; h: number }

export type ColorConverterState = {
  input: string
  contrastFg: string
  contrastBg: string
  history: string[]
  cssVarName: string
}

export type ColorSection = 'formats' | 'scale' | 'harmony' | 'cssvar'

export const SECTION_OPTIONS: { value: ColorSection; label: string }[] = [
  { value: 'formats', label: 'Formats' },
  { value: 'scale', label: 'Shades & Tints' },
  { value: 'harmony', label: 'Harmony' },
  { value: 'cssvar', label: 'CSS Var' },
]

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

export function parseColor(input: string): RGB | null {
  const trimmed = input.trim().toLowerCase()

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  const hexMatch = trimmed.match(/^#((?:[0-9a-f]{3,4})|(?:[0-9a-f]{6})|(?:[0-9a-f]{8}))$/)
  if (hexMatch?.[1]) {
    const hex = hexMatch[1]
    if (hex.length === 3 || hex.length === 4) {
      // hex.length === 3 guarantees indices 0-2 exist
      /* eslint-disable @typescript-eslint/no-non-null-assertion */
      return {
        r: parseInt(hex[0]! + hex[0]!, 16),
        g: parseInt(hex[1]! + hex[1]!, 16),
        b: parseInt(hex[2]! + hex[2]!, 16),
        a: hex.length === 4 ? parseInt(hex[3]! + hex[3]!, 16) / 255 : 1,
      }
      /* eslint-enable @typescript-eslint/no-non-null-assertion */
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      }
    }
  }

  // rgb(r, g, b) or rgba(r, g, b, a) — also modern space syntax
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/
  )
  if (rgbMatch) {
    const alphaText = rgbMatch[4]
    const alpha = alphaText
      ? alphaText.endsWith('%')
        ? Number(alphaText.slice(0, -1)) / 100
        : Number(alphaText)
      : 1
    const rgb = { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]), a: alpha }
    if (
      [rgb.r, rgb.g, rgb.b].every(
        (channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255
      ) &&
      Number.isFinite(alpha) &&
      alpha >= 0 &&
      alpha <= 1
    ) {
      return rgb
    }
    return null
  }

  // hsl(h, s%, l%) — also modern space syntax
  const hslMatch = trimmed.match(
    /^hsla?\(\s*([+-]?[\d.]+)(?:deg)?\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/
  )
  if (hslMatch) {
    const hsl = { h: Number(hslMatch[1]), s: Number(hslMatch[2]), l: Number(hslMatch[3]) }
    const alphaText = hslMatch[4]
    const alpha = alphaText
      ? alphaText.endsWith('%')
        ? Number(alphaText.slice(0, -1)) / 100
        : Number(alphaText)
      : 1
    if (
      Number.isFinite(hsl.h) &&
      hsl.s >= 0 &&
      hsl.s <= 100 &&
      hsl.l >= 0 &&
      hsl.l <= 100 &&
      Number.isFinite(alpha) &&
      alpha >= 0 &&
      alpha <= 1
    ) {
      return { ...hslToRgb(hsl), a: alpha }
    }
    return null
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

export function rgbToHex(rgb: RGB): string {
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  const alpha = rgb.a ?? 1
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}${alpha < 1 ? hex(alpha * 255) : ''}`
}

export function rgbToOpaqueHex(rgb: RGB): string {
  return rgbToHex({ r: rgb.r, g: rgb.g, b: rgb.b })
}

export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToRgb(hsl: HSL): RGB {
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

export function rgbToHsb(rgb: RGB): HSB {
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

/** Convert sRGB to CIE Lab (D50), matching the reference white used by CSS Color 4. */
export function rgbToLab(rgb: RGB): LAB {
  const linear = ([rgb.r, rgb.g, rgb.b] as const).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [r, g, b] = linear as [number, number, number]
  // Bradford-adapted linear sRGB → XYZ D50.
  const x = 0.4360747 * r + 0.3850649 * g + 0.1430804 * b
  const y = 0.2225045 * r + 0.7168786 * g + 0.0606169 * b
  const z = 0.0139322 * r + 0.0971045 * g + 0.7141733 * b
  const f = (value: number) => {
    const delta = 6 / 29
    return value > delta ** 3 ? Math.cbrt(value) : value / (3 * delta ** 2) + 4 / 29
  }
  const fx = f(x / 0.96422)
  const fy = f(y)
  const fz = f(z / 0.82521)
  return {
    l: Math.round((116 * fy - 16) * 10) / 10,
    a: Math.round(500 * (fx - fy) * 10) / 10,
    b: Math.round(200 * (fy - fz) * 10) / 10,
  }
}

export function labToLch(lab: LAB): LCH {
  const c = Math.sqrt(lab.a ** 2 + lab.b ** 2)
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI
  if (h < 0) h += 360
  return {
    l: lab.l,
    c: Math.round(c * 10) / 10,
    h: Math.round(h * 10) / 10,
  }
}

// ── OKLCH conversion (approximate) ───────────────────────────────────

export function rgbToOklch(rgb: RGB): { l: number; c: number; h: number } {
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

export function oklchToRgb(L: number, C: number, H: number): RGB {
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

export function luminance(rgb: RGB): number {
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs! // safe: map always returns 3 elements for a 3-element input
}

export function contrastRatio(fg: RGB, bg: RGB): number {
  const l1 = Math.max(luminance(fg), luminance(bg))
  const l2 = Math.min(luminance(fg), luminance(bg))
  return (l1 + 0.05) / (l2 + 0.05)
}

/** APCA 0.0.98G-style Lc value, with the same sRGB inputs as WCAG. */
export function apcaContrast(text: RGB, background: RGB): number {
  const toY = (rgb: RGB) => {
    const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
      const value = channel / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    const [red = 0, green = 0, blue = 0] = channels
    return 0.2126729 * red + 0.7151522 * green + 0.072175 * blue
  }
  const clampBlack = (value: number) => {
    const blackThreshold = 0.022
    return value <= blackThreshold ? value + (blackThreshold - value) ** 1.414 : value
  }
  const txt = clampBlack(toY(text))
  const bg = clampBlack(toY(background))
  if (Math.abs(bg - txt) < 0.0005) return 0
  const sapc = bg > txt ? (bg ** 0.56 - txt ** 0.57) * 1.14 : (bg ** 0.65 - txt ** 0.62) * 1.14
  if (bg > txt) return sapc < 0.1 ? 0 : (sapc - 0.027) * 100
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100
}

// ── Shade/Tint Generator ─────────────────────────────────────────────

export function generateScale(rgb: RGB): { label: string; hex: string; rgb: RGB }[] {
  const oklch = rgbToOklch(rgb)
  const steps = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95]
  return steps.map((l) => {
    const stepRgb = { ...oklchToRgb(l / 100, oklch.c, oklch.h), a: rgb.a ?? 1 }
    return { label: `${l}%`, hex: rgbToHex(stepRgb), rgb: stepRgb }
  })
}

// ── Color Harmonies ──────────────────────────────────────────────────

export function harmonies(rgb: RGB): { label: string; hex: string }[] {
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

export function findCssName(hex: string): string | null {
  const h = hex.replace('#', '').toLowerCase()
  for (const [name, val] of Object.entries(CSS_NAMED_COLORS)) {
    if (val === h) return name
  }
  return null
}
