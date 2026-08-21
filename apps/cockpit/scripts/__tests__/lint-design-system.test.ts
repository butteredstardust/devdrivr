import { describe, expect, it } from 'vitest'
import { lintSource } from '../lint-design-system.mjs'

type Violation = { line: number; rule: string; match: string; message: string }
const lint = (text: string, file = 'Sample.tsx'): Violation[] =>
  (lintSource as (t: string, f?: string) => Violation[])(text, file)

const rulesFor = (text: string) => lint(text).map((v) => v.rule)

describe('design-system lint rules', () => {
  describe('dimmed-muted-text', () => {
    // --color-text-muted already carries 0.6-0.75 alpha in every theme. An opacity utility on
    // top composites the two: measured across all 23 themes the result was 2.42-3.55:1, an AA
    // failure everywhere, while muted alone is 5.21-7.37:1. The rule exists because that
    // compounding is invisible in review — both halves look reasonable on their own.
    it('flags an unprefixed opacity utility on muted text', () => {
      expect(rulesFor('className="text-xs text-[var(--color-text-muted)] opacity-60"')).toContain(
        'dimmed-muted-text'
      )
    })

    it('flags it in either order', () => {
      expect(rulesFor('className="opacity-40 text-[var(--color-text-muted)]"')).toContain(
        'dimmed-muted-text'
      )
    })

    it('ignores disabled: opacity, which WCAG exempts', () => {
      expect(
        rulesFor('className="text-[var(--color-text-muted)] disabled:opacity-50"')
      ).not.toContain('dimmed-muted-text')
    })

    it('ignores hover and focus reveal states', () => {
      expect(
        rulesFor(
          'className="text-[var(--color-text-muted)] group-hover:opacity-100 focus-visible:opacity-100"'
        )
      ).not.toContain('dimmed-muted-text')
    })

    it('ignores opacity-0, which hides rather than dims', () => {
      expect(
        rulesFor('className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100"')
      ).not.toContain('dimmed-muted-text')
    })

    it('does not flag opacity on non-muted text', () => {
      expect(rulesFor('className="text-[var(--color-text)] opacity-60"')).not.toContain(
        'dimmed-muted-text'
      )
    })

    it('does not reach across separate class strings on one line', () => {
      expect(
        rulesFor('<p className="opacity-60" /><p className="text-[var(--color-text-muted)]" />')
      ).not.toContain('dimmed-muted-text')
    })
  })

  describe('off-scale-icon', () => {
    // 9 was absent from this rule until 2026-08-21, which is why four size={9} sites outlived
    // the sweep that retired 10/11/13/15.
    it.each([9, 10, 11, 13, 15])('flags size={%i}', (size) => {
      expect(rulesFor(`<TagIcon size={${size}} />`)).toContain('off-scale-icon')
    })

    it.each([12, 14, 16])('allows size={%i}', (size) => {
      expect(rulesFor(`<TagIcon size={${size}} />`)).not.toContain('off-scale-icon')
    })

    it('only applies to .tsx files', () => {
      expect(lint('<TagIcon size={9} />', 'helper.ts').map((v) => v.rule)).not.toContain(
        'off-scale-icon'
      )
    })
  })

  describe('escape hatch', () => {
    it('honours an ignore comment with a reason on the preceding line', () => {
      const text = ['/* design-system-ignore: third-party markup */', '<TagIcon size={9} />'].join(
        '\n'
      )
      expect(rulesFor(text)).not.toContain('off-scale-icon')
    })

    it('rejects an ignore comment with no reason', () => {
      const text = ['/* design-system-ignore: */', '<TagIcon size={9} />'].join('\n')
      expect(rulesFor(text)).toContain('off-scale-icon')
    })
  })
})
