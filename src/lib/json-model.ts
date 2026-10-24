import { documentStats } from '@/lib/traversal'

/**
 * JSON Tools' document model: parsing, error location, and the shape questions the views ask.
 *
 * Split out of `JsonTools.tsx` when that file reached 1,461 lines holding these helpers, the tool
 * component, a tree view and a table view. None of this touches React.
 */

/**
 * An unterminated JSONC construct. Carries the original source offset so the editor can jump
 * to it exactly like a `JSON.parse` failure.
 */
export class JsoncSyntaxError extends Error {
  constructor(
    message: string,
    readonly index: number
  ) {
    super(message)
    this.name = 'JsoncSyntaxError'
  }
}

export type JsonView = 'source' | 'tree' | 'table'

export function normalizeJsonc(source: string): string {
  const chars = [...source]
  let inString = false
  let escaping = false
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    const next = chars[index + 1]
    if (inString) {
      if (escaping) escaping = false
      else if (char === '\\') escaping = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '/' && next === '/') {
      chars[index] = ' '
      chars[index + 1] = ' '
      index += 2
      while (index < chars.length && chars[index] !== '\n') {
        chars[index] = ' '
        index += 1
      }
      index -= 1
      continue
    }
    if (char === '/' && next === '*') {
      const openedAt = index
      chars[index] = ' '
      chars[index + 1] = ' '
      index += 2
      while (index < chars.length && !(chars[index] === '*' && chars[index + 1] === '/')) {
        if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' '
        index += 1
      }
      if (index >= chars.length) {
        throw new JsoncSyntaxError('Unterminated block comment', openedAt)
      }
      chars[index] = ' '
      chars[index + 1] = ' '
      index += 1
    }
  }
  return chars.join('').replace(/,(\s*[}\]])/g, ' $1')
}

/** Above this many keys the tree starts collapsed — expanding is one click. */
export const LARGE_DOCUMENT_KEYS = 500

/**
 * Table view has no collapsing to fall back on: every key becomes a DOM node the
 * moment the view opens, and the nested renderer recurses once per level. Above
 * this many keys it asks first rather than freezing the pane on a document the
 * user only meant to glance at.
 */
export const LARGE_TABLE_KEYS = LARGE_DOCUMENT_KEYS

/**
 * Nested tables stop nesting here and print the remaining subtree as compact
 * JSON. Two reasons: past ~20 levels each cell is a few pixels wide and unreadable
 * anyway, and a hand-built document can nest deeply enough to overflow the render
 * stack, which takes the whole app down rather than just the pane.
 */
export const MAX_NESTED_TABLE_DEPTH = 20

export const VIEW_OPTIONS = [
  { value: 'source' as const, label: 'Source' },
  { value: 'tree' as const, label: 'Tree' },
  { value: 'table' as const, label: 'Table' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Statistics and Sort Keys both run over freshly parsed, arbitrary user input, so they share
// the bounded walkers rather than recursing without limits.
export function jsonStats(data: unknown) {
  return documentStats([data])
}

class JsonScanError {
  constructor(readonly index: number) {}
}

export const NUMBER_PATTERN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y

/**
 * Finds the offset of the first character that breaks the document.
 *
 * V8 puts `position N` in the message; JavaScriptCore — the engine behind
 * WKWebView, i.e. the one this app actually ships on — says only
 * `JSON Parse error: Unexpected EOF`. Relying on the message means the whole
 * "jump to the error" feature is dead in the release build, so scan the source
 * ourselves. Only ever runs on documents `JSON.parse` already rejected.
 */
export function scanJsonErrorIndex(source: string): number | null {
  let i = 0

  // A declaration, not a `const` arrow: only the former lets control-flow
  // analysis treat `fail()` as terminating.
  function fail(): never {
    throw new JsonScanError(Math.min(i, Math.max(source.length - 1, 0)))
  }

  function skipWhitespace() {
    while (i < source.length) {
      const c = source[i]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++
      else break
    }
  }

  function scanString() {
    i++ // opening quote
    while (i < source.length) {
      const c = source[i]
      if (c === undefined) break
      if (c === '"') {
        i++
        return
      }
      if (c === '\\') {
        const escape = source[i + 1]
        if (escape === undefined) fail()
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(i + 2, i + 6))) fail()
          i += 6
          continue
        }
        if (!'"\\/bfnrt'.includes(escape)) fail()
        i += 2
        continue
      }
      if (c < ' ') fail() // raw control characters must be escaped
      i++
    }
    fail() // unterminated
  }

  function scanValue() {
    skipWhitespace()
    if (i >= source.length) fail()
    const c = source[i]
    if (c === '{') return scanObject()
    if (c === '[') return scanArray()
    if (c === '"') return scanString()
    if (source.startsWith('true', i)) return void (i += 4)
    if (source.startsWith('false', i)) return void (i += 5)
    if (source.startsWith('null', i)) return void (i += 4)
    NUMBER_PATTERN.lastIndex = i
    const number = NUMBER_PATTERN.exec(source)
    if (!number) fail()
    i += number[0].length
  }

  function scanObject() {
    i++ // {
    skipWhitespace()
    if (source[i] === '}') {
      i++
      return
    }
    for (;;) {
      skipWhitespace()
      if (source[i] !== '"') fail()
      scanString()
      skipWhitespace()
      if (source[i] !== ':') fail()
      i++
      scanValue()
      skipWhitespace()
      if (source[i] === ',') {
        i++
        continue
      }
      if (source[i] === '}') {
        i++
        return
      }
      fail()
    }
  }

  function scanArray() {
    i++ // [
    skipWhitespace()
    if (source[i] === ']') {
      i++
      return
    }
    for (;;) {
      scanValue()
      skipWhitespace()
      if (source[i] === ',') {
        i++
        continue
      }
      if (source[i] === ']') {
        i++
        return
      }
      fail()
    }
  }

  try {
    scanValue()
    skipWhitespace()
    if (i < source.length) fail() // trailing junk
    return null
  } catch (e) {
    // A RangeError from a pathologically nested document lands here too: no
    // location is better than a wrong one.
    return e instanceof JsonScanError ? e.index : null
  }
}

/**
 * `JSON.parse` reports a character offset at best, which is useless against a
 * 2000-line document. Translate whatever the engine gives us — or a scan of the
 * source when it gives us nothing — into the line/column the editor can jump to.
 */
/** Source offset → 1-based line/column, for errors that already know their offset. */
export function offsetToLineColumn(
  source: string,
  index: number
): { line: number; column: number } {
  const clamped = Math.min(Math.max(index, 0), source.length)
  const before = source.slice(0, clamped)
  return { line: before.split('\n').length, column: clamped - before.lastIndexOf('\n') }
}

export function locateJsonError(
  message: string,
  source: string
): { line: number; column: number } | null {
  const lineColumn = /line (\d+) column (\d+)/i.exec(message)
  if (lineColumn?.[1] && lineColumn[2]) {
    return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) }
  }
  const position = /position (\d+)/.exec(message)
  const index = position?.[1] ? Number(position[1]) : scanJsonErrorIndex(source)
  if (index === null) return null
  const clamped = Math.min(index, source.length)
  const before = source.slice(0, clamped)
  return { line: before.split('\n').length, column: clamped - before.lastIndexOf('\n') }
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isTabularJsonArray(data: unknown): data is Record<string, unknown>[] {
  return Array.isArray(data) && data.every(isJsonRecord)
}

/** Column order is first-seen across every row, so sparse records still line up. */
export function unionKeys(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) keys.add(key)
  }
  return Array.from(keys)
}

export function toText(value: unknown): string {
  return typeof value === 'object' && value !== null
    ? JSON.stringify(value, null, 2)
    : String(value ?? (value === null ? 'null' : ''))
}

export type ParseResult =
  | { status: 'empty' }
  | { status: 'valid'; data: unknown }
  | { status: 'invalid'; message: string; location: { line: number; column: number } | null }
