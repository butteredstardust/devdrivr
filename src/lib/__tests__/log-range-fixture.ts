/**
 * Builds the response of the `log_file_read` command for tests. It follows `read_range` and
 * `encode` in src-tauri/src/log_files.rs.
 */
export function logReadResponse(
  file: Uint8Array,
  start: number | null,
  maxBytes: number,
  identity = 1n
): number[] {
  const size = file.length
  const tail = Math.max(0, size - maxBytes)
  const begin = start !== null && start <= size ? Math.max(start, tail) : tail
  const head = file.subarray(0, 4)
  const bytes = file.subarray(begin)
  const out = new Uint8Array(32 + bytes.length)
  const view = new DataView(out.buffer)
  view.setBigUint64(0, BigInt(size), true)
  view.setBigUint64(8, BigInt(begin), true)
  view.setBigUint64(16, identity, true)
  view.setUint32(24, head.length, true)
  out.set(head, 28)
  out.set(bytes, 32)
  return Array.from(out)
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}
