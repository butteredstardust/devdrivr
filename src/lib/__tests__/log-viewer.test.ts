import { describe, expect, it } from 'vitest'
import { appendLogText, countLineBreaks, prepareLogContent } from '@/lib/log-viewer'

describe('appendLogText', () => {
  it('appends without a cut below the limit', () => {
    expect(appendLogText('a\n', 'b\n', 10)).toEqual({ content: 'a\nb\n', removed: 0 })
  })

  it('cuts at the next line start above the limit', () => {
    expect(appendLogText('one\ntwo\n', 'three\n', 10)).toEqual({ content: 'three\n', removed: 8 })
  })

  it('cuts inside a line that has no line start after the cut', () => {
    expect(appendLogText('', 'abcdefghij\n', 4)).toEqual({ content: 'hij\n', removed: 7 })
  })

  it('counts a cut that removes part of the appended text', () => {
    const { content, removed } = appendLogText('old\n', 'x\nnewest\n', 7)
    expect(content).toBe('newest\n')
    expect(removed).toBe(6)
  })
})

describe('prepareLogContent', () => {
  it('reports a cut as a tail', () => {
    expect(prepareLogContent('short')).toEqual({ content: 'short', truncated: false })
  })
})

describe('countLineBreaks', () => {
  it('counts the lines that an append completes', () => {
    expect(countLineBreaks('')).toBe(0)
    expect(countLineBreaks('partial')).toBe(0)
    expect(countLineBreaks('a\nb\n')).toBe(2)
  })
})
