import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import Ajv2019 from 'ajv/dist/2019'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export type JsonLocation = { line: number; column: number }

/** 1-based line/column for a character offset, for Monaco's cursor API. */
export function offsetToLocation(text: string, offset: number): JsonLocation {
  const clamped = Math.max(0, Math.min(offset, text.length))
  let line = 1
  let lineStart = 0
  for (let i = 0; i < clamped; i++) {
    if (text[i] === '\n') {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: clamped - lineStart + 1 }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type JsonParse =
  | { status: 'empty' }
  | { status: 'valid'; value: unknown }
  | { status: 'invalid'; message: string; location: JsonLocation | null }

/**
 * `JSON.parse` with the offset in its message turned into a line and column.
 * V8 words that message differently across versions, so the offset is read
 * rather than the line/column some versions also print.
 */
export function parseJson(text: string): JsonParse {
  if (!text.trim()) return { status: 'empty' }
  try {
    return { status: 'valid', value: JSON.parse(text) }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const match = /position (\d+)/.exec(message)
    const location = match?.[1] ? offsetToLocation(text, Number(match[1])) : null
    return { status: 'invalid', message, location }
  }
}

export function detectSchemaDialect(text: string): string {
  const parsed = parseJson(text)
  if (parsed.status !== 'valid') return 'unknown'
  const declared = (parsed.value as { $schema?: unknown })?.$schema
  if (typeof declared !== 'string') return 'draft-07 (default)'
  if (declared.includes('2020-12')) return '2020-12'
  if (declared.includes('2019-09')) return '2019-09'
  if (declared.includes('draft-07')) return 'draft-07'
  if (declared.includes('draft-06')) return 'draft-06 (unsupported)'
  return declared
}

// ---------------------------------------------------------------------------
// JSON Pointer → source offset
// ---------------------------------------------------------------------------

/** RFC 6901 escaping, matching the `instancePath` Ajv reports. */
function escapePointerSegment(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1')
}

/**
 * Finds where a JSON Pointer's value starts in the *source text*.
 *
 * `JSON.parse` throws the source positions away, so an error at `/items/3/id`
 * can only be reported as text unless the document is walked again with the
 * offsets kept. This is a scanner rather than a parser: it never builds a
 * value, and it gives up silently on malformed input — the parse error is
 * reported separately, so a wrong jump is the only failure mode.
 */
export function pointerOffset(text: string, pointer: string): number | null {
  const target = pointer === '/' ? '' : pointer
  let found: number | null = null
  let i = 0
  const n = text.length

  const skipWhitespace = () => {
    while (i < n && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')) {
      i++
    }
  }

  /** Consumes a string literal and returns its unescaped value. */
  const readString = (): string => {
    i++ // opening quote
    let out = ''
    while (i < n) {
      const c = text[i]
      if (c === '"') {
        i++
        return out
      }
      if (c === '\\') {
        const escape = text[i + 1]
        i += 2
        if (escape === 'u') {
          out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16) || 0)
          i += 4
        } else if (escape === 'n') out += '\n'
        else if (escape === 't') out += '\t'
        else if (escape === 'r') out += '\r'
        else if (escape === 'b') out += '\b'
        else if (escape === 'f') out += '\f'
        else out += escape ?? ''
        continue
      }
      out += c ?? ''
      i++
    }
    return out
  }

  const readValue = (path: string): void => {
    skipWhitespace()
    if (i >= n) return
    // Last write wins, matching `JSON.parse`: with a duplicate key the value
    // Ajv validated is the later one, so that is where the cursor belongs.
    if (path === target) found = i

    const c = text[i]
    if (c === '{') {
      i++
      for (;;) {
        skipWhitespace()
        if (text[i] === '}') {
          i++
          return
        }
        if (text[i] !== '"') return
        const key = readString()
        skipWhitespace()
        if (text[i] !== ':') return
        i++
        readValue(`${path}/${escapePointerSegment(key)}`)
        skipWhitespace()
        if (text[i] === ',') {
          i++
          continue
        }
        if (text[i] === '}') {
          i++
        }
        return
      }
    }
    if (c === '[') {
      i++
      let index = 0
      for (;;) {
        skipWhitespace()
        if (text[i] === ']') {
          i++
          return
        }
        readValue(`${path}/${index++}`)
        skipWhitespace()
        if (text[i] === ',') {
          i++
          continue
        }
        if (text[i] === ']') {
          i++
        }
        return
      }
    }
    if (c === '"') {
      readString()
      return
    }
    // Number, true, false, null — consume until a structural character.
    while (i < n && !',}] \t\r\n'.includes(text[i] ?? '')) i++
  }

  readValue('')
  return found
}

/** Line/column of a JSON Pointer's value in the source text. */
export function pointerLocation(text: string, pointer: string): JsonLocation | null {
  const offset = pointerOffset(text, pointer)
  return offset === null ? null : offsetToLocation(text, offset)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationIssue = {
  /** JSON Pointer into the data, `''` for the document root. */
  pointer: string
  /** What to show in the problems list. */
  label: string
  message: string
  keyword: string
}

export type ValidationReport =
  | { status: 'empty' }
  | { status: 'data-error'; message: string; location: JsonLocation | null }
  | {
      status: 'schema-error'
      /** `parse` is a syntax error in the text; `compile` is Ajv rejecting it. */
      kind: 'parse' | 'compile'
      message: string
      location: JsonLocation | null
    }
  | { status: 'valid' }
  | { status: 'invalid'; issues: ValidationIssue[]; total: number }

/** A 10k-error array would otherwise render 10k rows nobody scrolls through. */
export const MAX_ISSUES = 200

/**
 * Ajv's default export only knows draft-07, so a 2020-12 schema — what any
 * OpenAPI 3.1 document uses — failed to compile with an unresolved `$ref` to
 * its own meta-schema. The dialect is read off `$schema`.
 */
function ajvForDialect(schema: unknown, strict: boolean): Ajv {
  const dialect =
    typeof (schema as { $schema?: unknown })?.$schema === 'string'
      ? (schema as { $schema: string }).$schema
      : ''
  const options = { allErrors: true, strict }
  const ajv = dialect.includes('2020-12')
    ? new Ajv2020(options)
    : dialect.includes('2019-09')
      ? new Ajv2019(options)
      : new Ajv(options)
  addFormats(ajv)
  return ajv
}

/**
 * Compiling is the expensive half of validation, and typing in the *data*
 * editor must not pay for it. Keyed by the schema text so an unchanged schema
 * compiles once.
 */
const validatorCache = new Map<string, ValidateFunction>()
const VALIDATOR_CACHE_LIMIT = 8

function getValidator(schemaText: string, schema: unknown, strict: boolean): ValidateFunction {
  // The prefix is one of two fixed literals, so a plain separator cannot make
  // two different (mode, schema) pairs collide.
  const key = `${strict ? 'strict' : 'lax'}:${schemaText}`
  const cached = validatorCache.get(key)
  if (cached) return cached
  // Each entry owns its Ajv instance: sharing one and calling `removeSchema()`
  // between compiles is what forced a recompile on every keystroke.
  const validate = ajvForDialect(schema, strict).compile(schema as object)
  validatorCache.set(key, validate)
  if (validatorCache.size > VALIDATOR_CACHE_LIMIT) {
    const oldest = validatorCache.keys().next().value
    if (oldest !== undefined) validatorCache.delete(oldest)
  }
  return validate
}

/** Ajv's message plus the part of `params` that says which value went wrong. */
function describeError(error: ErrorObject): string {
  const base = error.message ?? 'is invalid'
  const params = error.params as Record<string, unknown>
  if (error.keyword === 'additionalProperties') {
    return `${base}: ${String(params['additionalProperty'])}`
  }
  if (error.keyword === 'enum' && Array.isArray(params['allowedValues'])) {
    return `${base}: ${params['allowedValues'].map((v) => JSON.stringify(v)).join(', ')}`
  }
  return base
}

export function toIssues(errors: readonly ErrorObject[]): ValidationIssue[] {
  return errors.map((error) => ({
    pointer: error.instancePath,
    label: error.instancePath || '(root)',
    message: describeError(error),
    keyword: error.keyword,
  }))
}

/**
 * Validates data against a schema, keeping the three failure modes apart:
 * malformed data, a malformed or uncompilable schema, and data that simply
 * does not match. The old tool reported all three as one anonymous error at
 * path `/`, so "you typed a stray comma in the schema" looked like "your data
 * is invalid".
 */
export function validateJson(
  dataText: string,
  schemaText: string,
  options: { strict: boolean }
): ValidationReport {
  const data = parseJson(dataText)
  const schema = parseJson(schemaText)
  if (data.status === 'empty' || schema.status === 'empty') return { status: 'empty' }
  if (data.status === 'invalid') {
    return { status: 'data-error', message: data.message, location: data.location }
  }
  if (schema.status === 'invalid') {
    return {
      status: 'schema-error',
      kind: 'parse',
      message: schema.message,
      location: schema.location,
    }
  }

  let validate: ValidateFunction
  try {
    validate = getValidator(schemaText, schema.value, options.strict)
  } catch (e) {
    return {
      status: 'schema-error',
      kind: 'compile',
      message: e instanceof Error ? e.message : String(e),
      location: null,
    }
  }

  if (validate(data.value)) return { status: 'valid' }
  const issues = toIssues(validate.errors ?? [])
  return { status: 'invalid', issues: issues.slice(0, MAX_ISSUES), total: issues.length }
}

// ---------------------------------------------------------------------------
// Schema inference
// ---------------------------------------------------------------------------

type Schema = Record<string, unknown>

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#'

const FORMAT_PATTERNS: [RegExp, string][] = [
  [/^[\w.+-]+@[\w.-]+\.\w+$/, 'email'],
  [/^\d{4}-\d{2}-\d{2}T/, 'date-time'],
  [/^\d{4}-\d{2}-\d{2}$/, 'date'],
  [/^https?:\/\//, 'uri'],
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'uuid'],
]

function asTypes(type: unknown): string[] {
  if (typeof type === 'string') return [type]
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === 'string')
  return []
}

/**
 * Widens two inferred schemas into one that accepts both. Inference used to
 * read only the first array item, so a list whose second entry had an extra
 * field produced a schema that rejected the very data it was inferred from.
 */
export function mergeSchemas(a: Schema, b: Schema): Schema {
  if (JSON.stringify(a) === JSON.stringify(b)) return a

  const aTypes = asTypes(a['type'])
  const bTypes = asTypes(b['type'])

  if (aTypes[0] === 'object' && bTypes[0] === 'object') {
    const aProps = (a['properties'] ?? {}) as Record<string, Schema>
    const bProps = (b['properties'] ?? {}) as Record<string, Schema>
    const properties: Record<string, Schema> = { ...aProps }
    for (const [key, schema] of Object.entries(bProps)) {
      const existing = aProps[key]
      properties[key] = existing ? mergeSchemas(existing, schema) : schema
    }
    // Required only where every observed object had the key: a field that
    // happens to appear in the first item is not thereby mandatory.
    const aRequired = (a['required'] ?? []) as string[]
    const bRequired = (b['required'] ?? []) as string[]
    const required = aRequired.filter((key) => bRequired.includes(key))
    const merged: Schema = { type: 'object', properties }
    if (required.length > 0) merged['required'] = required
    return merged
  }

  if (aTypes[0] === 'array' && bTypes[0] === 'array') {
    const aItems = a['items'] as Schema | undefined
    const bItems = b['items'] as Schema | undefined
    const items = aItems && bItems ? mergeSchemas(aItems, bItems) : (aItems ?? bItems)
    return items ? { type: 'array', items } : { type: 'array' }
  }

  const types = [...new Set([...aTypes, ...bTypes])]
  if (types.length === 2 && types.includes('integer') && types.includes('number')) {
    return { type: 'number' }
  }
  const merged: Schema = { type: types.length === 1 ? types[0] : types }
  // A format only survives if both samples agreed on it.
  if (a['format'] && a['format'] === b['format']) merged['format'] = a['format']
  return merged
}

function inferValue(data: unknown): Schema {
  if (data === null) return { type: 'null' }
  if (Array.isArray(data)) {
    if (data.length === 0) return { type: 'array' }
    const items = data.map(inferValue).reduce(mergeSchemas)
    return { type: 'array', items }
  }
  if (typeof data === 'object') {
    const properties: Record<string, Schema> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      properties[key] = inferValue(value)
      required.push(key)
    }
    const schema: Schema = { type: 'object', properties }
    if (required.length > 0) schema['required'] = required
    return schema
  }
  if (typeof data === 'number') {
    return Number.isInteger(data) ? { type: 'integer' } : { type: 'number' }
  }
  if (typeof data === 'boolean') return { type: 'boolean' }
  if (typeof data === 'string') {
    const format = FORMAT_PATTERNS.find(([pattern]) => pattern.test(data))?.[1]
    return format ? { type: 'string', format } : { type: 'string' }
  }
  return {}
}

/** Infers a draft-07 schema describing `data`. */
export function inferSchema(data: unknown): Schema {
  return { $schema: DRAFT_07, ...inferValue(data) }
}

// ---------------------------------------------------------------------------
// Sample generation
// ---------------------------------------------------------------------------

/** Builds the smallest document a schema would accept. */
export function generateSample(schema: Schema): unknown {
  const type = asTypes(schema['type'])[0]

  if (type === 'object') {
    const properties = (schema['properties'] ?? {}) as Record<string, Schema>
    const sample: Record<string, unknown> = {}
    for (const [key, propertySchema] of Object.entries(properties)) {
      sample[key] = generateSample(propertySchema)
    }
    return sample
  }
  if (type === 'array') {
    const items = schema['items'] as Schema | undefined
    return items ? [generateSample(items)] : []
  }
  if (type === 'string') {
    const enumValues = schema['enum'] as string[] | undefined
    if (enumValues) return enumValues[0] ?? ''
    const pattern = schema['pattern'] as string | undefined
    switch (schema['format'] as string | undefined) {
      case 'email':
        return 'user@example.com'
      case 'uri':
        return 'https://example.com'
      case 'date-time':
        return new Date().toISOString()
      case 'date':
        return new Date().toISOString().slice(0, 10)
      case 'uuid':
        return '00000000-0000-0000-0000-000000000000'
      case 'ipv4':
        return '127.0.0.1'
      default:
        // A generated sample that fails its own pattern reads as a bug in the
        // tool; saying so beats guessing a matching string.
        return pattern ? `string matching ${pattern}` : 'string'
    }
  }
  if (type === 'integer' || type === 'number') {
    return schema['minimum'] ?? 0
  }
  if (type === 'boolean') return true
  if (type === 'null') return null

  const enumValues = schema['enum'] as unknown[] | undefined
  if (enumValues) return enumValues[0] ?? null

  const allOf = schema['allOf'] as Schema[] | undefined
  if (allOf) {
    const merged: Record<string, unknown> = {}
    for (const sub of allOf) {
      const sample = generateSample(sub)
      if (typeof sample === 'object' && sample !== null) Object.assign(merged, sample)
    }
    return merged
  }

  const branches = (schema['oneOf'] ?? schema['anyOf']) as Schema[] | undefined
  if (branches?.[0]) return generateSample(branches[0])

  return null
}
