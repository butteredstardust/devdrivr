import { describe, it, expect } from 'vitest'
import {
  parseYaml,
  stringifyYaml,
  yamlToJson,
  jsonToYaml,
  sortKeysDeep,
} from './yaml-helpers'

describe('parseYaml', () => {
  it('parses a simple mapping', () => {
    const result = parseYaml('name: Alice\nage: 30')
    expect(result).toEqual({ ok: true, data: { name: 'Alice', age: 30 }, error: null })
  })

  it('returns error for invalid YAML', () => {
    const result = parseYaml('key: [unclosed')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns error for empty string', () => {
    const result = parseYaml('')
    expect(result).toEqual({ ok: false, data: null, error: 'Input is empty' })
  })

  it('parses a sequence (array)', () => {
    const result = parseYaml('- a\n- b\n- c')
    expect(result).toEqual({ ok: true, data: ['a', 'b', 'c'], error: null })
  })
})

describe('stringifyYaml', () => {
  it('serialises an object to YAML', () => {
    const result = stringifyYaml({ name: 'Alice', age: 30 })
    expect(result).toContain('name: Alice')
    expect(result).toContain('age: 30')
  })

  it('serialises an array', () => {
    const result = stringifyYaml(['a', 'b', 'c'])
    expect(result).toContain('- a')
  })
})

describe('yamlToJson', () => {
  it('converts YAML mapping to formatted JSON', () => {
    const result = yamlToJson('name: Alice\nage: 30')
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({ name: 'Alice', age: 30 })
  })

  it('throws on invalid YAML', () => {
    expect(() => yamlToJson('key: [unclosed')).toThrow()
  })

  it('throws on empty input', () => {
    expect(() => yamlToJson('')).toThrow()
  })
})

describe('jsonToYaml', () => {
  it('converts JSON object to YAML', () => {
    const result = jsonToYaml('{"name":"Alice","age":30}')
    expect(result).toContain('name: Alice')
    expect(result).toContain('age: 30')
  })

  it('throws on invalid JSON', () => {
    expect(() => jsonToYaml('{bad json')).toThrow()
  })
})

describe('sortKeysDeep', () => {
  it('sorts top-level keys alphabetically', () => {
    const result = sortKeysDeep({ b: 2, a: 1 }) as Record<string, unknown>
    expect(Object.keys(result)).toEqual(['a', 'b'])
  })

  it('sorts nested keys recursively', () => {
    const result = sortKeysDeep({ z: { b: 2, a: 1 }, a: 0 }) as Record<string, unknown>
    expect(Object.keys(result)).toEqual(['a', 'z'])
    expect(Object.keys(result['z'] as object)).toEqual(['a', 'b'])
  })

  it('leaves arrays alone (does not sort elements)', () => {
    const result = sortKeysDeep([3, 1, 2])
    expect(result).toEqual([3, 1, 2])
  })
})
