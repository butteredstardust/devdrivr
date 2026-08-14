import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_THEMES } from '../theme'

// Parses src/styles/tokens.css directly rather than relying on jsdom to apply
// the real CSS cascade (jsdom does not compute custom-property inheritance
// reliably), so this is a static check of the source file.
const tokensPath = path.resolve(__dirname, '../../styles/tokens.css')
const tokensCss = fs.readFileSync(tokensPath, 'utf8')

// Tokens that must be defined directly on every theme class. Tokens that are
// intentionally theme-agnostic (--space-*, --radius-*, --text-*,
// --elevation-*, --focus-ring, the z-scale) live once in :root and are
// deliberately excluded here — they are not expected to appear per theme.
//
// --color-error and --color-success are also excluded: pre-existing themes
// (e.g. cyber-luxe has no --color-success, midnight/warm-terminal/
// neon-brutalist/earth-code have no --color-error) intentionally fall back
// to the :root default for whichever one they omit. That's an existing
// design choice, not something this token-layer pass is scoped to change.
const REQUIRED_PER_THEME_TOKENS = [
  '--color-bg',
  '--color-surface',
  '--color-surface-raised',
  '--color-surface-sunken',
  '--color-surface-hover',
  '--color-border',
  '--color-text',
  '--color-text-muted',
  '--color-accent',
  '--color-accent-dim',
  '--color-info',
  '--color-warning',
  '--color-shadow',
  '--color-scrim',
]

const REQUIRED_GLOBAL_TOKENS = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-7',
  '--space-8',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-lg',
  '--elevation-1',
  '--elevation-2',
  '--elevation-3',
  '--focus-ring',
]

/** Extracts the body of a `.theme-name { ... }` block from the tokens source. */
function getThemeBlock(css: string, themeName: string): string {
  const re = new RegExp(`\\.${themeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
  const match = css.match(re)
  if (!match || match[1] === undefined) {
    throw new Error(`No CSS block found for theme class ".${themeName}" in tokens.css`)
  }
  return match[1]
}

function getDeclaredValue(block: string, token: string): string | null {
  const re = new RegExp(`${token}:\\s*([^;]+);`)
  const match = block.match(re)
  return match && match[1] !== undefined ? match[1].trim() : null
}

describe('design tokens (src/styles/tokens.css)', () => {
  it('covers all 22 registered themes', () => {
    expect(ALL_THEMES).toHaveLength(22)
  })

  it('defines every global (theme-agnostic) token exactly once in :root', () => {
    for (const token of REQUIRED_GLOBAL_TOKENS) {
      const matches = tokensCss.match(new RegExp(`${token}:`, 'g')) ?? []
      expect(matches.length, `${token} should be defined exactly once`).toBe(1)
    }
  })

  it.each(ALL_THEMES)('theme class ".%s" defines the complete per-theme token set', (theme) => {
    const block = getThemeBlock(tokensCss, theme)
    for (const token of REQUIRED_PER_THEME_TOKENS) {
      const value = getDeclaredValue(block, token)
      expect(value, `${theme} is missing ${token}`).not.toBeNull()
      expect(value, `${theme} has an empty value for ${token}`).not.toBe('')
    }
  })

  it.each(ALL_THEMES)(
    '"--color-surface-hover" differs from "--color-surface-raised" in .%s',
    (theme) => {
      const block = getThemeBlock(tokensCss, theme)
      const raised = getDeclaredValue(block, '--color-surface-raised')
      const hover = getDeclaredValue(block, '--color-surface-hover')
      expect(raised).not.toBeNull()
      expect(hover).not.toBeNull()
      expect(hover?.toLowerCase()).not.toBe(raised?.toLowerCase())
    }
  )
})
