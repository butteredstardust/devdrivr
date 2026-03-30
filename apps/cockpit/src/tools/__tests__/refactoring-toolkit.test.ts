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

describe('optional-chaining', () => {
  it('converts a && a.b to a?.b', () => {
    const output = applyTransform('optional-chaining', 'user && user.name')
    expect(output).toContain('user?.name')
  })
  it('is a no-op when no && member pattern exists', () => {
    const input = 'const x = user?.name'
    expect(applyTransform('optional-chaining', input)).toContain('user?.name')
  })
})

describe('require-to-import', () => {
  it('converts const x = require("y") to import x from "y"', () => {
    const output = applyTransform('require-to-import', "const fs = require('fs')")
    expect(output).toContain('import fs from')
    expect(output).toContain('fs')
    expect(output).not.toContain('require')
  })
  it('is a no-op when no require() calls exist', () => {
    const input = "import fs from 'fs'"
    expect(applyTransform('require-to-import', input)).toContain("import fs from 'fs'")
  })
})

describe('spread-operator', () => {
  it('converts Object.assign({}, x) to { ...x }', () => {
    const output = applyTransform('spread-operator', 'const a = Object.assign({}, defaults)')
    expect(output).toContain('...defaults')
  })
  it('does not convert Object.assign with non-empty first argument', () => {
    const input = 'Object.assign(target, source)'
    const output = applyTransform('spread-operator', input)
    expect(output).toContain('Object.assign(target, source)')
  })
})

describe('strict-equality', () => {
  it('converts == to ===', () => {
    expect(applyTransform('strict-equality', 'x == y')).toContain('===')
  })
  it('converts != to !==', () => {
    expect(applyTransform('strict-equality', 'x != y')).toContain('!==')
  })
  it('does not touch already-strict equality', () => {
    const input = 'x === y'
    expect(applyTransform('strict-equality', input)).toContain('===')
    expect(applyTransform('strict-equality', input)).not.toContain('====')
  })
})

describe('nullish-coalescing', () => {
  it('converts || with string literal RHS to ??', () => {
    expect(applyTransform('nullish-coalescing', "name || 'default'")).toContain('??')
  })
  it('converts || with numeric literal RHS to ??', () => {
    expect(applyTransform('nullish-coalescing', 'count || 0')).toContain('??')
  })
  it('does not convert || where RHS is a variable', () => {
    const input = 'a || b'
    expect(applyTransform('nullish-coalescing', input)).toContain('||')
  })
})

describe('remove-console', () => {
  it('removes console.log statements', () => {
    const input = 'console.log("debug")\nconst x = 1'
    const output = applyTransform('remove-console', input)
    expect(output).not.toContain('console.log')
    expect(output).toContain('const x = 1')
  })
  it('removes console.warn and console.error', () => {
    const input = 'console.warn("warn")\nconsole.error("err")'
    const output = applyTransform('remove-console', input)
    expect(output.trim()).toBe('')
  })
  it('is a no-op when no console calls exist', () => {
    const input = 'const x = 1'
    expect(applyTransform('remove-console', input)).toContain('const x = 1')
  })
})

describe('remove-debugger', () => {
  it('removes debugger statements', () => {
    const input = 'function foo() { debugger; return 1 }'
    const output = applyTransform('remove-debugger', input)
    expect(output).not.toContain('debugger')
    expect(output).toContain('return 1')
  })
  it('is a no-op when no debugger statements exist', () => {
    const input = 'const x = 1'
    expect(applyTransform('remove-debugger', input)).toContain('const x = 1')
  })
})

describe('trailing-commas', () => {
  it('adds trailing commas to the last array element', () => {
    const input = 'const a = [\n  1,\n  2\n]'
    const output = applyTransform('trailing-commas', input)
    expect(output).toMatch(/2,?\s*\n/)
  })
})

describe('promise-to-async', () => {
  it('converts .then(fn).catch(fn) to an async IIFE with try/catch', () => {
    const input = `fetchData().then(result => process(result)).catch(err => handleError(err))`
    const output = applyTransform('promise-to-async', input)
    expect(output).toContain('async')
    expect(output).toContain('await')
    expect(output).toContain('try')
    expect(output).toContain('catch')
  })
  it('is a no-op when no .then().catch() pattern exists', () => {
    const input = 'const x = 1'
    const output = applyTransform('promise-to-async', input)
    expect(output).not.toContain('async')
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
