import { useEffect, useRef, useState } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readTextFile } from '@tauri-apps/plugin-fs'

export function useFileDropZone(onDrop: (content: string, filename: string) => void) {
  const [isDragging, setIsDragging] = useState(false)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'over') {
          setIsDragging(true)
        } else if (event.payload.type === 'leave') {
          setIsDragging(false)
        } else if (event.payload.type === 'drop') {
          setIsDragging(false)
          const paths = event.payload.paths
          if (paths.length > 0) {
            const filePath = paths[0] ?? ''
            if (!filePath) return
            const filename = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath
            readTextFile(filePath)
              .then((content) => {
                onDropRef.current(content, filename)
              })
              .catch((err) => {
                console.error('Failed to read dropped file:', err)
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

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  return { isDragging }
}
