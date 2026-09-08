import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openFileInTool } from '@/lib/file-routing'
import { filenameFromPath, isLikelyBinaryText } from '@/lib/file-io'
import { getToolById } from '@/app/tool-registry'
import { useUiStore } from '@/stores/ui.store'

const OPENED_FILES_EVENT = 'opened-files'

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Opens files the operating system handed to devdrivr — "Open With", a double-click on an
 * associated file, or a path on the command line.
 *
 * Mount this once, in the shell. Two arrival routes are covered:
 *
 * - A cold start queues the path in Rust before the webview exists. `opened_files_take` drains it.
 * - A warm start emits `opened-files` while the app runs.
 *
 * Content is read through a Rust command rather than `plugin-fs`, because a path from the system
 * carries no filesystem-scope grant. See src-tauri/src/opened_files.rs.
 */
export function useOpenedFiles(): void {
  const addToast = useUiStore((s) => s.addToast)

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    const openPath = async (path: string) => {
      const filename = filenameFromPath(path)
      try {
        const content = await invoke<string>('opened_file_read', { path })
        if (cancelled) return
        if (isLikelyBinaryText(content)) {
          addToast(`Unsupported binary file: ${filename}`, 'error')
          return
        }
        const toolId = openFileInTool({ content, filename, path })
        addToast(`Opened ${filename} in ${getToolById(toolId)?.name ?? toolId}`, 'success')
      } catch (err) {
        if (cancelled) return
        addToast(`Open failed: ${describe(err)}`, 'error')
      }
    }

    // The single source of paths, for a cold start and a warm one alike. Draining removes them in
    // Rust, so a file cannot be opened twice by a drain and an event that describe the same
    // arrival. Serial, not `Promise.all`: each file opens a tab, and opening them at once would
    // interleave the tab the shell is about to focus with the file addressed to it.
    const drain = async () => {
      const paths = await invoke<string[]>('opened_files_take')
      for (const path of paths) {
        if (cancelled) return
        await openPath(path)
      }
    }

    // Listen first, then drain. A file that arrives in between is left in the queue by the event —
    // which only reports that the queue changed — and collected by the drain that follows.
    listen(OPENED_FILES_EVENT, () => {
      if (!cancelled) void drain().catch(() => {})
    })
      .then((fn) => {
        if (cancelled) {
          fn()
          return
        }
        unlisten = fn
        void drain().catch(() => {})
      })
      // No Tauri backend (the Vite-only web preview) — there is nothing to open.
      .catch(() => {})

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [addToast])
}
