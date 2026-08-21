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

export const RULES = [
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
    // The audit found six icon sizes doing the work of three. 9/10/11/13/15 are the strays.
    // 9 was missing from this list until 2026-08-21, which is exactly why four size={9} sites
    // survived the P1 scale sweep that retired the others.
    pattern: /\bsize=\{(?:9|10|11|13|15)\}/g,
    message:
      'Off-scale icon size. Use 12 (dense/inline), 14 (toolbar) or 16 (navigation) — DESIGN_SYSTEM.md § Icons.',
    files: /\.tsx$/,
  },
  {
    id: 'dimmed-muted-text',
    // --color-text-muted is already partly transparent in most themes (0.6-0.75 alpha). Stacking
    // an opacity utility on top composites the two, and the result failed WCAG AA on all 23
    // themes (2.42-3.55:1 measured). Muted on its own passes on all 23 (5.21-7.37:1), so the fix
    // is always to drop the opacity, never to add a dimmer token.
    //
    // Variant-prefixed opacity is fine and deliberately not matched: `disabled:opacity-50` dims a
    // control that WCAG exempts, and `opacity-0 group-hover:opacity-100` hides an element rather
    // than dimming it. Only unprefixed 1-99 composites against the muted colour.
    pattern: new RegExp(
      String.raw`text-\[var\(--color-text-muted\)\][^"'\`]*(?<![:\w-])opacity-[1-9][0-9]?\b` +
        String.raw`|(?<![:\w-])opacity-[1-9][0-9]?\b[^"'\`]*text-\[var\(--color-text-muted\)\]`,
      'g'
    ),
    message:
      'Opacity stacked on --color-text-muted composites to a WCAG AA failure. Drop the opacity utility (see DESIGN_SYSTEM.md § Colour).',
  },
  {
    id: 'off-scale-motion',
    // Durations and easings drifted the same way sizes did: 100/150/200 chosen per component
    // with no scale to point at. They are tokens now (--duration-fast/panel/spin,
    // --ease-out/--ease-in-out), and a literal utility is how a fourth duration gets in.
    // The lookbehind keeps `ease-[var(--ease-in-out)]` — the token form — from matching itself.
    // `in-out` comes before `in`: alternation is first-match-wins, so the shorter
    // alternative first would report `ease-in` as the match text for `ease-in-out`.
    pattern: /\bduration-\d+\b|(?<!-)\bease-(?:linear|in-out|in|out)\b/g,
    message:
      'Off-scale duration or easing. Use duration-[var(--duration-fast|panel)] and ease-[var(--ease-out|in-out)] (see DESIGN_SYSTEM.md § Motion).',
  },
]

/**
 * Rule violations in a single source text. Exported so the rules can be unit-tested against
 * sample strings without walking the tree — a regex that silently stops matching is otherwise
 * indistinguishable from a clean codebase.
 */
export function lintSource(text, file = '') {
  const lines = text.split('\n')
  const found = []
  for (const rule of RULES) {
    if (rule.files && !rule.files.test(file)) continue
    lines.forEach((line, i) => {
      rule.pattern.lastIndex = 0
      const match = rule.pattern.exec(line)
      if (!match) return
      const previous = lines[i - 1] ?? ''
      // The negative lookahead is what makes the reason mandatory: without it a bare
      // `/* design-system-ignore: */` satisfies `\S` with the comment's own terminator, and the
      // escape hatch silently becomes reasonless.
      if (/design-system-ignore:\s*(?!\*\/\s*$)\S/.test(previous)) return
      found.push({ line: i + 1, rule: rule.id, match: match[0].trim(), message: rule.message })
    })
  }
  return found
}

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

function run() {
  const violations = []
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const v of lintSource(text, file)) {
      violations.push({ ...v, file: relative(ROOT, file) })
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
}

// Only run as a CLI. Importing this module (the rule unit tests do) must not walk the tree or
// call process.exit.
if (process.argv[1] && process.argv[1].endsWith('lint-design-system.mjs')) run()
