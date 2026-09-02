import Papa from 'papaparse'
import yaml from 'js-yaml'

// ---------------------------------------------------------------------------
// Delimiters
// ---------------------------------------------------------------------------

export type Delimiter = ',' | '\t' | '|' | ';' | 'auto'

export const DELIMITER_OPTIONS: { value: Delimiter; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: ',', label: 'Comma' },
  { value: '\t', label: 'Tab' },
  { value: ';', label: 'Semicolon' },
  { value: '|', label: 'Pipe' },
]

const CANDIDATES: Exclude<Delimiter, 'auto'>[] = [',', '\t', ';', '|']

/**
 * Splits the source into records the way a CSV reader does: a newline inside a
 * quoted field continues the record rather than ending it.
 *
 * Everything that needs to talk about "the line this row came from" goes
 * through here — splitting on `\n` first would both miscount fields and, once
 * blank lines are skipped, make every reported line number drift.
 */
export function splitRecords(text: string): { text: string; line: number }[] {
  const records: { text: string; line: number }[] = []
  let current = ''
  let line = 1
  let startLine = 1
  let inQuotes = false

  const push = () => {
    // Skipped exactly where Papa's `skipEmptyLines: true` skips — a line that
    // yields one empty field, which includes a lone `""` — so the two lists
    // stay index-aligned and reported line numbers cannot drift.
    if (current !== '' && current !== '""') records.push({ text: current, line: startLine })
    current = ''
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      // A doubled quote is an escaped quote, not a section boundary.
      if (inQuotes && text[i + 1] === '"') {
        current += '""'
        i++
        continue
      }
      inQuotes = !inQuotes
      current += char
      continue
    }
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++
      push()
      line++
      startLine = line
      continue
    }
    if (inQuotes && (char === '\n' || char === '\r')) {
      // A classic-Mac file uses a bare `\r`, and `\r\n` is still one break;
      // getting either wrong under-counts every line after a quoted field.
      line++
      if (char === '\r' && text[i + 1] === '\n') {
        current += char
        i++
        current += '\n'
        continue
      }
    }
    current += char
  }
  push()
  return records
}

/** Counts a character outside quoted sections — `a,"b,c"` has one comma. */
function countOutsideQuotes(record: string, char: string): number {
  let count = 0
  let inQuotes = false
  for (let i = 0; i < record.length; i++) {
    const c = record[i]
    if (c === '"') {
      if (inQuotes && record[i + 1] === '"') {
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === char) count++
  }
  return count
}

/** The commonest value, ignoring zeroes — the shape most records agree on. */
function modalCount(counts: number[]): number {
  const tally = new Map<number, number>()
  for (const count of counts) {
    if (count === 0) continue
    tally.set(count, (tally.get(count) ?? 0) + 1)
  }
  let best = 0
  let bestTally = 0
  for (const [count, seen] of tally) {
    if (seen > bestTally || (seen === bestTally && count > best)) {
      best = count
      bestTally = seen
    }
  }
  return best
}

/**
 * Picks the delimiter that splits the most records into the same field count.
 *
 * The old detector counted characters in the *first line only*, so a header of
 * `name,description` beat a genuinely semicolon-separated file whose first
 * description happened to contain two commas — and a file with a title row
 * ahead of the header disqualified the real delimiter outright. Agreement
 * across records is what distinguishes a delimiter from punctuation.
 */
export function detectDelimiter(text: string): Exclude<Delimiter, 'auto'> {
  const sample = splitRecords(text)
    .slice(0, 20)
    .map((record) => record.text)
  if (sample.length === 0) return ','

  let best: Exclude<Delimiter, 'auto'> = ','
  let bestScore = -1
  for (const candidate of CANDIDATES) {
    const counts = sample.map((record) => countOutsideQuotes(record, candidate))
    const modal = modalCount(counts)
    if (modal === 0) continue
    const agreement = counts.filter((count) => count === modal).length / counts.length
    // Field count breaks ties: with two equally consistent candidates the one
    // that splits the record into more columns is the more likely separator.
    const score = agreement * 100 + Math.min(modal, 20)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type CsvRow = Record<string, unknown>

export type CsvIssue = {
  /** 1-based line in the source text, so it can be clicked to. */
  line: number
  message: string
}

export type CsvParse =
  | { status: 'empty' }
  | {
      status: 'parsed'
      columns: string[]
      rows: CsvRow[]
      issues: CsvIssue[]
      delimiter: Exclude<Delimiter, 'auto'>
    }

export type ParseOptions = {
  delimiter: Delimiter
  hasHeader: boolean
  /** Off keeps every field a string — the only way to preserve `007` or a ZIP. */
  typed: boolean
}

/** The commonest field count — the shape a headerless file is meant to have. */
function modalLength(records: string[][]): number {
  const counts = new Map<number, number>()
  for (const record of records) counts.set(record.length, (counts.get(record.length) ?? 0) + 1)
  let best = 0
  let bestCount = 0
  for (const [length, count] of counts) {
    if (count > bestCount) {
      best = length
      bestCount = count
    }
  }
  return best
}

/** `Column 3` for a field the header row never named. */
function fallbackColumn(index: number): string {
  return `Column ${index + 1}`
}

/** Header cells can repeat; a second `id` must not overwrite the first. */
function uniqueColumns(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((raw, index) => {
    const base = raw.trim() === '' ? fallbackColumn(index) : raw.trim()
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base} (${count + 1})`
  })
}

/**
 * Parses to a column list plus row objects.
 *
 * Rows are read positionally (`header: false`) and keyed afterwards, because
 * Papa's header mode drops any field beyond the header's width — a ragged file
 * lost data with nothing reported. Here the extra fields get their own columns
 * and the row is flagged instead.
 */
export function parseCsv(text: string, options: ParseOptions): CsvParse {
  if (!text.trim()) return { status: 'empty' }

  const delimiter = options.delimiter === 'auto' ? detectDelimiter(text) : options.delimiter

  const result = Papa.parse<string[]>(text, {
    header: false,
    delimiter,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  const records = result.data.filter((record) => Array.isArray(record))
  // Papa reports positions by record index; the user navigates by source line,
  // and a blank line or a quoted newline makes those two disagree.
  const lines = splitRecords(text).map((record) => record.line)
  const headerRecord = options.hasHeader ? (records[0] ?? []) : []
  const bodyRecords = options.hasHeader ? records.slice(1) : records

  const widest = bodyRecords.reduce(
    (max, record) => Math.max(max, record.length),
    headerRecord.length
  )
  const names: string[] = []
  for (let i = 0; i < widest; i++) {
    names.push(options.hasHeader ? (headerRecord[i] ?? fallbackColumn(i)) : fallbackColumn(i))
  }
  const columns = uniqueColumns(names)

  const issues: CsvIssue[] = []
  const lineOf = (bodyIndex: number) =>
    lines[bodyIndex + (options.hasHeader ? 1 : 0)] ?? bodyIndex + 1

  for (const error of result.errors) {
    issues.push({
      line: typeof error.row === 'number' ? (lines[error.row] ?? 1) : 1,
      message: error.message,
    })
  }

  // Rows are compared against the header (or the commonest width without one),
  // not against the widest row: one overlong row would otherwise flag every
  // other row in the file as the odd one out.
  const expected = options.hasHeader ? headerRecord.length : modalLength(bodyRecords)

  const rows: CsvRow[] = bodyRecords.map((record, index) => {
    if (record.length !== expected) {
      issues.push({
        line: lineOf(index),
        message: `Row has ${record.length} field${record.length === 1 ? '' : 's'}, expected ${expected}`,
      })
    }
    const row: CsvRow = {}
    columns.forEach((column, i) => {
      const raw = record[i]
      row[column] = raw === undefined ? null : options.typed ? coerce(raw) : raw
    })
    return row
  })

  return { status: 'parsed', columns, rows, issues, delimiter }
}

/** Converts a JSON array of records into the same table model as CSV input. */
export function parseJsonRows(text: string, typed = false): CsvParse {
  if (!text.trim()) return { status: 'empty' }
  try {
    const parsed: unknown = JSON.parse(text)
    if (
      !Array.isArray(parsed) ||
      !parsed.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))
    ) {
      return {
        status: 'parsed',
        columns: [],
        rows: [],
        issues: [{ line: 1, message: 'JSON input must be an array of objects' }],
        delimiter: ',',
      }
    }
    const columns = Array.from(
      new Set(parsed.flatMap((row) => Object.keys(row as Record<string, unknown>)))
    )
    const rows = parsed.map((row) => {
      const record = row as Record<string, unknown>
      return Object.fromEntries(
        columns.map((column) => {
          const value = record[column]
          return [column, typed && typeof value === 'string' ? coerce(value) : (value ?? null)]
        })
      )
    })
    return { status: 'parsed', columns, rows, issues: [], delimiter: ',' }
  } catch (error) {
    return {
      status: 'parsed',
      columns: [],
      rows: [],
      issues: [
        {
          line: 1,
          message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      delimiter: ',',
    }
  }
}

/** Papa's `dynamicTyping`, minus its habit of turning `007` into `7`. */
function coerce(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  // A leading zero or a `+` is a code (ZIP, phone, SKU), not arithmetic.
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return value
}

// ---------------------------------------------------------------------------
// Output formats
// ---------------------------------------------------------------------------

export type OutputFormat = 'json-rows' | 'json-columns' | 'tsv' | 'markdown' | 'yaml' | 'sql'

export const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'json-rows', label: 'JSON — array of objects' },
  { value: 'json-columns', label: 'JSON — object of arrays' },
  { value: 'tsv', label: 'TSV' },
  { value: 'markdown', label: 'Markdown table' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL inserts' },
]

export const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  'json-rows': 'json',
  'json-columns': 'json',
  tsv: 'tsv',
  markdown: 'md',
  yaml: 'yaml',
  sql: 'sql',
}

export const FORMAT_LANGUAGES: Record<OutputFormat, string> = {
  'json-rows': 'json',
  'json-columns': 'json',
  tsv: 'plaintext',
  markdown: 'markdown',
  yaml: 'yaml',
  sql: 'sql',
}

function cellText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

/** `|` and newlines would break out of a Markdown cell. */
function escapeMarkdown(value: unknown): string {
  return cellText(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'NULL'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return `'${String(value).replace(/'/g, "''")}'`
}

/** A quoted identifier: a column called `order` or `first name` is legal SQL. */
function sqlIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function toOutput(
  columns: string[],
  rows: CsvRow[],
  format: OutputFormat,
  tableName = 'csv_data'
): string {
  switch (format) {
    case 'json-rows':
      return JSON.stringify(rows, null, 2)
    case 'json-columns': {
      const columnar: Record<string, unknown[]> = {}
      for (const column of columns) columnar[column] = rows.map((row) => row[column])
      return JSON.stringify(columnar, null, 2)
    }
    case 'tsv': {
      // Tabs inside a value would add a phantom column.
      const clean = (value: unknown) => cellText(value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
      return [
        columns.join('\t'),
        ...rows.map((row) => columns.map((c) => clean(row[c])).join('\t')),
      ].join('\n')
    }
    case 'markdown': {
      const header = `| ${columns.map(escapeMarkdown).join(' | ')} |`
      const rule = `| ${columns.map(() => '---').join(' | ')} |`
      const body = rows.map(
        (row) => `| ${columns.map((c) => escapeMarkdown(row[c])).join(' | ')} |`
      )
      return [header, rule, ...body].join('\n')
    }
    case 'yaml':
      return yaml.dump(rows, { noRefs: true, lineWidth: 120 })
    case 'sql': {
      const names = columns.map(sqlIdentifier).join(', ')
      return rows
        .map(
          (row) =>
            `INSERT INTO ${sqlIdentifier(tableName)} (${names}) VALUES (${columns
              .map((c) => sqlLiteral(row[c]))
              .join(', ')});`
        )
        .join('\n')
    }
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export type ColumnType = 'number' | 'boolean' | 'date' | 'string' | 'mixed' | 'empty'

export type ColumnSummary = {
  name: string
  type: ColumnType
  count: number
  blanks: number
  blankPercent: number
  unique: number
  /** Numbers only. */
  numeric: { min: number; max: number; mean: number; median: number; sum: number } | null
  /** Everything else: the longest value and the most common one. */
  text: { longest: number; mode: string | null; modeCount: number } | null
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

/** ISO-ish dates only — `new Date('Alice')` is a date in some engines. */
export function isDateString(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/.test(value.trim())) return false
  return !Number.isNaN(new Date(value).getTime())
}

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string' || value.trim() === '') return false
  return Number.isFinite(Number(value))
}

export function inferColumnType(values: unknown[]): ColumnType {
  let numbers = 0
  let dates = 0
  let booleans = 0
  let filled = 0

  for (const value of values) {
    if (isBlank(value)) continue
    filled++
    if (typeof value === 'boolean' || value === 'true' || value === 'false') booleans++
    else if (isNumeric(value)) numbers++
    else if (isDateString(value)) dates++
  }

  if (filled === 0) return 'empty'
  const ratio = (n: number) => n / filled
  if (ratio(numbers) === 1) return 'number'
  if (ratio(booleans) === 1) return 'boolean'
  if (ratio(dates) === 1) return 'date'
  // A column that is 95% numbers is still a column with something else in it,
  // and that something is usually the interesting part of the file.
  if (numbers > 0 || dates > 0 || booleans > 0) return 'mixed'
  return 'string'
}

export function summarizeColumn(name: string, values: unknown[]): ColumnSummary {
  const type = inferColumnType(values)
  const blanks = values.filter(isBlank).length
  const filled = values.filter((value) => !isBlank(value))
  const unique = new Set(filled.map((value) => String(value))).size

  let numeric: ColumnSummary['numeric'] = null
  if (type === 'number' || type === 'mixed') {
    const numbers = filled.map(Number).filter((n) => Number.isFinite(n))
    if (numbers.length > 0) {
      const sorted = [...numbers].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const sum = numbers.reduce((a, b) => a + b, 0)
      numeric = {
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
        mean: sum / numbers.length,
        median:
          sorted.length % 2 === 1
            ? (sorted[mid] ?? 0)
            : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2,
        sum,
      }
    }
  }

  let text: ColumnSummary['text'] = null
  if (type !== 'number') {
    const counts = new Map<string, number>()
    let longest = 0
    for (const value of filled) {
      const asText = String(value)
      longest = Math.max(longest, asText.length)
      counts.set(asText, (counts.get(asText) ?? 0) + 1)
    }
    let mode: string | null = null
    let modeCount = 0
    for (const [value, count] of counts) {
      if (count > modeCount) {
        mode = value
        modeCount = count
      }
    }
    text = { longest, mode, modeCount }
  }

  return {
    name,
    type,
    count: values.length,
    blanks,
    blankPercent: values.length === 0 ? 0 : (blanks / values.length) * 100,
    unique,
    numeric,
    text,
  }
}

export function summarizeColumns(columns: string[], rows: CsvRow[]): ColumnSummary[] {
  return columns.map((column) =>
    summarizeColumn(
      column,
      rows.map((row) => row[column])
    )
  )
}

/** Rows whose every cell repeats an earlier row — the usual export artefact. */
export function countDuplicateRows(columns: string[], rows: CsvRow[]): number {
  const seen = new Set<string>()
  let duplicates = 0
  for (const row of rows) {
    const key = JSON.stringify(columns.map((column) => row[column] ?? null))
    if (seen.has(key)) duplicates++
    else seen.add(key)
  }
  return duplicates
}

// ---------------------------------------------------------------------------
// Schema generation
// ---------------------------------------------------------------------------

/** A key that is not a valid identifier has to be quoted in an interface. */
function tsKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

const TS_TYPES: Record<ColumnType, string> = {
  number: 'number',
  boolean: 'boolean',
  date: 'string',
  string: 'string',
  mixed: 'string | number',
  empty: 'string',
}

export function generateTypeScript(summaries: ColumnSummary[], name = 'CsvRow'): string {
  const lines = [`interface ${name} {`]
  for (const summary of summaries) {
    // A blank cell is a missing value, and the type has to admit it.
    const nullable = summary.blanks > 0 ? ' | null' : ''
    const comment = summary.type === 'date' ? ' // ISO date' : ''
    lines.push(`  ${tsKey(summary.name)}: ${TS_TYPES[summary.type]}${nullable};${comment}`)
  }
  lines.push('}')
  return lines.join('\n')
}

const SQL_TYPES: Record<ColumnType, string> = {
  number: 'NUMERIC',
  boolean: 'BOOLEAN',
  date: 'TIMESTAMP',
  string: 'TEXT',
  mixed: 'TEXT',
  empty: 'TEXT',
}

export function generateSql(summaries: ColumnSummary[], tableName = 'csv_data'): string {
  const columns = summaries.map((summary) => {
    const nullable = summary.blanks > 0 ? '' : ' NOT NULL'
    return `  ${sqlIdentifier(summary.name)} ${SQL_TYPES[summary.type]}${nullable}`
  })
  return `CREATE TABLE ${sqlIdentifier(tableName)} (\n${columns.join(',\n')}\n);`
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** The source name with the exported format's extension (`report.csv` → `report.json`). */
export function outputFileName(source: string | null, extension: string): string {
  const base = (source ?? 'data').replace(/\.[^./\\]+$/, '')
  return `${base}.${extension}`
}
