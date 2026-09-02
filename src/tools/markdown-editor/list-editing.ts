// Pure, Monaco-free markdown list-editing helpers. Kept separate from the
// useMarkdownListEditing hook so the parsing/renumbering logic is unit
// testable without a real editor instance.

export type ListMarkerKind = 'bullet' | 'task' | 'ordered' | 'quote'

export interface ListMarker {
  kind: ListMarkerKind
  /** Leading whitespace before the marker character(s). */
  indent: string
  /** '-' | '*' | '+' — only set for bullet/task markers. */
  bulletChar?: string
  /** Only set for task markers. */
  checked?: boolean
  /** Only set for ordered markers. */
  number?: number
  /** '.' | ')' — only set for ordered markers. */
  delimiter?: string
  /** '>' repeated N times — only set for quote markers. */
  quotePrefix?: string
  /** Text after the marker (and its trailing space), possibly empty. */
  content: string
}

const TASK_RE = /^(\s*)([-*+])\s\[([ xX])\](?:\s(.*))?$/
const BULLET_RE = /^(\s*)([-*+])(?:\s(.*))?$/
const ORDERED_RE = /^(\s*)(\d+)([.)])(?:\s(.*))?$/
const QUOTE_RE = /^(\s*)(>+)(?:\s(.*))?$/

/** Parse a single line into a list marker, or null if it isn't a list/quote line. */
export function parseListMarker(line: string): ListMarker | null {
  let m = TASK_RE.exec(line)
  if (m) {
    return {
      kind: 'task',
      indent: m[1] ?? '',
      bulletChar: m[2] ?? '-',
      checked: (m[3] ?? ' ').toLowerCase() === 'x',
      content: m[4] ?? '',
    }
  }

  m = BULLET_RE.exec(line)
  if (m) {
    return {
      kind: 'bullet',
      indent: m[1] ?? '',
      bulletChar: m[2] ?? '-',
      content: m[3] ?? '',
    }
  }

  m = ORDERED_RE.exec(line)
  if (m) {
    return {
      kind: 'ordered',
      indent: m[1] ?? '',
      number: parseInt(m[2] ?? '1', 10),
      delimiter: m[3] ?? '.',
      content: m[4] ?? '',
    }
  }

  m = QUOTE_RE.exec(line)
  if (m) {
    return {
      kind: 'quote',
      indent: m[1] ?? '',
      quotePrefix: m[2] ?? '>',
      content: m[3] ?? '',
    }
  }

  return null
}

/** True when the marker has no text after it (just the bare marker itself). */
export function isMarkerContentEmpty(marker: ListMarker): boolean {
  return marker.content.trim().length === 0
}

/**
 * The marker text (including indent and trailing space) to prefix a new,
 * empty continuation line with when Enter is pressed at the end of `marker`'s
 * line. Task items always continue as unchecked, ordered items advance by one.
 */
export function nextLineMarker(marker: ListMarker): string {
  switch (marker.kind) {
    case 'bullet':
      return `${marker.indent}${marker.bulletChar ?? '-'} `
    case 'task':
      return `${marker.indent}${marker.bulletChar ?? '-'} [ ] `
    case 'ordered':
      return `${marker.indent}${(marker.number ?? 1) + 1}${marker.delimiter ?? '.'} `
    case 'quote':
      return `${marker.indent}${marker.quotePrefix ?? '>'} `
    default:
      return marker.indent
  }
}

/** One tab-stop worth of indentation, matching the editor's indent settings. */
export function indentUnit(insertSpaces: boolean, tabSize: number): string {
  return insertSpaces ? ' '.repeat(tabSize) : '\t'
}

/** Indent a line by one indent unit. */
export function indentLine(line: string, insertSpaces: boolean, tabSize: number): string {
  return indentUnit(insertSpaces, tabSize) + line
}

/** Outdent a line by up to one indent unit (a leading tab, or up to `tabSize` spaces). */
export function outdentLine(line: string, insertSpaces: boolean, tabSize: number): string {
  // A leading tab is always exactly one indent unit, regardless of `insertSpaces` —
  // remove it outright rather than counting it as `tabSize` spaces.
  if (line.startsWith('\t')) return line.slice(1)
  const unit = indentUnit(insertSpaces, tabSize)
  if (line.startsWith(unit)) return line.slice(unit.length)
  const leadingSpaces = /^ */.exec(line)?.[0].length ?? 0
  const remove = Math.min(leadingSpaces, tabSize)
  return line.slice(remove)
}

/**
 * Renumber the contiguous run of ordered-list items at `indent` that contains
 * `lines[lineIndex]`, starting from that run's original first number. No-op
 * if `lines[lineIndex]` isn't itself an ordered item at `indent`.
 */
export function renumberOrderedListAround(
  lines: string[],
  lineIndex: number,
  indent: string
): string[] {
  const anchor = lines[lineIndex]
  if (anchor === undefined) return lines
  const anchorMarker = parseListMarker(anchor)
  if (!anchorMarker || anchorMarker.kind !== 'ordered' || anchorMarker.indent !== indent) {
    return lines
  }

  let start = lineIndex
  while (start > 0) {
    const m = parseListMarker(lines[start - 1] ?? '')
    if (!m || m.kind !== 'ordered' || m.indent !== indent) break
    start--
  }

  let end = lineIndex
  while (end < lines.length - 1) {
    const m = parseListMarker(lines[end + 1] ?? '')
    if (!m || m.kind !== 'ordered' || m.indent !== indent) break
    end++
  }

  const startMarker = parseListMarker(lines[start] ?? '')
  if (!startMarker || startMarker.kind !== 'ordered') return lines

  const result = [...lines]
  let num = startMarker.number ?? 1
  for (let i = start; i <= end; i++) {
    const m = parseListMarker(result[i] ?? '')
    if (!m || m.kind !== 'ordered') continue
    result[i] = `${m.indent}${num}${m.delimiter ?? '.'} ${m.content}`
    num++
  }
  return result
}

/**
 * Renumber whichever contiguous ordered-list run(s) at `indent` are adjacent
 * to `lineIndex` (the line at `lineIndex` itself is assumed to no longer be
 * part of that run, e.g. because it was just indented/outdented away from it).
 */
export function renumberAroundIndex(lines: string[], lineIndex: number, indent: string): string[] {
  let result = lines
  const above = lineIndex - 1
  const aboveMarker = above >= 0 ? parseListMarker(lines[above] ?? '') : null
  if (aboveMarker && aboveMarker.kind === 'ordered' && aboveMarker.indent === indent) {
    result = renumberOrderedListAround(result, above, indent)
  }
  const below = lineIndex + 1
  const belowMarker = below < lines.length ? parseListMarker(lines[below] ?? '') : null
  if (belowMarker && belowMarker.kind === 'ordered' && belowMarker.indent === indent) {
    result = renumberOrderedListAround(result, below, indent)
  }
  return result
}
