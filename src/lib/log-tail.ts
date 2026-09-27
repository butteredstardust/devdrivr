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
 * - The file got shorter, the path names a new file, or the bytes before the offset changed. The
 *   log rotated.
 * - More bytes arrived than one read returns. The text between the two reads is lost.
 *
 * Each later read also takes the last `LOG_OVERLAP_BYTES` again. Equal bytes prove that the file
 * did not change in place. A copy-truncate rotation that grows past the old size before the next
 * read keeps the size and the identity, and only these bytes show it.
 */

/** The bytes that the first read of a log takes from the end of the file. */
export const LOG_TAIL_BYTES = 4 * 1024 * 1024
/** The largest append that one read takes. A larger append replaces the text with its tail. */
export const LOG_APPEND_BYTES = 4 * 1024 * 1024
/** The bytes before the offset that each later read takes again. See the module comment. */
export const LOG_OVERLAP_BYTES = 64
/**
 * The bytes before the tail that the first read takes. The tail drops its partial first line, so
 * a line that starts exactly at the tail stays only when the bytes before it are read.
 */
const TAIL_CONTEXT_BYTES = 2

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

/* eslint-disable no-control-regex -- ANSI escape sequences start with the ESC control character. */
/** CSI (colours, cursor moves), OSC (titles, links), character set and two-byte escapes. */
const ANSI_SEQUENCE =
  /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()*+][\x20-\x7e]|[@-Z\\-_])/g
/** An escape at the end of the text that the next range can complete. */
const ANSI_PARTIAL = /\x1b(?:\[[0-?]*[ -/]*|\][^\x07\x1b]*\x1b?|[()*+])?$/
/* eslint-enable no-control-regex */
/** The longest partial escape to hold back. A longer one is not an escape. */
const MAX_PARTIAL_ESCAPE = 256

/** Removes ANSI colour and cursor escape sequences. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_SEQUENCE, '')
}

export type LogEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252'

function startsWith(bytes: Uint8Array, prefix: ArrayLike<number>): boolean {
  if (bytes.length < prefix.length) return false
  for (let index = 0; index < prefix.length; index++) {
    if (bytes[index] !== prefix[index]) return false
  }
  return true
}

function hasNonAscii(bytes: Uint8Array): boolean {
  return bytes.some((byte) => byte >= 0x80)
}

/** Skips the continuation bytes of a UTF-8 character that started before `bytes`. */
function skipContinuation(bytes: Uint8Array): Uint8Array {
  let start = 0
  while (start < Math.min(bytes.length, 3) && ((bytes[start] ?? 0) & 0xc0) === 0x80) start++
  return bytes.subarray(start)
}

/**
 * Checks whether `sample` is UTF-8. A range can end inside a character. It can also start
 * inside one when `startsInside` is true.
 *
 * Returns `incomplete` when the end is an incomplete character and nothing before it proves
 * UTF-8. Windows-1252 text that ends in `é` looks the same. A complete multi-byte character
 * proves UTF-8.
 */
function checkUtf8(sample: Uint8Array, startsInside: boolean): 'utf-8' | 'invalid' | 'incomplete' {
  const bytes = startsInside ? skipContinuation(sample) : sample
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return 'utf-8'
  } catch {
    // Continue, and check for an incomplete character at the end.
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true })
  } catch {
    return 'invalid'
  }
  return hasNonAscii(bytes.subarray(0, incompleteStart(bytes))) ? 'utf-8' : 'incomplete'
}

/** Returns the index of the lead byte of the incomplete UTF-8 character at the end of `bytes`. */
function incompleteStart(bytes: Uint8Array): number {
  let end = bytes.length
  while (end > 0 && ((bytes[end - 1] ?? 0) & 0xc0) === 0x80) end--
  return Math.max(0, end - 1)
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  if (first.length === 0) return second
  const joined = new Uint8Array(first.length + second.length)
  joined.set(first)
  joined.set(second, first.length)
  return joined
}

function lastBytes(previous: Uint8Array, next: Uint8Array): Uint8Array {
  const joined = concatBytes(previous, next)
  return joined.slice(Math.max(0, joined.length - LOG_OVERLAP_BYTES))
}

/**
 * Detects the encoding from a byte order mark, then from UTF-8 validity. An incomplete character
 * at the end of a file does not prove UTF-8.
 */
export function detectLogEncoding(
  head: Uint8Array,
  sample: Uint8Array
): { encoding: LogEncoding; bomLength: number } {
  if (startsWith(head, [0xef, 0xbb, 0xbf])) return { encoding: 'utf-8', bomLength: 3 }
  if (startsWith(head, [0xff, 0xfe])) return { encoding: 'utf-16le', bomLength: 2 }
  if (startsWith(head, [0xfe, 0xff])) return { encoding: 'utf-16be', bomLength: 2 }
  return { encoding: checkUtf8(sample, true) === 'utf-8' ? 'utf-8' : 'windows-1252', bomLength: 0 }
}

export type LogUpdate =
  | { kind: 'append'; text: string }
  | { kind: 'replace'; text: string; reason: 'open' | 'rotated' | 'skipped' }

/** The text of one log file, read in ranges. */
export class LogStream {
  private decoder = new TextDecoder('utf-8')
  private identity: bigint = 0n
  /** The last file bytes before `offset`, up to `LOG_OVERLAP_BYTES`. */
  private seen: Uint8Array = new Uint8Array(0)
  /**
   * True while every byte was ASCII and no byte order mark named the encoding. The first byte
   * above 0x7f then decides between UTF-8 and Windows-1252. ASCII decodes the same in both.
   */
  private tentative = false
  /** An incomplete character that a tentative stream holds back until the next bytes decide. */
  private pending: Uint8Array = new Uint8Array(0)
  /** True when the previous text ended with a carriage return. */
  private afterCarriageReturn = false
  /** The start of an escape sequence that the previous text ended with. */
  private partialEscape = ''
  /** True when the next tail read shows a rotated file. */
  private rotating = false
  /** The offset that the next read continues from. `null` before the first read. */
  offset: number | null = null
  encoding: LogEncoding = 'utf-8'
  /** True when the text starts after the start of the file. */
  startsMidFile = false

  /**
   * Returns the arguments of the next `log_file_read`. A probe reads no new bytes. It only checks
   * the size, the identity and the bytes before `offset`.
   */
  nextRead(probe: boolean): { start: number | null; maxBytes: number } {
    if (this.offset === null) return { start: null, maxBytes: LOG_TAIL_BYTES + TAIL_CONTEXT_BYTES }
    return {
      start: this.offset - this.seen.length,
      maxBytes: this.seen.length + (probe ? 0 : LOG_APPEND_BYTES),
    }
  }

  private isNewFile(range: LogRange): boolean {
    return range.identity !== 0n && this.identity !== 0n && range.identity !== this.identity
  }

  /** True when the range from `nextRead` shows new bytes, a new file or changed bytes. */
  hasChanged(range: LogRange): boolean {
    if (this.offset === null || range.size !== this.offset || this.isNewFile(range)) return true
    const start = this.offset - this.seen.length
    return range.begin !== start || !startsWith(range.bytes, this.seen)
  }

  /**
   * Accepts the range that the read from `nextRead` returned.
   *
   * Returns `null` when the log rotated. Read again. The next read takes the tail of the new file.
   */
  accept(range: LogRange): LogUpdate | null {
    const requested = this.offset
    if (requested === null) return this.replace(range, this.rotating ? 'rotated' : 'open')
    const start = requested - this.seen.length
    const grew = range.size >= requested && !this.isNewFile(range)
    if (grew && range.begin === start && startsWith(range.bytes, this.seen)) {
      return { kind: 'append', text: this.append(range.bytes.subarray(this.seen.length)) }
    }
    // More bytes arrived than one read returns, so the bytes before `offset` are not in the range.
    if (grew && range.begin > start) return this.replace(range, 'skipped')
    this.offset = null
    this.rotating = true
    return null
  }

  private append(bytes: Uint8Array): string {
    this.offset = (this.offset ?? 0) + bytes.length
    this.seen = lastBytes(this.seen, bytes)
    // `decide` can replace the decoder, so call it first.
    const decided = this.decide(bytes)
    return this.clean(this.decoder.decode(decided, { stream: true }))
  }

  /** Decides the encoding of a tentative stream, and returns the bytes to decode now. */
  private decide(bytes: Uint8Array): Uint8Array {
    if (!this.tentative) return bytes
    const joined = concatBytes(this.pending, bytes)
    this.pending = new Uint8Array(0)
    if (!hasNonAscii(joined)) return joined
    // The bytes before were ASCII, so `joined` starts at a character.
    const check = checkUtf8(joined, false)
    if (check === 'incomplete') {
      // A writer can add the rest of the character later. Only ASCII comes before it.
      const lead = incompleteStart(joined)
      this.pending = joined.slice(lead)
      return joined.subarray(0, lead)
    }
    this.tentative = false
    this.encoding = check === 'utf-8' ? 'utf-8' : 'windows-1252'
    this.decoder = new TextDecoder(this.encoding)
    return joined
  }

  /**
   * Removes ANSI escapes, and changes CRLF and CR line breaks to LF, so the text length is the
   * editor model length. Two ranges can split an escape or a CRLF pair.
   */
  private clean(decoded: string): string {
    let text = this.partialEscape + decoded
    this.partialEscape = ''
    const partial = ANSI_PARTIAL.exec(text)
    if (partial && partial[0].length <= MAX_PARTIAL_ESCAPE) {
      this.partialEscape = partial[0]
      text = text.slice(0, partial.index)
    }
    text = stripAnsi(text)
    if (!text) return text
    const rest = this.afterCarriageReturn && text.startsWith('\n') ? text.slice(1) : text
    this.afterCarriageReturn = text.endsWith('\r')
    return rest.replace(/\r\n?/g, '\n')
  }

  private replace(range: LogRange, reason: 'open' | 'rotated' | 'skipped'): LogUpdate {
    return { kind: 'replace', text: this.start(range), reason }
  }

  private start(range: LogRange): string {
    const detected = detectLogEncoding(range.head, range.bytes)
    const { bomLength } = detected
    let encoding = detected.encoding
    this.rotating = false
    this.identity = range.identity
    this.offset = range.size
    this.seen = lastBytes(new Uint8Array(0), range.bytes)
    let bytes = range.bytes
    if (range.begin < bomLength) bytes = bytes.subarray(bomLength - range.begin)
    // UTF-16 code units start at an even offset after the byte order mark.
    const unitStart = Math.max(range.begin, bomLength)
    if (encoding.startsWith('utf-16') && (unitStart - bomLength) % 2 === 1) {
      bytes = bytes.subarray(1)
    }
    this.startsMidFile = range.begin > bomLength
    // ASCII, or an incomplete character at the end, does not decide the encoding. See `decide`.
    const undecided =
      bomLength === 0 &&
      (encoding === 'utf-8'
        ? !hasNonAscii(skipContinuation(bytes))
        : checkUtf8(bytes, this.startsMidFile) === 'incomplete')
    if (undecided) encoding = 'utf-8'
    if (encoding === 'utf-8' && this.startsMidFile) bytes = skipContinuation(bytes)
    this.encoding = encoding
    this.decoder = new TextDecoder(encoding)
    this.tentative = undecided
    this.pending = new Uint8Array(0)
    this.afterCarriageReturn = false
    this.partialEscape = ''
    const decided = this.decide(bytes)
    const text = this.clean(this.decoder.decode(decided, { stream: true }))
    if (!this.startsMidFile) return text
    // A tail can start inside a line. Show whole lines only, unless the tail is one line. The
    // tail read takes `TAIL_CONTEXT_BYTES` more, so a line that starts at the tail stays.
    const lineStart = text.indexOf('\n')
    return lineStart === -1 ? text : text.slice(lineStart + 1)
  }
}
