import { describe, expect, it } from 'vitest'
import {
  MAX_REGEX_MATCHES,
  escapeHtml,
  evaluateRegex,
  extractCaptureGroupNames,
} from '@/workers/regex.api'

function evaluate(pattern: string, flags: string, text: string, replacement = '') {
  return evaluateRegex({ pattern, flags, text, replacement })
}

describe('escapeHtml', () => {
  it('escapes angle brackets, quotes, and ampersands', () => {
    expect(escapeHtml('<script>alert("xss" & 1)</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot; &amp; 1)&lt;/script&gt;'
    )
  })
})

describe('extractCaptureGroupNames', () => {
  it('keeps unnamed groups alongside named ones and skips non-capturing constructs', () => {
    expect(extractCaptureGroupNames('([A-Z])(?:x)(?<digits>\\d+)(?=y)')).toEqual([null, 'digits'])
  })

  it('ignores parentheses inside character classes and escapes', () => {
    expect(extractCaptureGroupNames('[(]\\((a)')).toEqual([null])
  })
})

describe('evaluateRegex', () => {
  it('returns an empty evaluation for an empty pattern', () => {
    const result = evaluate('', 'g', 'anything')
    expect(result).toEqual({
      matches: [],
      matchError: null,
      truncated: false,
      highlightHtml: '',
      replaceResult: 'anything',
      replaceError: null,
    })
  })

  it('collects global matches with capture groups', () => {
    const result = evaluate('([a-z])(\\d)', 'g', 'a1 b2')
    expect(result.matches.map((m) => m.full)).toEqual(['a1', 'b2'])
    expect(result.matches[0]?.index).toBe(0)
    expect(result.matches[0]?.groups).toEqual([
      { index: 1, name: null, value: 'a' },
      { index: 2, name: null, value: '1' },
    ])
    expect(result.matchError).toBeNull()
  })

  it('reports only the first match without the g flag but still highlights all', () => {
    const result = evaluate('a', '', 'aaa')
    expect(result.matches).toHaveLength(1)
    expect(result.highlightHtml.match(/<mark/g)).toHaveLength(3)
    expect(result.truncated).toBe(false)
  })

  it('escapes HTML in both matched and unmatched text', () => {
    const result = evaluate('bold', 'g', '<b>bold</b>')
    expect(result.highlightHtml).toContain('&lt;b&gt;')
    expect(result.highlightHtml).toContain('>bold</mark>')
    expect(result.highlightHtml).not.toContain('<b>')
  })

  it('truncates at the match cap and flags it', () => {
    const result = evaluate('.', 'g', 'a'.repeat(MAX_REGEX_MATCHES + 205))
    expect(result.matches).toHaveLength(MAX_REGEX_MATCHES)
    expect(result.truncated).toBe(true)
  })

  it('does not loop forever on a zero-width match', () => {
    const result = evaluate('x*', 'g', 'ab')
    expect(result.matches.length).toBeLessThanOrEqual(3)
  })

  it('applies the replacement with capture group references', () => {
    const result = evaluate('(\\w+)@(\\w+)', 'g', 'me@here you@there', '$2:$1')
    expect(result.replaceResult).toBe('here:me there:you')
    expect(result.replaceError).toBeNull()
  })

  it('reuses one compiled pattern: scanning does not disturb the replacement', () => {
    // The global scan advances lastIndex; String.replace must still see the whole input.
    const result = evaluate('a', 'g', 'aaa', 'b')
    expect(result.matches).toHaveLength(3)
    expect(result.replaceResult).toBe('bbb')
  })

  it('surfaces an invalid pattern as an error on both paths and leaves text intact', () => {
    const result = evaluate('[invalid', 'g', '<b>text</b>')
    expect(result.matchError).toBeTruthy()
    expect(result.replaceError).toBe(result.matchError)
    expect(result.matches).toEqual([])
    expect(result.replaceResult).toBe('<b>text</b>')
    expect(result.highlightHtml).toBe('&lt;b&gt;text&lt;/b&gt;')
  })
})
