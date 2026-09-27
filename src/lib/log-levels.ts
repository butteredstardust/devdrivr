/**
 * Finds the severity of each log line, and filters the lines of a log.
 *
 * A level counts in two forms only, so a message such as "no error found" does not count:
 *
 * - An upper-case word: `ERROR`, `WARN`, `INFO`.
 * - A keyed or bracketed value in any case: `level=error`, `"level":"warn"`, `[info]`.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'

export const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug', 'trace']

const UPPER_LEVEL =
  /\b(FATAL|CRITICAL|CRIT|EMERG|ALERT|SEVERE|ERROR|ERR|WARNING|WARN|INFO|NOTICE|DEBUG|TRACE|VERBOSE)\b/
const KEYED_LEVEL =
  /(?:\b(?:level|lvl|severity|loglevel)["']?\s*[=:]\s*["']?|\[)(fatal|critical|crit|error|err|warning|warn|info|notice|debug|trace|verbose)\b/i

const LEVEL_NAMES: Record<string, LogLevel> = {
  fatal: 'error',
  critical: 'error',
  crit: 'error',
  emerg: 'error',
  alert: 'error',
  severe: 'error',
  error: 'error',
  err: 'error',
  warning: 'warn',
  warn: 'warn',
  info: 'info',
  notice: 'info',
  debug: 'debug',
  trace: 'trace',
  verbose: 'trace',
}

export type LevelMatch = { level: LogLevel; start: number; end: number }

/** Returns the first level in `line` and its position, or `null`. */
export function findLogLevel(line: string): LevelMatch | null {
  const upper = UPPER_LEVEL.exec(line)
  const keyed = KEYED_LEVEL.exec(line)
  const match = upper && keyed ? (upper.index <= keyed.index ? upper : keyed) : (upper ?? keyed)
  if (!match) return null
  const name = match[1] ?? ''
  const level = LEVEL_NAMES[name.toLowerCase()]
  if (!level) return null
  const end = match.index + match[0].length
  return { level, start: end - name.length, end }
}

export type LogIndex = {
  lines: string[]
  /** The level that each line names itself. */
  own: (LogLevel | null)[]
  /**
   * The level that each line belongs to. A line without a level, for example a stack trace line,
   * belongs to the level of the line before it.
   */
  effective: (LogLevel | null)[]
  /** Zero-based indexes of the lines that name `error`. */
  errorLines: number[]
  /** Zero-based indexes of the lines that name `warn`. */
  warningLines: number[]
}

export function indexLog(text: string): LogIndex {
  const lines = text ? text.split('\n') : []
  const own: (LogLevel | null)[] = []
  const effective: (LogLevel | null)[] = []
  const errorLines: number[] = []
  const warningLines: number[] = []
  let current: LogLevel | null = null
  lines.forEach((line, index) => {
    const level = findLogLevel(line)?.level ?? null
    own.push(level)
    if (level) current = level
    effective.push(current)
    if (level === 'error') errorLines.push(index)
    if (level === 'warn') warningLines.push(index)
  })
  return { lines, own, effective, errorLines, warningLines }
}

export type LogFilter = {
  query: string
  regex: boolean
  /** Shows lines of these levels only. An empty list shows every level. */
  levels: readonly LogLevel[]
}

export type FilteredLog =
  | {
      ok: true
      text: string
      /** The one-based line number in the full log of each shown line. */
      lineNumbers: number[]
    }
  | { ok: false; error: string }

export function isFilterActive(filter: LogFilter): boolean {
  return filter.query !== '' || filter.levels.length > 0
}

/** Keeps the lines that contain the query and belong to a selected level. */
export function filterLog(index: LogIndex, filter: LogFilter): FilteredLog {
  let matches: (line: string) => boolean = () => true
  if (filter.query) {
    if (filter.regex) {
      let pattern: RegExp
      try {
        pattern = new RegExp(filter.query, 'i')
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
      matches = (line) => pattern.test(line)
    } else {
      const needle = filter.query.toLowerCase()
      matches = (line) => line.toLowerCase().includes(needle)
    }
  }
  const levels = new Set(filter.levels)
  const kept: string[] = []
  const lineNumbers: number[] = []
  const last = index.lines.length - 1
  index.lines.forEach((line, lineIndex) => {
    // A final line break does not start a line.
    if (lineIndex === last && line === '') return
    if (levels.size > 0) {
      const level = index.effective[lineIndex]
      if (!level || !levels.has(level)) return
    }
    if (!matches(line)) return
    kept.push(line)
    lineNumbers.push(lineIndex + 1)
  })
  return { ok: true, text: kept.join('\n'), lineNumbers }
}
