import { describe, expect, it } from 'vitest'
import { exactNumber, reformatJson } from '@/lib/lossless-json'
import { MAX_TRAVERSAL_DEPTH, sortKeysDeepBounded } from '@/lib/traversal'

describe('reformatJson', () => {
  it.each([
    ['1e-400', null],
    ['0', 0],
    ['0.0', 0],
    ['-0', -0],
    ['0e5', 0],
  ])('rejects lossy underflow but keeps exact zero %s', (raw, expected) => {
    expect(exactNumber(raw)).toBe(expected)
  })

  it.each(['12345678901234567890', '-12345678901234567890', '1e400', '-0', '1.10', '1E5', '0.1'])(
    'keeps the number source text in %s',
    (number) => {
      const source = `{"value":${number}}`
      expect(reformatJson(source, { indent: 0 })).toBe(source)
    }
  )

  const fixtures = [
    '{"nested":{"items":[1,true,null,"text"]},"emptyObject":{},"emptyArray":[]}',
    '{"unicode":"b\u00fccher","escaped":"line\\nquote\\\"slash\\\\","separator":" "}',
    '[{"a":1},[],{},false]',
    'null',
    'true',
    '42',
    '"top-level string"',
  ]

  it.each([0, 2, 4, '\t'] as const)('matches JSON.stringify with indent %j', (indent) => {
    for (const source of fixtures) {
      expect(reformatJson(source, { indent })).toBe(
        JSON.stringify(JSON.parse(source), null, indent)
      )
    }
  })

  it('sorts keys like sortKeysDeepBounded', () => {
    for (const source of fixtures) {
      expect(reformatJson(source, { indent: 2, sortKeys: true })).toBe(
        JSON.stringify(sortKeysDeepBounded(JSON.parse(source)), null, 2)
      )
    }
  })

  it('keeps duplicate and prototype-like keys consistent with JSON.parse', () => {
    const source = '{"a":1,"__proto__":{"safe":true},"constructor":3,"a":4}'
    expect(reformatJson(source, { indent: 0 })).toBe(JSON.stringify(JSON.parse(source)))
  })

  it.each(['{', '[1,]', "{'a':1}", 'NaN', '{"a":1} trailing', ''])(
    'rejects invalid input %j',
    (source) => {
      expect(() => reformatJson(source, { indent: 0 })).toThrow()
    }
  )

  it('rejects nesting past the traversal depth limit', () => {
    let source = '0'
    for (let depth = 0; depth <= MAX_TRAVERSAL_DEPTH; depth += 1) source = `[${source}]`

    expect(() => reformatJson(source, { indent: 0 })).toThrow(
      `JSON nesting exceeds the maximum depth of ${MAX_TRAVERSAL_DEPTH}`
    )
  })
})
