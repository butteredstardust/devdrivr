/**
 * Pure diff-computation logic shared by the diff worker and its test-environment
 * mock. Lives in its own module (no `self` reference) so it can run identically
 * on the worker thread and in-process under Vitest.
 */
import { createTwoFilesPatch } from 'diff'

export type DiffOptions = {
  ignoreWhitespace?: boolean
  ignoreCase?: boolean
  jsonMode?: boolean
}

export function computeDiff(left: string, right: string, options: DiffOptions = {}): string {
  let a = left
  let b = right

  if (options.jsonMode) {
    try {
      a = JSON.stringify(JSON.parse(a), null, 2)
      b = JSON.stringify(JSON.parse(b), null, 2)
    } catch {
      // If not valid JSON, diff as-is
    }
  }

  return createTwoFilesPatch('left', 'right', a, b, undefined, undefined, {
    ignoreWhitespace: options.ignoreWhitespace,
    ignoreCase: options.ignoreCase,
  })
}
