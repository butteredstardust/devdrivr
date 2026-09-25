/**
 * WARNING: these functions consume `response.body`. Do not read the response again.
 *
 * Read a response body and stop at a byte limit. The rest of an oversized body
 * never downloads, because the stream is cancelled at the limit. Cancelling also
 * releases the body that the Tauri HTTP plugin holds on the Rust side.
 */

/**
 * Reads at most `maxBytes` of the body.
 *
 * `truncated` is true when the body is longer. `bytes` then holds the first `maxBytes`.
 */
export async function readBytesWithLimit(
  response: Response,
  maxBytes: number
): Promise<{ bytes: Uint8Array<ArrayBuffer>; truncated: boolean }> {
  if (!response.body) return { bytes: new Uint8Array(0), truncated: false }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const room = maxBytes - received
    if (value.byteLength > room) {
      chunks.push(value.subarray(0, room))
      received += room
      truncated = true
      await reader.cancel().catch(() => {})
      break
    }
    chunks.push(value)
    received += value.byteLength
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes, truncated }
}

/**
 * Reads the body as UTF-8 text. Throws `tooLargeMessage` when it is longer than `maxBytes`.
 *
 * A declared Content-Length above the limit throws before anything is read.
 */
export async function readTextWithLimit(
  response: Response,
  maxBytes: number,
  tooLargeMessage: string
): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {})
    throw new Error(tooLargeMessage)
  }
  const { bytes, truncated } = await readBytesWithLimit(response, maxBytes)
  if (truncated) throw new Error(tooLargeMessage)
  return new TextDecoder().decode(bytes)
}
