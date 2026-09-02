#!/usr/bin/env bun
/**
 * WCAG contrast check for the text tokens, across every theme in tokens.css.
 *
 * Written to settle a specific question during the 2026-08-21 audit: whether stacking an opacity
 * utility on --color-text-muted was a real accessibility failure or just a style nit. It is a
 * failure, on all 23 themes, and the numbers this prints are the ones quoted in
 * DESIGN_SYSTEM.md § Text and borders and in TODO.md § C1.
 *
 * Kept in the repo so those numbers stay checkable rather than becoming folklore. It is not wired
 * into `bun run lint` — it reports, it does not gate, because the muted token is legitimately
 * below AA for large decorative text in a couple of themes and a gate would have to encode more
 * nuance than a contrast ratio can carry.
 *
 *   bun scripts/check-contrast.mjs          report every theme
 *   bun scripts/check-contrast.mjs --fail   exit 1 if muted text fails AA anywhere
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const AA_NORMAL = 4.5

function parseColor(input) {
  const value = input.trim()
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/i)
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => parseFloat(p.trim()))
    return [parts[0], parts[1], parts[2], parts[3] ?? 1]
  }
  return null
}

const channel = (c) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Composite a possibly-translucent foreground over an opaque background. */
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]))

const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')
const rows = []

for (const block of css.matchAll(/(^|\n)([.:][\w-]+)\s*\{([^}]*)\}/g)) {
  const [, , selector, body] = block
  const bg = body.match(/--color-bg:\s*([^;]+);/)
  const muted = body.match(/--color-text-muted:\s*([^;]+);/)
  const text = body.match(/--color-text:\s*([^;]+);/)
  if (!bg || !muted) continue

  const bgColor = parseColor(bg[1])
  const mutedColor = parseColor(muted[1])
  const textColor = text ? parseColor(text[1]) : null
  if (!bgColor || !mutedColor) {
    console.warn(`skipped ${selector}: unparsed colour`)
    continue
  }

  const mutedOver = over(mutedColor, bgColor)
  // What `opacity-60` on top of the muted token actually resolves to.
  const dimmed = over([...mutedOver, 0.6], bgColor)

  rows.push({
    selector,
    text: textColor ? ratio(over(textColor, bgColor), bgColor) : null,
    muted: ratio(mutedOver, bgColor),
    dimmed: ratio(dimmed, bgColor),
  })
}

rows.sort((a, b) => a.muted - b.muted)

const pad = (s, n) => String(s).padEnd(n)
const num = (v) => (v === null ? '    —' : v.toFixed(2).padStart(5))

console.log(pad('theme', 24), ' text', '  ', 'muted', '  ', ' x0.6', '   verdict')
console.log('─'.repeat(64))
for (const r of rows) {
  const verdict = r.muted >= AA_NORMAL ? 'muted AA' : 'MUTED FAILS AA'
  console.log(
    pad(r.selector, 24),
    num(r.text),
    '  ',
    num(r.muted),
    '  ',
    num(r.dimmed),
    '  ',
    verdict
  )
}

const mutedFails = rows.filter((r) => r.muted < AA_NORMAL)
const dimmedFails = rows.filter((r) => r.dimmed < AA_NORMAL)

console.log(
  `\n${rows.length} themes · muted text fails AA on ${mutedFails.length}` +
    ` · muted+opacity-60 fails AA on ${dimmedFails.length}`
)
console.log(
  'The second number is why DESIGN_SYSTEM.md forbids stacking opacity on --color-text-muted.'
)

if (process.argv.includes('--fail') && mutedFails.length > 0) {
  console.error(`\nFAIL: ${mutedFails.map((r) => r.selector).join(', ')}`)
  process.exit(1)
}
