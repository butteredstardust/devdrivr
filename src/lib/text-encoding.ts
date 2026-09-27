/**
 * Byte-exact decode and encode for text documents that must save back unchanged.
 *
 * WARNING: `readTextFile` from the fs plugin is not safe for editing. It decodes as UTF-8 with
 * replacement characters and removes a byte order mark, so a save writes different bytes. Use
 * `decodeTextBytes` and `encodeText` for any document that the user can save.
 *
 * Windows-1252 is the fallback for bytes that are not valid UTF-8. Each of its 256 byte values
 * decodes to a different code point, so an unedited region always saves back to the same bytes.
 * This stays true when the file really uses another legacy encoding.
 */

export type TextFileEncoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'windows-1252'

export const TEXT_FILE_ENCODINGS: { id: TextFileEncoding; label: string }[] = [
  { id: 'utf-8', label: 'UTF-8' },
  { id: 'utf-8-bom', label: 'UTF-8 with BOM' },
  { id: 'utf-16le', label: 'UTF-16 LE' },
  { id: 'utf-16be', label: 'UTF-16 BE' },
  { id: 'windows-1252', label: 'Windows-1252' },
]

export function textEncodingLabel(encoding: TextFileEncoding): string {
  return TEXT_FILE_ENCODINGS.find((item) => item.id === encoding)?.label ?? encoding
}

export function isTextFileEncoding(value: unknown): value is TextFileEncoding {
  return TEXT_FILE_ENCODINGS.some((item) => item.id === value)
}

export type DecodedText = { content: string; encoding: TextFileEncoding }

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte)
}

function decodeStrict(bytes: Uint8Array, label: string): string | null {
  try {
    // `ignoreBOM` keeps a second BOM in the text. The caller already removed the first one.
    return new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return null
  }
}

function decodeWindows1252(bytes: Uint8Array): DecodedText {
  return { content: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' }
}

/** Detects the encoding from a byte order mark, then from UTF-8 validity. Never loses bytes. */
export function decodeTextBytes(bytes: Uint8Array): DecodedText {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
    const content = decodeStrict(bytes.subarray(3), 'utf-8')
    return content === null ? decodeWindows1252(bytes) : { content, encoding: 'utf-8-bom' }
  }
  if (startsWith(bytes, [0xff, 0xfe])) {
    const content = decodeStrict(bytes.subarray(2), 'utf-16le')
    if (content !== null) return { content, encoding: 'utf-16le' }
  }
  if (startsWith(bytes, [0xfe, 0xff])) {
    const content = decodeStrict(bytes.subarray(2), 'utf-16be')
    if (content !== null) return { content, encoding: 'utf-16be' }
  }
  const content = decodeStrict(bytes, 'utf-8')
  return content === null ? decodeWindows1252(bytes) : { content, encoding: 'utf-8' }
}

// Windows-1252 bytes 0x80–0x9F that decode to a code point other than the byte value.
// The other five bytes in that range (0x81, 0x8D, 0x8F, 0x90, 0x9D) decode to themselves.
const WINDOWS_1252_HIGH: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
}
const WINDOWS_1252_REMAPPED_BYTES = new Set(Object.values(WINDOWS_1252_HIGH))

/** Thrown when the document has a character that the target encoding cannot store. */
export class UnencodableTextError extends Error {}

function lineOf(content: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++
  return line
}

function encodeWindows1252(content: string): Uint8Array {
  const bytes = new Uint8Array(content.length)
  let length = 0
  let index = 0
  for (const character of content) {
    const codePoint = character.codePointAt(0) ?? 0
    const mapped =
      codePoint < 0x100 && !WINDOWS_1252_REMAPPED_BYTES.has(codePoint)
        ? codePoint
        : WINDOWS_1252_HIGH[codePoint]
    if (mapped === undefined) {
      throw new UnencodableTextError(
        `Line ${lineOf(content, index)} contains "${character}", which Windows-1252 cannot store. Change the encoding to UTF-8.`
      )
    }
    bytes[length++] = mapped
    index += character.length
  }
  return bytes.subarray(0, length)
}

function encodeUtf16(content: string, littleEndian: boolean): Uint8Array {
  const bytes = new Uint8Array(2 + content.length * 2)
  const view = new DataView(bytes.buffer)
  view.setUint16(0, 0xfeff, littleEndian)
  for (let i = 0; i < content.length; i++) {
    view.setUint16(2 + i * 2, content.charCodeAt(i), littleEndian)
  }
  return bytes
}

// A surrogate half with no partner. UTF-8 would store it as U+FFFD, and UTF-16 would store bytes
// that no strict decoder accepts.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

function assertNoLoneSurrogate(content: string): void {
  const match = LONE_SURROGATE.exec(content)
  if (match) {
    throw new UnencodableTextError(
      `Line ${lineOf(content, match.index)} contains an incomplete character that no Unicode encoding can store. Remove it and save again.`
    )
  }
}

/**
 * Encodes the document for disk, with the BOM that the encoding requires.
 *
 * Throws `UnencodableTextError` before anything is written, so a failed save leaves the file as
 * it was.
 */
export function encodeText(content: string, encoding: TextFileEncoding): Uint8Array {
  if (encoding !== 'windows-1252') assertNoLoneSurrogate(content)
  switch (encoding) {
    case 'utf-8':
      return new TextEncoder().encode(content)
    case 'utf-8-bom': {
      const body = new TextEncoder().encode(content)
      const bytes = new Uint8Array(body.length + 3)
      bytes.set([0xef, 0xbb, 0xbf])
      bytes.set(body, 3)
      return bytes
    }
    case 'utf-16le':
      return encodeUtf16(content, true)
    case 'utf-16be':
      return encodeUtf16(content, false)
    case 'windows-1252':
      return encodeWindows1252(content)
  }
}
