import { useEffect, useRef, useState } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { filenameFromPath, readSupportedTextFile } from '@/lib/file-io'

export function useFileDropZone(
  onDrop: (content: string, filename: string) => void,
  onError?: (message: string) => void,
  enabled = true
) {
  const [isDragging, setIsDragging] = useState(false)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'over') {
          setIsDragging(enabled)
        } else if (event.payload.type === 'leave') {
          setIsDragging(false)
        } else if (event.payload.type === 'drop') {
          setIsDragging(false)
          if (!enabled) {
            onErrorRef.current?.('File drop is not supported by the active tool')
            return
          }
          const paths = event.payload.paths
          if (paths.length > 0) {
            const filePath = paths[0] ?? ''
            if (!filePath) return
            const filename = filenameFromPath(filePath)
            readSupportedTextFile(filePath)
              .then((content) => {
                if (cancelled) return
                onDropRef.current(content, filename)
              })
              .catch((err) => {
                if (cancelled) return
                console.error('Failed to read dropped file:', err)
                onErrorRef.current?.(err instanceof Error ? err.message : String(err))
              })
          }
        }
      })
      .then((fn) => {
        if (cancelled) {
          // Effect already cleaned up (StrictMode) — immediately unlisten
          fn()
        } else {
          unlisten = fn
        }
      })
      .catch((err) => {
        if (!cancelled) {
          onErrorRef.current?.(
            `Failed to initialize file drop: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [enabled])

  return { isDragging }
}
