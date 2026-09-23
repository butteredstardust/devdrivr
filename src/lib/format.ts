/** Human-readable byte counts, shared so the tiers agree across tools. */

const KB = 1024
const MB = KB * KB

/**
 * `512 B` / `1.5 KB` / `2.3 MB`, one decimal above the byte tier.
 *
 * Centralize byte formatting so every tool supports the same tiers and decimal precision.
 */
export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}

/** {@link formatBytes} for a string, measured as UTF-8 rather than UTF-16 code units. */
export function formatTextBytes(text: string): string {
  return formatBytes(new TextEncoder().encode(text).length)
}
