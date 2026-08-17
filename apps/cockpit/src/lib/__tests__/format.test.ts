import { describe, expect, it } from 'vitest'
import { formatBytes, formatTextBytes } from '@/lib/format'

describe('formatBytes', () => {
  it('leaves sub-kilobyte counts as whole bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('switches tier exactly at the boundary, not one unit late', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('reaches the MB tier', () => {
    // The regression this replaces: two tools stopped at KB and rendered this as `5120.0 KB`.
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('uses one decimal above the byte tier', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })
})

describe('formatTextBytes', () => {
  it('measures UTF-8 bytes rather than UTF-16 code units', () => {
    expect(formatTextBytes('abc')).toBe('3 B')
    // Three code points, nine UTF-8 bytes — `String.length` would say 3.
    expect(formatTextBytes('日本語')).toBe('9 B')
  })

  it('counts an astral character as four bytes', () => {
    expect(formatTextBytes('😀')).toBe('4 B')
  })
})
