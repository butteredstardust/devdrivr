import Papa from 'papaparse'

export type ColumnType = 'number' | 'date' | 'string' | 'mixed'

export type Delimiter = ',' | '\t' | '|' | ';' | 'auto'

export interface CsvMetadata {
  __csv_meta__: {
    columnOrder: string[]
    types: Record<string, ColumnType>
  }
}

const DELIMITER_CHARS: Record<string, Delimiter> = {
  ',': ',',
  '\t': '\t',
  '|': '|',
  ';': ';',
}

/**
 * Detect the delimiter used in CSV text.
 * Returns the detected delimiter or ',' as fallback.
 */
export function detectDelimiter(csvText: string): Delimiter {
  const firstLine = csvText.split('\n')[0]
  if (firstLine === undefined) return ','

  const counts: Record<string, number> = { ',': 0, '\t': 0, '|': 0, ';': 0 }

  for (const char of firstLine) {
    if (char in counts) {
      counts[char] = (counts[char] ?? 0) + 1
    }
  }

  const entries = Object.entries(counts)
  const maxEntry = entries.reduce((a, b) => (a[1] > b[1] ? a : b))

  if (maxEntry[1] === 0) return ','

  const detected = DELIMITER_CHARS[maxEntry[0]]
  return detected ?? ','
}

/**
 * Check if a string is a valid date representation.
 */
export function isDateString(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false

  const date = new Date(value)
  if (isNaN(date.getTime())) return false

  // Reject values that parse but aren't really dates (e.g., "12345")
  if (/^\d+$/.test(value)) return false

  return true
}

/**
 * Infer the type of a column based on its values.
 * Returns 'number' if 90%+ values are numbers,
 * 'date' if 90%+ values are dates,
 * 'string' otherwise.
 */
export function inferColumnType(values: unknown[]): ColumnType {
  let numberCount = 0
  let dateCount = 0
  let validCount = 0

  for (const val of values) {
    if (val === null || val === undefined || val === '') continue
    validCount++
    if (typeof val === 'number') {
      numberCount++
    } else if (typeof val === 'string' && isDateString(val)) {
      dateCount++
    }
  }

  if (validCount === 0) return 'string'

  const numberRatio = numberCount / validCount
  const dateRatio = dateCount / validCount

  if (numberRatio > 0.9) return 'number'
  if (dateRatio > 0.9) return 'date'

  if (numberRatio > 0.1 || dateRatio > 0.1) return 'mixed'

  return 'string'
}

/**
 * Build metadata object for round-trip fidelity.
 */
export function buildMetadata(
  columnOrder: string[],
  types: Record<string, ColumnType>
): CsvMetadata {
  return {
    __csv_meta__: {
      columnOrder,
      types,
    },
  }
}

/**
 * Strip metadata from parsed data.
 */
export function stripMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data }
  delete result.__csv_meta__
  return result
}

/**
 * Parse CSV text using Papa Parse.
 */
export function parseCsv(csvText: string, delimiter: Delimiter, hasHeader: boolean) {
  const config: Papa.ParseConfig<Record<string, unknown>> = {
    header: hasHeader,
    dynamicTyping: true,
    skipEmptyLines: true,
    delimiter: delimiter === 'auto' ? undefined : delimiter,
  }

  return Papa.parse<Record<string, unknown>>(csvText, config)
}

/**
 * Convert array of objects to columnar (object of arrays).
 */
export function toColumnarFormat(data: Record<string, unknown>[]): Record<string, unknown[]> {
  if (data.length === 0) return {}

  const keys = Object.keys(data[0] ?? {})
  const result: Record<string, unknown[]> = {}

  for (const key of keys) {
    result[key] = data.map((row) => row[key])
  }

  return result
}

/**
 * Calculate column statistics for number values.
 */
export function calculateNumberStats(values: unknown[]): {
  min: number
  max: number
  mean: number
  median: number
  sum: number
} | null {
  const numbers = values.filter((v): v is number => typeof v === 'number' && !isNaN(v))

  if (numbers.length === 0) return null

  const sum = numbers.reduce((a, b) => a + b, 0)
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    mean: sum / numbers.length,
    median:
      sorted.length % 2 !== 0
        ? (sorted[mid] ?? 0)
        : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2,
    sum,
  }
}

/**
 * Calculate column statistics for string values.
 */
export function calculateStringStats(values: unknown[]): {
  unique: number
  longest: number
  nullCount: number
  nullPercent: number
} {
  let nullCount = 0
  const uniqueValues = new Set<string>()

  for (const val of values) {
    if (val === null || val === undefined || val === '') {
      nullCount++
      continue
    }
    uniqueValues.add(String(val))
  }

  const longest = Math.max(...Array.from(uniqueValues).map((v) => v.length), 0)

  return {
    unique: uniqueValues.size,
    longest,
    nullCount,
    nullPercent: values.length > 0 ? (nullCount / values.length) * 100 : 0,
  }
}
