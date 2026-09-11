import { useEffect, useRef, useState, type RefObject } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readFile } from '@tauri-apps/plugin-fs'
import { filenameFromPath } from '@/lib/file-io'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])

function supportsImagePath(path: string): boolean {
  const extension = path.split('.').pop()?.toLowerCase()
  return extension !== undefined && IMAGE_EXTENSIONS.has(extension)
}

function isInside(position: { x: number; y: number }, container: HTMLDivElement): boolean {
  const rect = container.getBoundingClientRect()
  return (
    position.x >= rect.left &&
    position.x <= rect.right &&
    position.y >= rect.top &&
    position.y <= rect.bottom
  )
}

type ImageFileDropCallbacks = {
  /** The path lets the tool restore the image after a reload. */
  onFile: (file: File, path: string) => void
  onError: (message: string) => void
}

export function useImageFileDrop(
  containerRef: RefObject<HTMLDivElement | null>,
  callbacks: ImageFileDropCallbacks,
  enabled: boolean
): { isDraggingImage: boolean } {
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  useEffect(() => {
    if (!enabled) {
      setIsDraggingImage(false)
      return
    }

    let cancelled = false
    let unlisten: (() => void) | undefined
    const webview = getCurrentWebviewWindow()

    webview
      .onDragDropEvent(async (event) => {
        try {
          if (cancelled) return
          if (event.payload.type === 'leave') {
            setIsDraggingImage(false)
            return
          }

          const container = containerRef.current
          const position = 'position' in event.payload ? event.payload.position : null
          const factor = await webview.scaleFactor()
          if (cancelled) return
          const logicalPosition = position
            ? { x: position.x / factor, y: position.y / factor }
            : null
          const withinPreview = Boolean(
            container && (!logicalPosition || isInside(logicalPosition, container))
          )

          if (event.payload.type === 'over') {
            setIsDraggingImage(withinPreview)
            return
          }

          setIsDraggingImage(false)
          if (!withinPreview || event.payload.type !== 'drop') return

          // Open only the first supported image in one drop.
          const path = event.payload.paths.find(supportsImagePath)
          if (!path) return

          const bytes = await readFile(path)
          if (cancelled) return
          callbacksRef.current.onFile(new File([bytes], filenameFromPath(path)), path)
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

  return { isDraggingImage }
}
