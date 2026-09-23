export type Flusher = () => Promise<void>

const FLUSH_TIMEOUT_MS = 2_000
const flushers = new Set<Flusher>()

export function registerFlusher(flusher: Flusher): () => void {
  flushers.add(flusher)
  return () => flushers.delete(flusher)
}

export async function flushAll(): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const settled = Promise.allSettled(
    [...flushers].map((flusher) => Promise.resolve().then(flusher))
  ).then(() => undefined)
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(resolve, FLUSH_TIMEOUT_MS)
  })

  await Promise.race([settled, timeout])
  clearTimeout(timeoutId)
}
