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

describe('arrow-functions', () => {
  it('converts anonymous function expression to arrow function', () => {
    const input = 'const fn = function(x) { return x * 2 }'
    const output = applyTransform('arrow-functions', input)
    expect(output).toContain('=>')
    expect(output).not.toContain('function(')
  })
  it('does not convert named function expressions', () => {
    const input = 'const fn = function myFn(x) { return x }'
    const output = applyTransform('arrow-functions', input)
    expect(output).toContain('function myFn')
  })
  it('does not convert object methods', () => {
    const input = 'const obj = { foo: function(x) { return x } }'
    const output = applyTransform('arrow-functions', input)
    expect(output).toContain('function(x)')
  })
})

describe('template-literals', () => {
  it('converts string + identifier concatenation to template literal', () => {
    const input = `'Hello, ' + name`
    const output = applyTransform('template-literals', input)
    expect(output).toContain('`Hello, ${name}`')
  })
  it('is a no-op when no string concatenation exists', () => {
    const input = `const greeting = \`Hello, \${name}\``
    const output = applyTransform('template-literals', input)
    expect(output).toContain('`Hello, ${name}`')
  })
})

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
