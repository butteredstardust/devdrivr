export const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024
export const MAX_LOG_VIEW_CHARACTERS = 2_000_000

export function prepareLogContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_LOG_VIEW_CHARACTERS) return { content, truncated: false }
  return { content: content.slice(-MAX_LOG_VIEW_CHARACTERS), truncated: true }
}

export function countTextLines(content: string): number {
  if (!content) return 0
  let lines = 1
  for (let index = 0; index < content.length; index++) {
    if (content.charCodeAt(index) === 10) lines++
  }
  return lines
}

export function logFileLimitMessage(): string {
  return `File is larger than the ${MAX_LOG_FILE_BYTES / 1024 / 1024} MB import limit`
}
