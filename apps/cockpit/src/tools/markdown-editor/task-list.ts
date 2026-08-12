// Pure helper for toggling a GFM task-list checkbox in markdown source by
// index. Kept separate from the preview component so the counting/toggling
// logic (which has to skip fenced code blocks) is unit testable on its own.

const TASK_LINE_RE = /^(\s*)(?:[-*+]|\d+[.)])\s\[([ xX])\](?:\s.*)?$/
const FENCE_RE = /^\s*(```+|~~~+)/

/**
 * Toggle the Nth (0-indexed, source order) GFM task-list checkbox in
 * `content` between `[ ]` and `[x]`. Checkboxes inside fenced code blocks
 * are not counted (and can't be toggled) — only real task-list items are.
 * Returns `content` unchanged if `index` is out of range.
 */
export function toggleTaskAtIndex(content: string, index: number): string {
  if (index < 0) return content

  const lines = content.split('\n')
  let count = -1
  let inFence = false
  let fenceMarker = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''

    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      const marker = (fenceMatch[1] ?? '```').slice(0, 3)
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (marker[0] === fenceMarker[0]) {
        inFence = false
        fenceMarker = ''
      }
      continue
    }
    if (inFence) continue

    const taskMatch = TASK_LINE_RE.exec(line)
    if (!taskMatch) continue

    count++
    if (count !== index) continue

    const checked = (taskMatch[2] ?? ' ').toLowerCase() === 'x'
    lines[i] = line.replace(/\[([ xX])\]/, checked ? '[ ]' : '[x]')
    break
  }

  return lines.join('\n')
}

/** Count the number of GFM task-list checkboxes in `content` (fences excluded). */
export function countTasks(content: string): number {
  const lines = content.split('\n')
  let count = 0
  let inFence = false
  let fenceMarker = ''

  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      const marker = (fenceMatch[1] ?? '```').slice(0, 3)
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (marker[0] === fenceMarker[0]) {
        inFence = false
        fenceMarker = ''
      }
      continue
    }
    if (inFence) continue
    if (TASK_LINE_RE.test(line)) count++
  }

  return count
}
