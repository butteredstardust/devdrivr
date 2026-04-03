import { describe, expect, it } from 'vitest'

// Test the pure highlightMatches logic by extracting escapeHtml behavior
// We test the escaping function and match logic independently

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightMatches(text: string, pattern: string, flags: string): string {
  if (!pattern || !text) return ''
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
    const parts: string[] = []
    let lastIndex = 0
    let m: RegExpExecArray | null
    let guard = 0
    while ((m = re.exec(text)) !== null && guard < 1000) {
      guard++
      parts.push(escapeHtml(text.slice(lastIndex, m.index)))
      parts.push(`<mark>${escapeHtml(m[0])}</mark>`)
      lastIndex = m.index + m[0].length
      if (m[0] === '') re.lastIndex++
    }
    parts.push(escapeHtml(text.slice(lastIndex)))
    return parts.join('')
  } catch {
    return escapeHtml(text)
  }
}

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    )
  })

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })
})

describe('highlightMatches', () => {
  it('wraps matches in mark tags', () => {
    const result = highlightMatches('hello world', 'world', 'g')
    expect(result).toBe('hello <mark>world</mark>')
  })

  it('handles multiple matches', () => {
    const result = highlightMatches('abab', 'ab', 'g')
    expect(result).toBe('<mark>ab</mark><mark>ab</mark>')
  })

  it('escapes HTML in text before wrapping', () => {
    const result = highlightMatches('<b>bold</b>', 'bold', 'g')
    expect(result).toBe('&lt;b&gt;<mark>bold</mark>&lt;/b&gt;')
  })

  it('escapes HTML inside matched text', () => {
    const result = highlightMatches('<img onerror=alert(1)>', '<img', 'g')
    expect(result).toBe('<mark>&lt;img</mark> onerror=alert(1)&gt;')
  })

  it('returns empty string for empty pattern', () => {
    expect(highlightMatches('hello', '', 'g')).toBe('')
  })

  it('returns empty string for empty text', () => {
    expect(highlightMatches('', 'test', 'g')).toBe('')
  })

  it('returns escaped text for invalid regex', () => {
    const result = highlightMatches('<b>text</b>', '[invalid', 'g')
    expect(result).toBe('&lt;b&gt;text&lt;/b&gt;')
  })

  it('handles zero-width matches without infinite loop', () => {
    const result = highlightMatches('ab', '', 'g')
    // Empty pattern with 'g' flag — should not hang
    expect(result).toBe('')
  })
})
