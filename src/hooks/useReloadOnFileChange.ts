import { useEffect, useRef } from 'react'
import { watch, type WatchEvent } from '@tauri-apps/plugin-fs'
import { filenameFromPath, readSupportedTextFile } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'

export type ReloadedTextFile = {
  content: string
  filename: string
  path: string
}

type ReloadOnFileChangeOptions = {
  filePath: string | null
  /** Read at event time so an app-initiated save can be recognized as a no-op. */
  getContent: () => string
  onReload: (file: ReloadedTextFile) => void
}

function mayChangeContent(event: WatchEvent): boolean {
  if (event.type === 'any') return true
  if (typeof event.type !== 'object') return false
  return 'modify' in event.type || 'create' in event.type || 'remove' in event.type
}

/**
 * Reloads a single text document when another process changes its file.
 *
 * The watcher is scoped to the path that came from the native open dialog (or the operating
 * system), so it follows the same filesystem permission as the original read. Editors provide
 * their live content through `getContent`: a save made by devdrivr then compares equal and does
 * not reset the editor or its undo history when the filesystem notification comes back.
 */
export function useReloadOnFileChange(options: ReloadOnFileChangeOptions): void {
  const setLastAction = useUiStore((s) => s.setLastAction)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!options.filePath) return

    const path = options.filePath
    const filename = filenameFromPath(path)
    let cancelled = false
    let unwatch: (() => void) | undefined
    let reading = false
    let readAgain = false

    const reload = async () => {
      if (reading) {
        readAgain = true
        return
      }
      reading = true
      try {
        do {
          readAgain = false
          try {
            const content = await readSupportedTextFile(path)
            if (cancelled) return
            if (content === optionsRef.current.getContent()) continue
            optionsRef.current.onReload({ content, filename, path })
          } catch (error) {
            if (!cancelled) {
              const message = error instanceof Error ? error.message : String(error)
              setLastAction(`Reload failed: ${message}`, 'error')
            }
          }
        } while (readAgain && !cancelled)
      } finally {
        reading = false
      }
    }

    const start = async () => {
      try {
        const stop = await watch(
          path,
          (event) => {
            if (!cancelled && mayChangeContent(event)) void reload()
          },
          { delayMs: 200 }
        )
        if (cancelled) {
          stop()
          return
        }
        unwatch = stop
      } catch (error) {
        // The Vite-only preview has no Tauri backend, and a restored path can outlive its scoped
        // permission. Neither should turn into an unhandled rejection or a startup toast.
        if (!cancelled) console.warn(`[file-watch] unable to watch ${path}`, error)
      }
    }

    void start()
    return () => {
      cancelled = true
      unwatch?.()
    }
  }, [options.filePath, setLastAction])
}
