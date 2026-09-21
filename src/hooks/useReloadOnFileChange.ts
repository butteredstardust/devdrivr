import { useEffect, useRef } from 'react'
import { watch, type WatchEvent } from '@tauri-apps/plugin-fs'
import { filenameFromPath, readSupportedTextFile } from '@/lib/file-io'
import { subscribeTextFileWrite } from '@/lib/text-file-write-events'
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
 * their live content through `getContent`. Successful app writes are also tracked explicitly:
 * the filesystem notification is debounced, so the user may already have typed more by the time
 * it arrives and a live-content comparison alone would mistake the app's save for an external edit.
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
    let appWriteContent: string | null = null

    const unsubscribeTextFileWrite = subscribeTextFileWrite((writtenPath, content) => {
      if (writtenPath === path) appWriteContent = content
    })

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
            if (appWriteContent === content) continue
            // A different disk value cannot belong to the recorded app write. Clear it so a later
            // event cannot suppress an external edit that happens to reuse the same text.
            appWriteContent = null
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
      unsubscribeTextFileWrite()
      unwatch?.()
    }
  }, [options.filePath, setLastAction])
}
