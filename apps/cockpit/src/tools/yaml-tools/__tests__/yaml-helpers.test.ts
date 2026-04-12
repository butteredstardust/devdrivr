import { parseYaml, jsonToYaml, yamlToJson, sortKeysDeep } from '../yaml-helpers'

describe('yaml-helpers', () => {
  describe('parseYaml', () => {
    it('should parse valid YAML', () => {
      const result = parseYaml('key: value\nnumber: 42')
      expect(result.ok).toBe(true)
      expect(result.data).toEqual({ key: 'value', number: 42 })
    })

    it('should handle empty input', () => {
      const result = parseYaml('')
      expect(result.ok).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('should handle invalid YAML', () => {
      const result = parseYaml('invalid: yaml: content:')
      expect(result.ok).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })

  describe('jsonToYaml', () => {
    it('should convert JSON to YAML', () => {
      const json = '{"key":"value","number":42}'
      const result = jsonToYaml(json)
      expect(result).toContain('key: value')
      expect(result).toContain('number: 42')
    })

    it('should throw error for empty JSON', () => {
      expect(() => jsonToYaml('')).toThrow('empty')
    })

    it('should throw error for invalid JSON', () => {
      expect(() => jsonToYaml('{invalid: json}')).toThrow('Invalid JSON')
    })
  })

  describe('yamlToJson', () => {
    it('should convert YAML to JSON', () => {
      const yaml = 'key: value\nnumber: 42'
      const result = yamlToJson(yaml)
      const parsed = JSON.parse(result)
      expect(parsed).toEqual({ key: 'value', number: 42 })
    })

    it('should throw error for invalid YAML', () => {
      expect(() => yamlToJson('invalid: yaml:')).toThrow()
    })
  })

  describe('sortKeysDeep', () => {
    it('should sort keys in object', () => {
      const data = { z: 1, a: 2, m: { z: 3, a: 4 } }
      const result = sortKeysDeep(data)
      expect(Object.keys(result)).toEqual(['a', 'm', 'z'])
      expect(Object.keys((result as any).m)).toEqual(['a', 'z'])
    })

    it('should handle arrays', () => {
      const data = [
        { z: 1, a: 2 },
        { z: 3, a: 4 },
      ]
      const result = sortKeysDeep(data)
      expect(Array.isArray(result)).toBe(true)
      expect(Object.keys(result[0])).toEqual(['a', 'z'])
    })
  })
})
