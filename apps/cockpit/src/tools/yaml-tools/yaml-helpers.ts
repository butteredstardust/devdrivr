import * as yaml from 'js-yaml'

export type ParseResult =
  | { ok: true; data: unknown; error: null }
  | { ok: false; data: null; error: string }

export function parseYaml(input: string): ParseResult {
  if (!input.trim()) return { ok: false, data: null, error: 'Input is empty' }
  try {
    const data = yaml.load(input)
    return { ok: true, data, error: null }
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export function stringifyYaml(data: unknown): string {
  return yaml.dump(data, { indent: 2, lineWidth: 120, noRefs: true })
}

export function yamlToJson(yamlInput: string): string {
  const result = parseYaml(yamlInput)
  if (!result.ok) throw new Error(result.error)
  return JSON.stringify(result.data, null, 2)
}

export function jsonToYaml(jsonInput: string): string {
  if (!jsonInput.trim()) {
    throw new Error('JSON input is empty')
  }
  try {
    const data: unknown = JSON.parse(jsonInput)
    return stringifyYaml(data)
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${e.message}`, { cause: e })
    }
    throw e instanceof Error ? e : new Error(String(e))
  }
}

export function sortKeysDeep(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(sortKeysDeep)
  if (data !== null && typeof data === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(data as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((data as Record<string, unknown>)[key])
    }
    return sorted
  }
  return data
}
