#!/usr/bin/env bun
/**
 * Design-system lint gate.
 *
 * ESLint can only see `className="literal"`; roughly a third of the styling in this app is built
 * in template literals or ternaries, which is exactly where the drift documented in
 * documentation/TODO.md § F1/F8/F10/F12 accumulated. This walks the raw source text instead, so a
 * violation cannot hide inside an interpolation.
 *
 * Every rule here encodes a decision recorded in documentation/DESIGN_SYSTEM.md. If you need to
 * change a rule, change the doc in the same commit — a gate that disagrees with the doc teaches
 * contributors to ignore both.
 *
 * Escape hatch: `/* design-system-ignore: <reason> *​/` on the line above. Reason is mandatory.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

const RULES = [
  {
    id: 'off-scale-text',
    // `text-[9px]` / `text-[11px]` bypass the --text-* scale, so they don't move when the scale
    // does and they read as a different size on every theme's font stack.
    pattern: /text-\[\d+px\]/g,
    message: 'Off-scale font size. Use text-2xs / text-xs / text-sm from the documented scale.',
  },
  {
    id: 'legacy-focus-ring',
    // Two focus treatments render visibly differently side by side. --focus-ring is the one with
    // the background-coloured offset layer that stays visible on any surface.
    pattern: /focus-visible:ring(?!-offset\b)[-\[]/g,
    message:
      'Use focus-visible:shadow-[var(--focus-ring)] rather than a ring utility (see DESIGN_SYSTEM.md § Focus).',
  },
  {
    id: 'hardcoded-colour',
    // Hardcoding any colour breaks 22 themes at once, and does it silently — the app only looks
    // wrong under the themes nobody ran locally.
    pattern: /(?:className|class)=(?:"[^"]*|'[^']*|\{`[^`]*)(#[0-9a-fA-F]{3,8}\b|rgba?\()/g,
    message: 'Hardcoded colour in a class. Use a --color-* token.',
  },
  {
    id: 'tailwind-palette',
    // Same failure as above, one step less obvious.
    pattern:
      /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    message: 'Tailwind palette colour. Use a --color-* token.',
  },
  {
    id: 'off-scale-icon',
    // The audit found six icon sizes doing the work of three. 10/11/13/15 are the strays.
    pattern: /\bsize=\{(?:10|11|13|15)\}/g,
    message:
      'Off-scale icon size. Use 12 (dense/inline), 14 (toolbar) or 16 (navigation) — DESIGN_SYSTEM.md § Icons.',
    files: /\.tsx$/,
  },
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === '__mocks__') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const violations = []

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')

  for (const rule of RULES) {
    if (rule.files && !rule.files.test(file)) continue
    lines.forEach((line, i) => {
      rule.pattern.lastIndex = 0
      const match = rule.pattern.exec(line)
      if (!match) return
      // An ignore comment on the preceding line, with a reason after the colon.
      const previous = lines[i - 1] ?? ''
      if (/design-system-ignore:\s*\S/.test(previous)) return
      violations.push({
        file: relative(ROOT, file),
        line: i + 1,
        rule: rule.id,
        match: match[0].trim(),
        message: rule.message,
      })
    })
  }
}

if (violations.length === 0) {
  console.log('design-system: no violations')
  process.exit(0)
}

for (const v of violations) {
  console.error(`${v.file}:${v.line}  [${v.rule}]  ${v.match}\n    ${v.message}`)
}
console.error(`\ndesign-system: ${violations.length} violation(s)`)
process.exit(1)
