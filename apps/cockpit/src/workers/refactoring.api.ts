/**
 * Pure jscodeshift transform-application logic shared by the refactoring
 * worker and its test-environment mock. Lives in its own module (no `self`
 * reference) so it can run identically on the worker thread and in-process
 * under Vitest.
 */
import jscodeshift from 'jscodeshift'
import { TRANSFORMS } from '@/tools/refactoring-toolkit/transforms'

export function applyTransforms(
  code: string,
  transformIds: string[],
  parser: 'babel' | 'tsx'
): string {
  const hasTrailingCommas = transformIds.includes('trailing-commas')
  const j = jscodeshift.withParser(parser)
  const root = j(code)

  for (const id of transformIds) {
    const transform = TRANSFORMS.find((t) => t.id === id)
    if (transform) transform.apply(root, j)
  }

  return root.toSource(hasTrailingCommas ? { trailingComma: true } : {})
}
