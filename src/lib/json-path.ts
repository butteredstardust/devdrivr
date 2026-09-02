export type JsonPathResult = { found: true; value: unknown } | { found: false }

type Segment =
  | { kind: 'child'; key: string }
  | { kind: 'wildcard' }
  | { kind: 'recursive'; key: string | null }
  | { kind: 'indices'; keys: Array<string | number> }
  | { kind: 'slice'; start?: number; end?: number; step: number }
  | { kind: 'filter'; expression: string }

function findBracketEnd(path: string, start: number): number {
  let depth = 0
  let quote: string | null = null
  let escaped = false
  for (let i = start; i < path.length; i += 1) {
    const char = path[i]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '[') depth += 1
    if (char === ']') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\([\\"'])/g, '$1')
  }
  return trimmed
}

function parsePath(path: string): Segment[] {
  const source = path.trim()
  if (!source || (source !== '$' && !source.startsWith('$'))) return []
  const segments: Segment[] = []
  let index = 1
  while (index < source.length) {
    if (source.startsWith('..', index)) {
      index += 2
      if (source[index] === '*') {
        segments.push({ kind: 'recursive', key: null })
        index += 1
      } else {
        const start = index
        while (index < source.length && source[index] !== '.' && source[index] !== '[') index += 1
        const key = source.slice(start, index).trim()
        if (!key) return []
        segments.push({ kind: 'recursive', key })
      }
      continue
    }
    if (source[index] === '.') {
      index += 1
      if (source[index] === '*') {
        segments.push({ kind: 'wildcard' })
        index += 1
        continue
      }
      const start = index
      while (index < source.length && source[index] !== '.' && source[index] !== '[') index += 1
      const key = source.slice(start, index).trim()
      if (!key) return []
      segments.push({ kind: 'child', key })
      continue
    }
    if (source[index] !== '[') return []
    const end = findBracketEnd(source, index)
    if (end < 0) return []
    const content = source.slice(index + 1, end).trim()
    if (content === '*') segments.push({ kind: 'wildcard' })
    else if (content.startsWith('?(') && content.endsWith(')')) {
      segments.push({ kind: 'filter', expression: content.slice(2, -1).trim() })
    } else if (content.includes(':')) {
      const parts = content.split(':')
      const start = parts[0] ? Number(parts[0]) : undefined
      const finish = parts[1] ? Number(parts[1]) : undefined
      const step = parts[2] ? Number(parts[2]) : 1
      if (
        step === 0 ||
        (start !== undefined && !Number.isInteger(start)) ||
        (finish !== undefined && !Number.isInteger(finish))
      )
        return []
      segments.push({
        kind: 'slice',
        step,
        ...(start === undefined ? {} : { start }),
        ...(finish === undefined ? {} : { end: finish }),
      })
    } else if (content.includes(',')) {
      const keys = content
        .split(',')
        .map(unquote)
        .map((key) => (/^-?\d+$/.test(key) ? Number(key) : key))
      segments.push({ kind: 'indices', keys })
    } else {
      const key = unquote(content)
      segments.push({ kind: 'indices', keys: [/^-?\d+$/.test(key) ? Number(key) : key] })
    }
    index = end + 1
  }
  return segments
}

function childEntries(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item])
  if (value !== null && typeof value === 'object') return Object.entries(value)
  return []
}

function resolveIndex(length: number, index: number): number {
  return index < 0 ? length + index : index
}

function literal(value: string): unknown {
  const text = value.trim()
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
    return unquote(text)
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null') return null
  const number = Number(text)
  return Number.isNaN(number) ? text : number
}

function filterValue(item: unknown, expression: string): boolean {
  const match = /^@(?:\.([A-Za-z_$][\w$]*))?\s*(===|!==|==|!=|>=|<=|>|<|contains)?\s*(.*)$/.exec(
    expression
  )
  if (!match) return false
  const field = match[1]
  const operator = match[2]
  const expectedText = match[3]
  const actual = field ? childEntries(item).find(([key]) => key === field)?.[1] : item
  if (!operator) return actual !== undefined
  const expected = literal(expectedText ?? '')
  switch (operator) {
    case '===':
    case '==':
      return actual === expected
    case '!==':
    case '!=':
      return actual !== expected
    case '>':
      return (actual as number) > (expected as number)
    case '<':
      return (actual as number) < (expected as number)
    case '>=':
      return (actual as number) >= (expected as number)
    case '<=':
      return (actual as number) <= (expected as number)
    case 'contains':
      return typeof actual === 'string' && actual.includes(String(expected))
    default:
      return false
  }
}

function descendants(value: unknown, key: string | null): unknown[] {
  const result: unknown[] = []
  for (const [childKey, child] of childEntries(value)) {
    if (key === null || childKey === key) result.push(child)
    result.push(...descendants(child, key))
  }
  return result
}

/**
 * A deliberately bounded JSONPath evaluator. It supports child access,
 * wildcards, recursive descent, unions, slices, and simple predicates without
 * evaluating arbitrary JavaScript from a document.
 */
export function queryJsonPath(data: unknown, path: string): JsonPathResult {
  if (!path.trim()) return { found: false }
  if (path.trim() === '$') return { found: true, value: data }
  const segments = parsePath(path)
  if (segments.length === 0) return { found: false }
  let current: unknown[] = [data]
  for (const segment of segments) {
    const next: unknown[] = []
    for (const value of current) {
      if (segment.kind === 'child') {
        const child = childEntries(value).find(([key]) => key === segment.key)
        if (child) next.push(child[1])
      } else if (segment.kind === 'wildcard') {
        next.push(...childEntries(value).map(([, child]) => child))
      } else if (segment.kind === 'indices') {
        for (const key of segment.keys) {
          const entries = childEntries(value)
          const resolved =
            typeof key === 'number'
              ? resolveIndex(entries.length, key)
              : entries.findIndex(([name]) => name === key)
          if (resolved >= 0 && resolved < entries.length) next.push(entries[resolved]?.[1])
        }
      } else if (segment.kind === 'slice') {
        const entries = childEntries(value)
        const step = segment.step
        const start =
          segment.start === undefined
            ? step > 0
              ? 0
              : entries.length - 1
            : resolveIndex(entries.length, segment.start)
        const end =
          segment.end === undefined
            ? step > 0
              ? entries.length
              : -1
            : resolveIndex(entries.length, segment.end)
        for (let i = start; step > 0 ? i < end : i > end; i += step) {
          if (i >= 0 && i < entries.length) next.push(entries[i]?.[1])
        }
      } else if (segment.kind === 'filter') {
        next.push(
          ...childEntries(value)
            .map(([, child]) => child)
            .filter((child) => filterValue(child, segment.expression))
        )
      } else {
        next.push(...descendants(value, segment.key))
      }
    }
    current = next
  }
  if (current.length === 0) return { found: false }
  return { found: true, value: current.length === 1 ? current[0] : current }
}
