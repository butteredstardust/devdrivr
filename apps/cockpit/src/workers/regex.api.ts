/**
 * Pure regex evaluation shared by the regex worker and its tests.
 *
 * Lives in its own module (no `self` reference) so it can be unit tested directly and
 * reused by the test-environment worker stub. Nothing here may run on the main thread:
 * a user-supplied pattern can backtrack for an unbounded time and only a terminable
 * worker can be interrupted.
 */

export const MAX_REGEX_MATCHES = 1000

export type RegexMatch = {
  full: string
  index: number
  length: number
  groups: Array<{
    index: number
    name: string | null
    value: string
    /** Capture offsets are available when the `d` flag is enabled. */
    start?: number
    end?: number
  }>
}

export type RegexEvaluationInput = {
  pattern: string
  flags: string
  text: string
  replacement: string
}

export type RegexEvaluation = {
  matches: RegexMatch[]
  matchError: string | null
  truncated: boolean
  highlightHtml: string
  replaceResult: string
  replaceError: string | null
}

const MATCH_COLORS = [
  { bg: 'var(--color-accent)', text: 'var(--color-bg)' },
  { bg: 'var(--color-info)', text: 'var(--color-bg)' },
]

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function extractCaptureGroupNames(pattern: string): Array<string | null> {
  const names: Array<string | null> = []
  let inClass = false

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (!char) break

    if (char === '\\') {
      i++
      continue
    }

    if (char === '[') {
      inClass = true
      continue
    }

    if (char === ']' && inClass) {
      inClass = false
      continue
    }

    if (inClass || char !== '(') continue

    const next = pattern[i + 1]
    if (next !== '?') {
      names.push(null)
      continue
    }

    if (
      pattern.startsWith('(?:', i) ||
      pattern.startsWith('(?=', i) ||
      pattern.startsWith('(?!', i)
    ) {
      continue
    }

    if (pattern.startsWith('(?<=', i) || pattern.startsWith('(?<!', i)) {
      continue
    }

    if (pattern.startsWith('(?<', i)) {
      const end = pattern.indexOf('>', i + 3)
      if (end !== -1) {
        names.push(pattern.slice(i + 3, end))
      }
    }
  }

  return names
}

export function emptyEvaluation(text: string): RegexEvaluation {
  return {
    matches: [],
    matchError: null,
    truncated: false,
    highlightHtml: '',
    replaceResult: text,
    replaceError: null,
  }
}

function buildHighlightHtml(text: string, matches: RegexMatch[]): string {
  if (!text) return ''
  const parts: string[] = []
  let lastIndex = 0
  matches.forEach((match, i) => {
    parts.push(escapeHtml(text.slice(lastIndex, match.index)))
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const c = MATCH_COLORS[i % MATCH_COLORS.length]! // safe: modulo keeps index in bounds
    parts.push(
      `<mark style="background:${c.bg};color:${c.text};border-radius:2px;padding:0 2px">${escapeHtml(match.full)}</mark>`
    )
    lastIndex = match.index + match.full.length
  })
  parts.push(escapeHtml(text.slice(lastIndex)))
  return parts.join('')
}

/**
 * Compiles the pattern once and derives matches, highlight markup, and the replacement
 * from a single scan.
 *
 * Previously this was three `useMemo`s, each building its own `RegExp` and running its
 * own scan on every keystroke. `re` carries the user's flags (needed for `String.replace`
 * so `$1` / `$<name>` semantics are preserved); `scanner` is the same object when the
 * `g` flag is set, and only then a second one is built.
 */
export function evaluateRegex(input: RegexEvaluationInput): RegexEvaluation {
  const { pattern, flags, text, replacement } = input
  if (!pattern) return emptyEvaluation(text)

  let re: RegExp
  try {
    re = new RegExp(pattern, flags)
  } catch (e) {
    const message = (e as Error).message
    return {
      matches: [],
      matchError: message,
      truncated: false,
      highlightHtml: escapeHtml(text),
      replaceResult: text,
      replaceError: message,
    }
  }

  const isGlobal = flags.includes('g')
  const scanner = isGlobal ? re : new RegExp(pattern, flags + 'g')
  const captureGroupNames = extractCaptureGroupNames(pattern)

  const scanned: RegexMatch[] = []
  let truncated = false
  if (text) {
    scanner.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = scanner.exec(text)) !== null) {
      if (scanned.length >= MAX_REGEX_MATCHES) {
        truncated = true
        break
      }
      const groups: RegexMatch['groups'] = []
      const indices = (m as RegExpExecArray & { indices?: Array<[number, number] | undefined> })
        .indices
      for (let i = 1; i < m.length; i++) {
        const range = indices?.[i]
        groups.push({
          index: i,
          name: captureGroupNames[i - 1] ?? null,
          value: m[i] ?? '',
          ...(range ? { start: range[0], end: range[1] } : {}),
        })
      }
      scanned.push({ full: m[0], index: m.index, length: m[0].length, groups })
      if (m[0] === '') scanner.lastIndex++
    }
  }

  // Without `g` only the first match is reported, but every occurrence is still
  // highlighted — this mirrors the pre-worker behaviour of the tool.
  const matches = isGlobal ? scanned : scanned.slice(0, 1)

  let replaceResult = text
  let replaceError: string | null = null
  if (text) {
    try {
      replaceResult = text.replace(re, replacement)
    } catch (e) {
      replaceError = (e as Error).message
    }
  }

  return {
    matches,
    matchError: null,
    truncated: isGlobal && truncated,
    highlightHtml: buildHighlightHtml(text, scanned),
    replaceResult,
    replaceError,
  }
}
