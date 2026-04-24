import { describe, expect, it } from 'vitest'
import { jsonToYaml, parseYaml, yamlToJson } from '@/tools/yaml-tools/yaml-helpers'

describe('yaml-tools helpers', () => {
  it('accepts YAML null documents as valid input', () => {
    expect(parseYaml('null')).toEqual({ ok: true, data: null, error: null })
  })

  it('converts YAML null to JSON null', () => {
    expect(yamlToJson('null')).toBe('null')
  })

  it('converts JSON null to YAML null', () => {
    expect(jsonToYaml('null')).toBe('null\n')
  })
})
