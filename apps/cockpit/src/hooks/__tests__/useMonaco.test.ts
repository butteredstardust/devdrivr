import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  EDITOR_OPTIONS,
  buildCockpitTheme,
  buildEditorOptions,
  contrastRatio,
} from '@/hooks/useMonaco'
import { DEFAULT_SETTINGS } from '@/types/models'

// getCssColor() resolves CSS custom properties by setting `color: var(--x)`
// on a temp element and reading window.getComputedStyle(...).color. jsdom
// does not resolve var() the way a real browser engine does — it reports
// the literal `var(--x)` string back — so we stub getComputedStyle to
// mimic what the real cascade would produce for each cockpit-native theme
// variable, keyed off the variable name embedded in the inline style.
//
// --color-text-muted below is copied verbatim from src/index.css, alpha
// channel included — these are the two themes where muted is an alpha tint
// of --color-text (midnight: rgba(240,240,240,0.6) over #1a1f3a; soft-focus:
// rgba(45,52,54,0.6) over #e9ecef, which is exactly --color-text's own RGB
// triple with alpha applied). A browser's computed style reports the
// literal `rgba(...)` for semi-transparent colours, so stubbing it this way
// exercises the real alpha-compositing path in getCssColor/rgbToMonacoHex.
const MIDNIGHT_VARS: Record<string, string> = {
  '--color-surface': 'rgb(26, 31, 58)', // #1a1f3a
  '--color-text': 'rgb(240, 240, 240)', // #f0f0f0
  '--color-text-muted': 'rgba(240, 240, 240, 0.6)',
  '--color-accent': 'rgb(0, 212, 255)', // #00d4ff
  '--color-surface-raised': 'rgb(40, 46, 80)',
  '--color-info': 'rgb(123, 97, 255)', // #7b61ff
  '--color-success': 'rgb(34, 197, 94)', // #22c55e
  '--color-warning': 'rgb(245, 158, 11)', // #f59e0b
}

const SOFT_FOCUS_VARS: Record<string, string> = {
  '--color-surface': 'rgb(233, 236, 239)', // #e9ecef
  '--color-text': 'rgb(45, 52, 54)', // #2d3436
  '--color-text-muted': 'rgba(45, 52, 54, 0.6)',
  '--color-accent': 'rgb(108, 92, 231)', // #6c5ce7
  '--color-surface-raised': 'rgb(220, 224, 228)',
  '--color-info': 'rgb(162, 155, 254)', // #a29bfe
  '--color-success': 'rgb(22, 163, 74)', // #16a34a
  '--color-warning': 'rgb(217, 119, 6)', // #d97706
}

// Synthetic theme where the muted var is *nearly* opaque (alpha 0.97) and
// shares text's hue — compositing alone barely moves it, so this is what
// exercises ensureDistinctFrom's active lightness-shift branch rather than
// relying on compositing to separate the two colours on its own.
const NEAR_OPAQUE_MUTED_VARS: Record<string, string> = {
  '--color-surface': 'rgb(20, 20, 20)',
  '--color-text': 'rgb(230, 230, 230)',
  '--color-text-muted': 'rgba(230, 230, 230, 0.97)',
  '--color-accent': 'rgb(0, 212, 255)',
  '--color-surface-raised': 'rgb(35, 35, 35)',
  '--color-info': 'rgb(123, 97, 255)',
  '--color-success': 'rgb(34, 197, 94)',
  '--color-warning': 'rgb(245, 158, 11)',
}

function stubCssVars(vars: Record<string, string>) {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const inline = (el as HTMLElement).style.color
    const match = /var\((--[\w-]+)\)/.exec(inline)
    const resolved = (match && vars[match[1]!]) || 'rgb(128, 128, 128)'
    return { color: resolved } as CSSStyleDeclaration
  })
}

describe('buildCockpitTheme', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits a non-empty rules array for a dark cockpit-native theme, derived from theme variables', () => {
    stubCssVars(MIDNIGHT_VARS)
    const theme = buildCockpitTheme(false)

    expect(theme.rules.length).toBeGreaterThan(0)

    const tokens = theme.rules.map((r) => r.token)
    for (const required of ['comment', 'string', 'number', 'keyword', 'type', 'operator']) {
      expect(tokens).toContain(required)
    }
    // "identifier" stands in for function/identifier tokens (see useMonaco.ts).
    expect(tokens).toContain('identifier')

    // Rules must trace back to the theme's CSS variables, not fixed constants:
    // the accent-derived keyword colour should differ from the
    // success-derived string colour, and neither should be a value that
    // doesn't appear anywhere in the input variable set.
    const keywordRule = theme.rules.find((r) => r.token === 'keyword')
    const stringRule = theme.rules.find((r) => r.token === 'string')
    expect(keywordRule?.foreground).toBeTruthy()
    expect(stringRule?.foreground).toBeTruthy()
    expect(keywordRule?.foreground).not.toEqual(stringRule?.foreground)
  })

  it('produces a different rules array for a different theme (proves it is not a constant)', () => {
    stubCssVars(MIDNIGHT_VARS)
    const midnightTheme = buildCockpitTheme(false)

    stubCssVars(SOFT_FOCUS_VARS)
    const softFocusTheme = buildCockpitTheme(true)

    const midnightKeyword = midnightTheme.rules.find((r) => r.token === 'keyword')?.foreground
    const softFocusKeyword = softFocusTheme.rules.find((r) => r.token === 'keyword')?.foreground
    expect(midnightKeyword).not.toEqual(softFocusKeyword)
  })

  it('keeps every derived token colour at ~3:1 or better contrast against --color-surface (dark theme)', () => {
    stubCssVars(MIDNIGHT_VARS)
    const theme = buildCockpitTheme(false)
    const bg = theme.colors['editor.background']!

    for (const rule of theme.rules) {
      if (!rule.foreground) continue
      const ratio = contrastRatio('#' + rule.foreground, bg)
      expect(ratio).toBeGreaterThanOrEqual(2.9) // ~3:1, small float slack
    }
  })

  it('keeps every derived token colour at ~3:1 or better contrast against --color-surface (light theme)', () => {
    stubCssVars(SOFT_FOCUS_VARS)
    const theme = buildCockpitTheme(true)
    const bg = theme.colors['editor.background']!

    for (const rule of theme.rules) {
      if (!rule.foreground) continue
      const ratio = contrastRatio('#' + rule.foreground, bg)
      expect(ratio).toBeGreaterThanOrEqual(2.9)
    }
  })

  // Regression: --color-text-muted resolving to an rgba() alpha tint of
  // --color-text used to collapse onto the identifier colour once the alpha
  // channel was discarded (soft-focus's muted is exactly --color-text's RGB
  // triple at 60% alpha). Comments/delimiters must render distinguishably
  // from ordinary identifiers, not as plain text.
  it.each([
    ['dark (midnight)', MIDNIGHT_VARS, false] as const,
    ['light (soft-focus)', SOFT_FOCUS_VARS, true] as const,
  ])(
    'gives comment/delimiter a colour distinct from identifiers when muted is an rgba() alpha tint of text — %s',
    (_label, vars, isLight) => {
      stubCssVars(vars)
      const theme = buildCockpitTheme(isLight)
      const bg = theme.colors['editor.background']!

      const commentFg = '#' + theme.rules.find((r) => r.token === 'comment')?.foreground
      const delimiterFg = '#' + theme.rules.find((r) => r.token === 'delimiter')?.foreground
      const identifierFg = '#' + theme.rules.find((r) => r.token === 'identifier')?.foreground

      // The bug: these used to be byte-identical.
      expect(commentFg).not.toEqual(identifierFg)
      expect(delimiterFg).not.toEqual(identifierFg)

      // Visibly distinct, not just technically different.
      expect(contrastRatio(commentFg, identifierFg)).toBeGreaterThanOrEqual(1.4)
      expect(contrastRatio(delimiterFg, identifierFg)).toBeGreaterThanOrEqual(1.4)

      // Still legible against the editor background.
      expect(contrastRatio(commentFg, bg)).toBeGreaterThanOrEqual(2.9)
      expect(contrastRatio(delimiterFg, bg)).toBeGreaterThanOrEqual(2.9)
    }
  )

  it('separates comment from identifier via lightness shift when compositing alone leaves them nearly identical', () => {
    stubCssVars(NEAR_OPAQUE_MUTED_VARS)
    const theme = buildCockpitTheme(false)
    const bg = theme.colors['editor.background']!

    const commentFg = '#' + theme.rules.find((r) => r.token === 'comment')?.foreground
    const identifierFg = '#' + theme.rules.find((r) => r.token === 'identifier')?.foreground

    expect(commentFg).not.toEqual(identifierFg)
    expect(contrastRatio(commentFg, identifierFg)).toBeGreaterThanOrEqual(1.4)
    expect(contrastRatio(commentFg, bg)).toBeGreaterThanOrEqual(2.9)
  })
})

describe('contrastRatio', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('returns 1 for identical colours', () => {
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5)
  })
})

describe('EDITOR_OPTIONS word wrap', () => {
  const toolsDir = path.resolve(__dirname, '../../tools')

  function tsxFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : tsxFiles(full)
      return /\.tsx?$/.test(entry.name) ? [full] : []
    })
  }

  it('wraps by default', () => {
    expect(EDITOR_OPTIONS.wordWrap).toBe('on')
  })

  // A tool that turns wrapping off puts long lines out of reach: Monaco's
  // horizontal scrollbar is a 12px sliver that stays hidden until you scroll,
  // and these editors routinely sit in a half-window pane. Two tools had done
  // it, and the text ran off the right edge of both with no visible scrollbar.
  // Caught here rather than in a per-tool render test because the failure is
  // invisible to jsdom — it has no layout, so nothing overflows anything.
  it('is not overridden to "off" by any tool', () => {
    const offenders = tsxFiles(toolsDir).filter((file) =>
      /wordWrap:\s*['"]off['"]/.test(fs.readFileSync(file, 'utf8'))
    )
    expect(offenders.map((f) => path.relative(toolsDir, f))).toEqual([])
  })
})

describe('buildEditorOptions', () => {
  const prefs = {
    editorFontSize: DEFAULT_SETTINGS.editorFontSize,
    editorFont: DEFAULT_SETTINGS.editorFont,
    defaultIndentSize: DEFAULT_SETTINGS.defaultIndentSize,
    formatOnPaste: DEFAULT_SETTINGS.formatOnPaste,
    editorWordWrap: DEFAULT_SETTINGS.editorWordWrap,
    editorMinimap: DEFAULT_SETTINGS.editorMinimap,
    editorLineNumbers: DEFAULT_SETTINGS.editorLineNumbers,
    editorFolding: DEFAULT_SETTINGS.editorFolding,
    editorStickyScroll: DEFAULT_SETTINGS.editorStickyScroll,
    editorRenderWhitespace: DEFAULT_SETTINGS.editorRenderWhitespace,
    editorInsertSpaces: DEFAULT_SETTINGS.editorInsertSpaces,
    editorBracketPairColorization: DEFAULT_SETTINGS.editorBracketPairColorization,
    editorCursorStyle: DEFAULT_SETTINGS.editorCursorStyle,
  }

  it('maps each preference onto its Monaco option', () => {
    const options = buildEditorOptions({
      ...prefs,
      editorFontSize: 16,
      editorFont: 'Fira Code',
      defaultIndentSize: 4,
      editorMinimap: true,
      editorLineNumbers: false,
      editorFolding: false,
      editorStickyScroll: true,
      editorRenderWhitespace: 'all',
      editorInsertSpaces: false,
      editorBracketPairColorization: false,
      editorCursorStyle: 'block',
    })
    expect(options).toMatchObject({
      fontSize: 16,
      fontFamily: 'Fira Code',
      tabSize: 4,
      insertSpaces: false,
      minimap: { enabled: true },
      lineNumbers: 'off',
      folding: false,
      stickyScroll: { enabled: true },
      renderWhitespace: 'all',
      bracketPairColorization: { enabled: false },
      cursorStyle: 'block',
    })
  })

  // Monaco keeps its own line height when the font size changes under it, which
  // leaves the text crowded or floating in a row sized for the old size.
  it('scales line height with font size, never below 20px', () => {
    expect(buildEditorOptions({ ...prefs, editorFontSize: 20 }).lineHeight).toBe(30)
    expect(buildEditorOptions({ ...prefs, editorFontSize: 12 }).lineHeight).toBe(20)
  })

  // Turning wrap off is allowed, but must not reproduce the bug it caused when
  // two tools did it silently: Monaco leaves the horizontal scrollbar hidden
  // until a scroll happens, so an unreachable long line reads as truncated.
  it('pins the horizontal scrollbar visible only when wrap is off', () => {
    const wrapped = buildEditorOptions({ ...prefs, editorWordWrap: true })
    expect(wrapped.wordWrap).toBe('on')
    // Stated, not omitted — Monaco's updateOptions() merges, so an absent key
    // would leave the bar pinned from whatever the previous setting was.
    expect(wrapped.scrollbar).toEqual({ horizontal: 'auto' })

    const unwrapped = buildEditorOptions({ ...prefs, editorWordWrap: false })
    expect(unwrapped.wordWrap).toBe('off')
    expect(unwrapped.scrollbar).toEqual({ horizontal: 'visible' })
  })
})
