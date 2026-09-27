import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { watch } from '@tauri-apps/plugin-fs'
import { LogStream, parseLogRange, type LogUpdate } from '@/lib/log-tail'

/**
 * Reads a log file, then reads the bytes that a writer appends to it.
 *
 * WARNING: the callbacks run after an await. They must read the current tool state from refs,
 * not from the render that started the read.
 *
 * Two signals start a read: a filesystem watch, and a poll every `LOG_POLL_MS`. The poll catches
 * a change that the watch misses, for example after the log rotates and the watched file is gone.
 * One read runs at a time. A signal during a read starts one more read after it.
 *
 * While paused, a read asks for no new bytes. It reports new bytes through `onWaiting` and moves
 * nothing, so Resume reads everything that arrived during the pause. A read that was in progress
 * at the pause does the same with the bytes it returns.
 */

export const LOG_POLL_MS = 2000

type LogTailCallbacks = {
  onUpdate: (update: LogUpdate, stream: LogStream) => void
  /** Reports new bytes, or a new file, while paused. */
  onWaiting: () => void
  /** Reports a failed read. `first` is true when no read of this file succeeded yet. */
  onError: (message: string, first: boolean) => void
  /** Reports a successful read, including a read that found nothing new. */
  onRead: () => void
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Tails `path` until it changes to `null`. A new `session` reads the same path again from its
 * tail, for a second open of the file that is already open.
 */
export function useLogTail(
  path: string | null,
  session: number,
  paused: boolean,
  callbacks: LogTailCallbacks
): void {
  const callbacksRef = useRef(callbacks)
  const pausedRef = useRef(paused)
  const wasPausedRef = useRef(paused)
  const readRef = useRef<(() => void) | null>(null)
  callbacksRef.current = callbacks
  pausedRef.current = paused

  useEffect(() => {
    if (!path) return
    let cancelled = false
    let running = false
    let again = false
    let succeeded = false
    let unwatch: (() => void) | undefined
    const stream = new LogStream()

    const readOnce = async () => {
      const { start, maxBytes } = stream.nextRead(pausedRef.current)
      const response = await invoke<ArrayBuffer | number[]>('log_file_read', {
        path,
        start,
        maxBytes,
      })
      if (cancelled) return
      const range = parseLogRange(response)
      succeeded = true
      callbacksRef.current.onRead()
      if (pausedRef.current && stream.offset !== null) {
        if (stream.hasChanged(range)) callbacksRef.current.onWaiting()
        return
      }
      const update = stream.accept(range)
      if (!update) {
        again = true
        return
      }
      if (update.kind === 'append' && !update.text) return
      callbacksRef.current.onUpdate(update, stream)
    }

    const read = async () => {
      if (running) {
        again = true
        return
      }
      running = true
      try {
        do {
          again = false
          try {
            await readOnce()
          } catch (error) {
            if (!cancelled) callbacksRef.current.onError(describe(error), !succeeded)
          }
        } while (again && !cancelled)
      } finally {
        running = false
      }
    }

    readRef.current = () => void read()
    void read()
    const timer = setInterval(() => void read(), LOG_POLL_MS)
    watch(path, () => void read(), { delayMs: 200 })
      .then((stop) => {
        if (cancelled) stop()
        else unwatch = stop
      })
      // The poll still reads the file when the watch cannot start.
      .catch(() => {})

    return () => {
      cancelled = true
      readRef.current = null
      clearInterval(timer)
      unwatch?.()
    }
  }, [path, session])

  // Resume reads what arrived during the pause at once, not at the next signal.
  useEffect(() => {
    if (wasPausedRef.current && !paused) readRef.current?.()
    wasPausedRef.current = paused
  }, [paused])
}
