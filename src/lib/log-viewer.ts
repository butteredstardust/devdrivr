export const MAX_LOG_VIEW_CHARACTERS = 2_000_000
/** The furthest the cut moves forward to reach a line start. A longer line is cut inside. */
const MAX_LINE_SEARCH = 64 * 1024

export function prepareLogContent(content: string): { content: string; truncated: boolean } {
  const { content: kept, removed } = appendLogText('', content)
  return { content: kept, truncated: removed > 0 }
}

/**
 * Appends `text` and keeps the newest `max` characters.
 *
 * The cut moves forward to the start of a line, so the view does not start inside a line. A tail
 * that is one long line is cut at `max` characters. `removed` counts the characters removed from
 * the start of `current`, and can be larger than `current` when `text` alone is too long.
 */
export function appendLogText(
  current: string,
  text: string,
  max = MAX_LOG_VIEW_CHARACTERS
): { content: string; removed: number } {
  const combined = current + text
  if (combined.length <= max) return { content: combined, removed: 0 }
  let cut = combined.length - max
  // A final line break does not start a line, so it cannot be the cut.
  const lineBreak = combined.indexOf('\n', cut)
  if (lineBreak !== -1 && lineBreak < combined.length - 1 && lineBreak - cut < MAX_LINE_SEARCH) {
    cut = lineBreak + 1
  } else {
    // Do not cut between the two halves of a surrogate pair.
    const code = combined.charCodeAt(cut - 1)
    if (code >= 0xd800 && code <= 0xdbff) cut++
  }
  return { content: combined.slice(cut), removed: cut }
}

export function countTextLines(content: string): number {
  if (!content) return 0
  let lines = 1
  for (let index = 0; index < content.length; index++) {
    if (content.charCodeAt(index) === 10) lines++
  }
  return lines
}

/** Counts the line breaks in `text`, which is the number of lines that an append completes. */
export function countLineBreaks(text: string): number {
  return countTextLines(text) - (text ? 1 : 0)
}
