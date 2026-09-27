/**
 * Joins the byte ranges that `log_file_read` returns into log text.
 *
 * WARNING: `LogStream` keeps decoder state between ranges. Give it every range of one file in
 * order, and use a new stream for another file. A skipped range corrupts a character that the
 * two ranges share.
 *
 * The first read takes the tail of the file. Each later read starts where the previous one ended,
 * so a live log costs only the bytes that the writer appended. A read that does not continue the
 * previous one replaces the text:
 *
 * - The file got shorter, or the path now names a new file. The log rotated.
 * - More bytes arrived than one read returns. The text between the two reads is lost.
 */

/** The bytes that the first read of a log takes from the end of the file. */
export const LOG_TAIL_BYTES = 4 * 1024 * 1024
/** The largest append that one read takes. A larger append replaces the text with its tail. */
export const LOG_APPEND_BYTES = 4 * 1024 * 1024

const HEAD_BYTES = 4
const HEADER_BYTES = 8 + 8 + 8 + 4 + HEAD_BYTES

export type LogRange = {
  /** The file size that this read reached. The next read starts here. */
  size: number
  /** The file offset of the first byte in `bytes`. */
  begin: number
  /** Identifies the file behind the path. `0` means unknown. */
  identity: bigint
  /** The first bytes of the file, for byte order mark detection. */
  head: Uint8Array
  bytes: Uint8Array
}

/** Reads the header that `src-tauri/src/log_files.rs` writes. */
export function parseLogRange(response: ArrayBuffer | number[]): LogRange {
  const data =
    response instanceof ArrayBuffer ? new Uint8Array(response) : Uint8Array.from(response)
  if (data.length < HEADER_BYTES) throw new Error('The log read returned an incomplete response')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const headLength = Math.min(view.getUint32(24, true), HEAD_BYTES)
  return {
    size: Number(view.getBigUint64(0, true)),
    begin: Number(view.getBigUint64(8, true)),
    identity: view.getBigUint64(16, true),
    head: data.slice(28, 28 + headLength),
    bytes: data.subarray(HEADER_BYTES),
  }
}

export type LogEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252'

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte)
}

function isUtf8(bytes: Uint8Array): boolean {
  // A range can start or end inside a character. Skip continuation bytes at the start, and let
  // `stream` accept an incomplete character at the end.
  let start = 0
  while (start < Math.min(bytes.length, 3) && ((bytes[start] ?? 0) & 0xc0) === 0x80) start++
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start), { stream: true })
    return true
  } catch {
    return false
  }
}

/** Detects the encoding from a byte order mark, then from UTF-8 validity. */
export function detectLogEncoding(
  head: Uint8Array,
  sample: Uint8Array
): { encoding: LogEncoding; bomLength: number } {
  if (startsWith(head, [0xef, 0xbb, 0xbf])) return { encoding: 'utf-8', bomLength: 3 }
  if (startsWith(head, [0xff, 0xfe])) return { encoding: 'utf-16le', bomLength: 2 }
  if (startsWith(head, [0xfe, 0xff])) return { encoding: 'utf-16be', bomLength: 2 }
  return { encoding: isUtf8(sample) ? 'utf-8' : 'windows-1252', bomLength: 0 }
}

export type LogUpdate =
  | { kind: 'append'; text: string }
  | { kind: 'replace'; text: string; reason: 'open' | 'rotated' | 'skipped' }

/** The text of one log file, read in ranges. */
export class LogStream {
  private decoder = new TextDecoder('utf-8')
  private identity: bigint = 0n
  /** True when the previous text ended with a carriage return. */
  private afterCarriageReturn = false
  /** True when the next tail read shows a rotated file. */
  private rotating = false
  /** The offset that the next read starts at. `null` before the first read. */
  offset: number | null = null
  encoding: LogEncoding = 'utf-8'
  /** True when the text starts after the start of the file. */
  startsMidFile = false

  /** True when a read with `maxBytes` 0 shows new bytes or a new file. */
  hasChanged(range: LogRange): boolean {
    if (this.offset === null || range.size !== this.offset) return true
    return range.identity !== 0n && this.identity !== 0n && range.identity !== this.identity
  }

  /**
   * Accepts the range that a read from `offset` returned.
   *
   * Returns `null` when the range is from the wrong part of the file. Read again from `offset`,
   * which is then `null`.
   */
  accept(range: LogRange): LogUpdate | null {
    const requested = this.offset
    const newFile =
      range.identity !== 0n && this.identity !== 0n && range.identity !== this.identity
    if (requested !== null && newFile && range.size >= requested) {
      // The read started at the old offset of a new file. Read the tail of the new file instead.
      this.offset = null
      this.rotating = true
      return null
    }
    const rotated = requested !== null && (range.size < requested || newFile)
    if (requested !== null && !rotated && range.begin === requested) {
      this.offset = range.size
      const text = this.decoder.decode(range.bytes, { stream: true })
      return { kind: 'append', text: this.normalizeLineBreaks(text) }
    }
    const reason =
      requested === null ? (this.rotating ? 'rotated' : 'open') : rotated ? 'rotated' : 'skipped'
    return { kind: 'replace', text: this.start(range), reason }
  }

  /**
   * Changes CRLF and CR line breaks to LF, so the text length is the editor model length. A CRLF
   * pair can be split between two ranges.
   */
  private normalizeLineBreaks(text: string): string {
    if (!text) return text
    const rest = this.afterCarriageReturn && text.startsWith('\n') ? text.slice(1) : text
    this.afterCarriageReturn = text.endsWith('\r')
    return rest.replace(/\r\n?/g, '\n')
  }

  private start(range: LogRange): string {
    const { encoding, bomLength } = detectLogEncoding(range.head, range.bytes)
    this.encoding = encoding
    this.rotating = false
    this.identity = range.identity
    this.offset = range.size
    this.decoder = new TextDecoder(encoding)
    let bytes = range.bytes
    if (range.begin < bomLength) bytes = bytes.subarray(bomLength - range.begin)
    // UTF-16 code units start at an even offset after the byte order mark.
    const unitStart = Math.max(range.begin, bomLength)
    if (encoding.startsWith('utf-16') && (unitStart - bomLength) % 2 === 1) {
      bytes = bytes.subarray(1)
    }
    this.afterCarriageReturn = false
    const text = this.normalizeLineBreaks(this.decoder.decode(bytes, { stream: true }))
    this.startsMidFile = range.begin > bomLength
    if (!this.startsMidFile) return text
    // A tail can start inside a line. Show whole lines only, unless the tail is one line. A tail
    // that starts exactly at a line start loses that line, because the byte before is not read.
    const lineStart = text.indexOf('\n')
    return lineStart === -1 ? text : text.slice(lineStart + 1)
  }
}
