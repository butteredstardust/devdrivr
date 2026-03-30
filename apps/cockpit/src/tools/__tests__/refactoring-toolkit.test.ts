import { describe, expect, it } from 'vitest'
import jscodeshift from 'jscodeshift'
import { TRANSFORMS } from '@/tools/refactoring-toolkit/transforms'

function applyTransform(
  id: string,
  code: string,
  parser: 'babel' | 'tsx' = 'babel'
): string {
  const j = jscodeshift.withParser(parser)
  const root = j(code)
  const transform = TRANSFORMS.find((t) => t.id === id)
  if (!transform) throw new Error(`Transform "${id}" not found`)
  transform.apply(root, j)
  return root.toSource()
}

describe('var-to-const', () => {
  it('converts unreassigned var to const', () => {
    expect(applyTransform('var-to-const', 'var x = 1')).toBe('const x = 1;')
  })
  it('converts reassigned var to let', () => {
    const input = 'var x = 1\nx = 2'
    const output = applyTransform('var-to-const', input)
    expect(output).toContain('let x = 1')
  })
  it('is a no-op when no var declarations exist', () => {
    const input = 'const x = 1'
    expect(applyTransform('var-to-const', input)).toContain('const x = 1')
  })
})
