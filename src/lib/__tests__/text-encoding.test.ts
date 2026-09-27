import { describe, expect, it } from 'vitest'
import { decodeTextBytes, encodeText, UnencodableTextError } from '@/lib/text-encoding'

const bytes = (...values: number[]) => new Uint8Array(values)

describe('decodeTextBytes', () => {
  it('reads plain UTF-8', () => {
    expect(decodeTextBytes(new TextEncoder().encode('héllo'))).toEqual({
      content: 'héllo',
      encoding: 'utf-8',
    })
  })

  it('removes a UTF-8 BOM and records it', () => {
    expect(decodeTextBytes(bytes(0xef, 0xbb, 0xbf, 0x61))).toEqual({
      content: 'a',
      encoding: 'utf-8-bom',
    })
  })

  it('reads UTF-16 in both byte orders', () => {
    expect(decodeTextBytes(bytes(0xff, 0xfe, 0x61, 0x00))).toEqual({
      content: 'a',
      encoding: 'utf-16le',
    })
    expect(decodeTextBytes(bytes(0xfe, 0xff, 0x00, 0x61))).toEqual({
      content: 'a',
      encoding: 'utf-16be',
    })
  })

  it('falls back to Windows-1252 for bytes that are not valid UTF-8', () => {
    // "café €" in Windows-1252.
    expect(decodeTextBytes(bytes(0x63, 0x61, 0x66, 0xe9, 0x20, 0x80))).toEqual({
      content: 'café €',
      encoding: 'windows-1252',
    })
  })
})

describe('encodeText', () => {
  it('writes back the bytes it read for every encoding', () => {
    const samples = [
      new TextEncoder().encode('line one\r\nline two ✓'),
      bytes(0xef, 0xbb, 0xbf, 0x68, 0x69),
      bytes(0xff, 0xfe, 0x3d, 0xd8, 0x00, 0xde),
      bytes(0xfe, 0xff, 0xd8, 0x3d, 0xde, 0x00),
      // Every byte value, including the five 0x80–0x9F bytes with no Windows-1252 character.
      Uint8Array.from({ length: 256 }, (_, index) => index),
    ]
    for (const sample of samples) {
      const { content, encoding } = decodeTextBytes(sample)
      expect(encodeText(content, encoding)).toEqual(sample)
    }
  })

  it('refuses a character that Windows-1252 cannot store, and names the line', () => {
    expect(() => encodeText('ok\n✓', 'windows-1252')).toThrow(UnencodableTextError)
    expect(() => encodeText('ok\n✓', 'windows-1252')).toThrow(/Line 2/)
  })
})
