import { useEffect, useRef, useState, type RefObject } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readFile, stat } from '@tauri-apps/plugin-fs'
import { filenameFromPath, mimeTypeFromPath } from '@/lib/file-io'

/**
 * Receive an operating-system file drop inside one tool.
 *
 * The desktop window runs with Tauri's `dragDropEnabled`, so Tauri claims the drop and the webview
 * never fires an HTML5 `drop` event. A React `onDrop` handler in a tool is dead code here; this
 * hook is the only path that works.
 *
 * WARNING: the tool must also carry `ownsFileDrop` in the registry. Without it the shell listens
 * for the same drop and answers "File drop is not supported by the active tool".
 *
 * Every listener in the window sees every drop, so the drop is hit-tested against `containerRef`.
 * Pass `enabled: false` while the tool is in a background tab, or two tabs answer one drop.
 */

type NativeFileDropCallbacks = {
  /** The path lets the tool re-read or restore the file later. */
  onFile: (file: File, path: string) => void
  onError: (message: string) => void
  /** Decides which dropped paths this tool takes. Every path is taken when absent. */
  accept?: (path: string) => boolean
  /** Rejects an oversized file before its bytes are read, which a plain read would not survive. */
  maxBytes?: number
  /** Names the limit in the message the user sees. */
  onTooLarge?: (path: string, size: number) => void
}

function isInside(position: { x: number; y: number }, container: HTMLElement): boolean {
  const rect = container.getBoundingClientRect()
  return (
    position.x >= rect.left &&
    position.x <= rect.right &&
    position.y >= rect.top &&
    position.y <= rect.bottom
  )
}

export function useNativeFileDrop(
  containerRef: RefObject<HTMLElement | null>,
  callbacks: NativeFileDropCallbacks,
  enabled: boolean
): { isDragging: boolean } {
  const [isDragging, setIsDragging] = useState(false)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  useEffect(() => {
    if (!enabled) {
      setIsDragging(false)
      return
    }

    let cancelled = false
    let unlisten: (() => void) | undefined
    const webview = getCurrentWebviewWindow()

    // Read the scale factor once, when the listener starts. Asking for it inside
    // the handler lets a later `leave` finish before an earlier `over`, which
    // leaves the overlay on after the pointer goes. Fall back to 1 if the window
    // cannot report it; the hit test then uses physical pixels.
    const scaleFactor = webview.scaleFactor().catch(() => 1)

    webview
      .onDragDropEvent(async (event) => {
        try {
          if (cancelled) return
          if (event.payload.type === 'leave') {
            setIsDragging(false)
            return
          }

          const container = containerRef.current
          const position = 'position' in event.payload ? event.payload.position : null
          const factor = await scaleFactor
          if (cancelled) return
          const logicalPosition = position
            ? { x: position.x / factor, y: position.y / factor }
            : null
          const withinContainer = Boolean(
            container && (!logicalPosition || isInside(logicalPosition, container))
          )

          if (event.payload.type === 'over') {
            setIsDragging(withinContainer)
            return
          }

          setIsDragging(false)
          if (!withinContainer || event.payload.type !== 'drop') return

          // Take only the first accepted file in one drop.
          const { accept, maxBytes, onTooLarge } = callbacksRef.current
          const path = event.payload.paths.find((candidate) => accept?.(candidate) ?? true)
          if (!path) return

          if (maxBytes !== undefined) {
            const size = (await stat(path)).size
            if (cancelled) return
            if (size > maxBytes) {
              onTooLarge?.(path, size)
              return
            }
          }

          const bytes = await readFile(path)
          if (cancelled) return
          const file = new File([bytes], filenameFromPath(path), { type: mimeTypeFromPath(path) })
          callbacksRef.current.onFile(file, path)
        } catch (error) {
          if (cancelled) return
          callbacksRef.current.onError(error instanceof Error ? error.message : String(error))
        }
      })
      .then((cleanup) => {
        if (cancelled) cleanup()
        else unlisten = cleanup
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          callbacksRef.current.onError(error instanceof Error ? error.message : String(error))
        }
      })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [containerRef, enabled])

  return { isDragging }
}
