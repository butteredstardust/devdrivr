/** Human-readable byte counts, shared so the tiers agree across tools. */

const KB = 1024
const MB = KB * KB

/**
 * `512 B` / `1.5 KB` / `2.3 MB`, one decimal above the byte tier.
 *
 * Every tool used to carry its own copy of this and they had drifted: two stopped at KB, so a 5 MB
 * document reported `5120.0 KB`, and one rendered MB to two decimals while its neighbours used one.
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
