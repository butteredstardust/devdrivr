/**
 * Pure diff-computation logic shared by the diff worker and its test-environment
 * mock. Lives in its own module (no `self` reference) so it can run identically
 * on the worker thread and in-process under Vitest.
 */
import { createTwoFilesPatch } from 'diff'
import { reformatJson } from '@/lib/lossless-json'

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
      a = reformatJson(a, { indent: 2 })
      b = reformatJson(b, { indent: 2 })
    } catch {
      // If not valid JSON, diff as-is
    }
  }

  const patchOptions: Pick<DiffOptions, 'ignoreWhitespace' | 'ignoreCase'> = {}
  if (options.ignoreWhitespace !== undefined)
    patchOptions.ignoreWhitespace = options.ignoreWhitespace
  if (options.ignoreCase !== undefined) patchOptions.ignoreCase = options.ignoreCase

  return createTwoFilesPatch('left', 'right', a, b, undefined, undefined, patchOptions)
}
