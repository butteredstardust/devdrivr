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
  maxBytes?: number
  /** Read at event time so an app-initiated save can be recognized as a no-op. */
  getContent: () => string
  onReload: (file: ReloadedTextFile) => void
  onError?: (message: string) => void
  /**
   * Keeps the editor content when it differs from the last known disk content.
   *
   * Set this for a tool that does not ask before it replaces unsaved edits.
   */
  keepUnsavedEdits?: boolean
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
 *
 * With `keepUnsavedEdits`, the hook reads the disk content when the watch starts. It updates that
 * baseline after each reload and each app write. An external change then replaces the editor
 * content only when the editor still holds the baseline. When the baseline read fails, the editor
 * content at watch start is the baseline.
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
    let diskBaseline: string | null = null
    // A change event waits on this gate before it compares. It exists before the watch starts, so
    // an event that arrives before `watch()` resolves also waits.
    let releaseBaseline: () => void = () => {}
    const baselineReady = optionsRef.current.keepUnsavedEdits
      ? new Promise<void>((resolve) => {
          releaseBaseline = resolve
        })
      : Promise.resolve()
    // The fallback baseline. It matches the disk when the file was just opened.
    const contentAtStart = optionsRef.current.keepUnsavedEdits
      ? optionsRef.current.getContent()
      : null
    const readOptions = () =>
      optionsRef.current.maxBytes === undefined
        ? undefined
        : { maxBytes: optionsRef.current.maxBytes }

    const unsubscribeTextFileWrite = subscribeTextFileWrite((writtenPath, content) => {
      if (writtenPath !== path) return
      // Another tab can save the same file. Its content is not in this editor, so this watcher
      // must treat the write as an external change.
      if (content !== optionsRef.current.getContent()) return
      appWriteContent = content
      diskBaseline = content
    })

    const reload = async () => {
      if (reading) {
        readAgain = true
        return
      }
      reading = true
      try {
        await baselineReady
        if (cancelled) return
        do {
          readAgain = false
          try {
            const content = await readSupportedTextFile(path, readOptions())
            if (cancelled) return
            const current = optionsRef.current.getContent()
            if (content === current || appWriteContent === content) {
              diskBaseline = content
              continue
            }
            // A different disk value cannot belong to the recorded app write. Clear it so a later
            // event cannot suppress an external edit that happens to reuse the same text.
            appWriteContent = null
            if (
              optionsRef.current.keepUnsavedEdits &&
              diskBaseline !== null &&
              current !== diskBaseline
            ) {
              setLastAction(
                `${filename} changed on disk. Your unsaved edits are kept. Open the file again to load the disk version.`,
                'info'
              )
              continue
            }
            diskBaseline = content
            optionsRef.current.onReload({ content, filename, path })
          } catch (error) {
            if (!cancelled) {
              const message = error instanceof Error ? error.message : String(error)
              optionsRef.current.onError?.(message)
              setLastAction(`Reload failed: ${message}`, 'error')
            }
          }
        } while (readAgain && !cancelled)
      } finally {
        reading = false
      }
    }

    const readBaseline = async () => {
      try {
        const content = await readSupportedTextFile(path, readOptions())
        // An app write during the read sets a newer baseline. Keep that one.
        if (diskBaseline === null) diskBaseline = content
      } catch {
        if (diskBaseline === null) diskBaseline = contentAtStart
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
        // Read the baseline after the watch starts, so no change falls between the two.
        if (optionsRef.current.keepUnsavedEdits) void readBaseline().finally(releaseBaseline)
      } catch (error) {
        // The Vite-only preview has no Tauri backend, and a restored path can outlive its scoped
        // permission. Neither should turn into an unhandled rejection or a startup toast.
        if (!cancelled) console.warn(`[file-watch] unable to watch ${path}`, error)
      }
    }

    void start()
    return () => {
      cancelled = true
      releaseBaseline()
      unsubscribeTextFileWrite()
      unwatch?.()
    }
  }, [options.filePath, setLastAction])
}
