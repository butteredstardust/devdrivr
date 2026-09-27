import { CASE_CONVERSIONS } from '@/lib/text-case'

/** A change to whole lines. It receives the lines without their line breaks. */
export type LineTransform = {
  id: string
  label: string
  apply: (lines: string[]) => string[]
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export const LINE_TRANSFORMS: LineTransform[] = [
  {
    id: 'sort-ascending',
    label: 'Sort lines A to Z',
    apply: (lines) => [...lines].sort(collator.compare),
  },
  {
    id: 'sort-descending',
    label: 'Sort lines Z to A',
    apply: (lines) => [...lines].sort((a, b) => collator.compare(b, a)),
  },
  {
    id: 'remove-duplicates',
    label: 'Remove duplicate lines',
    apply: (lines) => [...new Set(lines)],
  },
  {
    id: 'trim-trailing',
    label: 'Trim trailing whitespace',
    apply: (lines) => lines.map((line) => line.replace(/\s+$/u, '')),
  },
]

export const CASE_TRANSFORMS: LineTransform[] = CASE_CONVERSIONS.map(({ id, label, convert }) => ({
  id: `case-${id}`,
  label,
  apply: (lines) => lines.map(convert),
}))

/**
 * Applies `transform` to each line of `text` and keeps the line break style.
 *
 * A final line break stays at the end. Without this rule a sort would move the empty last line to
 * the top of the document.
 */
export function transformText(text: string, eol: string, transform: LineTransform): string {
  const lines = text.split(/\r\n|\n/)
  const endsWithBreak = lines.length > 1 && lines[lines.length - 1] === ''
  const body = endsWithBreak ? lines.slice(0, -1) : lines
  const result = transform.apply(body)
  return (endsWithBreak ? [...result, ''] : result).join(eol)
}

/** The 1-based, inclusive line numbers of one selection. */
export type LineSpan = { start: number; end: number }

type SelectionBounds = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

/**
 * Finds the lines that a line transform changes.
 *
 * - With no selected text, returns the whole document.
 * - A selection that ends at column 1 does not include its last line.
 * - Overlapping spans merge, so two cursors on one line do not edit it twice.
 */
export function selectedLineSpans(selections: SelectionBounds[], lineCount: number): LineSpan[] {
  const spans = selections
    .filter((s) => s.startLineNumber !== s.endLineNumber || s.startColumn !== s.endColumn)
    .map((s) => ({
      start: s.startLineNumber,
      end:
        s.endColumn === 1 && s.endLineNumber > s.startLineNumber
          ? s.endLineNumber - 1
          : s.endLineNumber,
    }))
    .sort((a, b) => a.start - b.start)
  if (spans.length === 0) return [{ start: 1, end: lineCount }]

  const merged: LineSpan[] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end)
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}
