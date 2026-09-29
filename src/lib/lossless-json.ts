import { MAX_TRAVERSAL_DEPTH } from '@/lib/traversal'

class JsonNumber {
  constructor(readonly raw: string) {}
}

class JsonObject {
  constructor(readonly entries: Map<string, JsonValue>) {}
}

type JsonValue = null | boolean | string | JsonNumber | JsonObject | JsonValue[]

function normalizedDecimal(raw: string): { digits: string; exponent: number } {
  const unsigned = raw.startsWith('-') || raw.startsWith('+') ? raw.slice(1) : raw
  const [coefficient = '', exponentText] = unsigned.toLowerCase().split('e')
  const [integer = '', fraction = ''] = coefficient.split('.')
  let digits = `${integer}${fraction}`.replace(/^0+/, '')
  if (!digits) return { digits: '0', exponent: 0 }

  let exponent = Number(exponentText ?? 0) - fraction.length
  while (digits.endsWith('0')) {
    digits = digits.slice(0, -1)
    exponent += 1
  }
  return { digits, exponent }
}

export function exactNumber(raw: string): number | null {
  if (/^-?(?:0|[1-9]\d*)$/.test(raw)) {
    const value = Number(raw)
    return Number.isSafeInteger(value) ? value : null
  }

  if (
    !/^-?(?:0|[1-9]\d*)\.\d+(?:[eE][+-]?\d+)?$/.test(raw) &&
    !/^-?(?:0|[1-9]\d*)[eE][+-]?\d+$/.test(raw)
  ) {
    return null
  }

  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  const significand = raw.split(/[eE]/, 1)[0]?.replace('-', '').replace('.', '') ?? ''
  if (value === 0 && /[1-9]/.test(significand)) return null
  const source = normalizedDecimal(raw)
  const roundTrip = normalizedDecimal(String(value))
  return source.digits === roundTrip.digits && source.exponent === roundTrip.exponent ? value : null
}

class LosslessJsonParser {
  private index = 0

  constructor(private readonly text: string) {}

  parse(): JsonValue {
    this.skipWhitespace()
    return this.parseValue(0)
  }

  private parseValue(depth: number): JsonValue {
    if (depth > MAX_TRAVERSAL_DEPTH) {
      throw new Error(`JSON nesting exceeds the maximum depth of ${MAX_TRAVERSAL_DEPTH}`)
    }

    const char = this.text[this.index]
    if (char === '"') return this.parseString()
    if (char === '{') return this.parseObject(depth)
    if (char === '[') return this.parseArray(depth)
    if (char === 't') {
      this.index += 4
      return true
    }
    if (char === 'f') {
      this.index += 5
      return false
    }
    if (char === 'n') {
      this.index += 4
      return null
    }
    return this.parseNumber()
  }

  private parseObject(depth: number): JsonObject {
    this.index += 1
    this.skipWhitespace()
    const entries = new Map<string, JsonValue>()
    if (this.text[this.index] === '}') {
      this.index += 1
      return new JsonObject(entries)
    }

    while (true) {
      const key = this.parseString()
      this.skipWhitespace()
      this.index += 1
      this.skipWhitespace()
      entries.set(key, this.parseValue(depth + 1))
      this.skipWhitespace()
      if (this.text[this.index] === '}') {
        this.index += 1
        return new JsonObject(entries)
      }
      this.index += 1
      this.skipWhitespace()
    }
  }

  private parseArray(depth: number): JsonValue[] {
    this.index += 1
    this.skipWhitespace()
    const values: JsonValue[] = []
    if (this.text[this.index] === ']') {
      this.index += 1
      return values
    }

    while (true) {
      values.push(this.parseValue(depth + 1))
      this.skipWhitespace()
      if (this.text[this.index] === ']') {
        this.index += 1
        return values
      }
      this.index += 1
      this.skipWhitespace()
    }
  }

  private parseString(): string {
    const start = this.index
    this.index += 1
    while (this.text[this.index] !== '"') {
      if (this.text[this.index] === '\\') this.index += 1
      this.index += 1
    }
    this.index += 1
    return JSON.parse(this.text.slice(start, this.index)) as string
  }

  private parseNumber(): JsonNumber {
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
    match.lastIndex = this.index
    const result = match.exec(this.text)
    if (!result) throw new Error('Invalid JSON number')
    this.index = match.lastIndex
    return new JsonNumber(result[0])
  }

  private skipWhitespace(): void {
    while ('\t\n\r '.includes(this.text[this.index] ?? '\0')) {
      this.index += 1
    }
  }
}

function indentation(space: number | string): string {
  if (typeof space === 'string') return space.slice(0, 10)
  if (Number.isNaN(space) || space <= 0) return ''
  return ' '.repeat(space === Number.POSITIVE_INFINITY ? 10 : Math.min(10, Math.floor(space)))
}

function orderedKeys(entries: Map<string, JsonValue>, sortKeys: boolean): string[] {
  const keys = [...entries.keys()]
  if (sortKeys) keys.sort()

  // Object.keys applies the same integer-key ordering as JSON.stringify.
  const ordered = Object.create(null) as Record<string, true>
  for (const key of keys) ordered[key] = true
  return Object.keys(ordered)
}

function serialize(value: JsonValue, gap: string, sortKeys: boolean, depth: number): string {
  if (depth > MAX_TRAVERSAL_DEPTH) {
    throw new Error(`JSON nesting exceeds the maximum depth of ${MAX_TRAVERSAL_DEPTH}`)
  }
  if (value === null) return 'null'
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (value instanceof JsonNumber) return value.raw

  const currentIndent = gap.repeat(depth)
  const childIndent = gap.repeat(depth + 1)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((item) => serialize(item, gap, sortKeys, depth + 1))
    if (!gap) return `[${items.join(',')}]`
    return `[\n${childIndent}${items.join(`,\n${childIndent}`)}\n${currentIndent}]`
  }

  const keys = orderedKeys(value.entries, sortKeys)
  if (keys.length === 0) return '{}'
  const separator = gap ? ': ' : ':'
  const fields = keys.map((key) => {
    const item = value.entries.get(key)
    if (item === undefined) throw new Error('Missing JSON object value')
    return `${JSON.stringify(key)}${separator}${serialize(item, gap, sortKeys, depth + 1)}`
  })
  if (!gap) return `{${fields.join(',')}}`
  return `{\n${childIndent}${fields.join(`,\n${childIndent}`)}\n${currentIndent}}`
}

function toPlainValue(value: JsonValue): unknown {
  if (value instanceof JsonNumber) return exactNumber(value.raw) ?? value.raw
  if (Array.isArray(value)) return value.map(toPlainValue)
  if (value instanceof JsonObject) {
    return Object.fromEntries([...value.entries].map(([key, item]) => [key, toPlainValue(item)]))
  }
  return value
}

export function parseLosslessJson(text: string): unknown {
  JSON.parse(text)
  return toPlainValue(new LosslessJsonParser(text).parse())
}

export function reformatJson(
  text: string,
  options: { indent: number | string; sortKeys?: boolean }
): string {
  JSON.parse(text)
  const value = new LosslessJsonParser(text).parse()
  return serialize(value, indentation(options.indent), options.sortKeys ?? false, 0)
}
