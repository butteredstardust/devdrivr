// Pure helpers backing the Markdown Editor's smart-paste behaviour: turning a
// pasted URL + selection into a link, and pasted TSV data into a GFM table.
// Kept dependency-free and Monaco-free so they're unit testable in isolation.

const URL_RE = /^(https?:\/\/)\S+$/i

/** True when `text` (trimmed) is a single bare http(s) URL with no surrounding content. */
export function isUrl(text: string): boolean {
  return URL_RE.test(text.trim())
}

/** Escape `|` so it can't break out of a markdown table cell. */
function escapeCell(cell: string): string {
  return cell.replace(/\|/g, '\\|').trim()
}

/**
 * Convert tab-separated clipboard data (e.g. copied from a spreadsheet) into
 * a GFM table using the first row as the header. Returns null when `text`
 * isn't TSV-shaped: fewer than 2 rows, fewer than 2 columns, or a ragged
 * (inconsistent column count) grid.
 */
export function tsvToMarkdownTable(text: string): string | null {
  const rows = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0)
  if (rows.length < 2) return null

  const cells = rows.map((row) => row.split('\t'))
  const columnCount = cells[0]?.length ?? 0
  if (columnCount < 2) return null
  if (cells.some((row) => row.length !== columnCount)) return null

  const header = cells[0] ?? []
  const body = cells.slice(1)

  const headerRow = `| ${header.map(escapeCell).join(' | ')} |`
  const separatorRow = `| ${header.map(() => '---').join(' | ')} |`
  const bodyRows = body.map((row) => `| ${row.map(escapeCell).join(' | ')} |`)

  return [headerRow, separatorRow, ...bodyRows].join('\n')
}
