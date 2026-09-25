/**
 * WARNING: this function consumes `response.body`. Do not read the response again.
 *
 * Reads a response body as UTF-8 text and stops at `maxBytes`. A body that is
 * too large throws before the rest downloads, and the stream is cancelled.
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
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new Error(tooLargeMessage)
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}
