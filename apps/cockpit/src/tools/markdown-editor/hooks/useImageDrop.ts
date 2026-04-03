import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readFile } from '@tauri-apps/plugin-fs'

type EditorInstance = {
  getPosition: () => { lineNumber: number; column: number } | null
  getModel: () => {
    getOffsetAt: (pos: { lineNumber: number; column: number }) => number
    getPositionAt: (offset: number) => { lineNumber: number; column: number }
  } | null
  executeEdits: (
    source: string,
    edits: Array<{
      range: {
        startLineNumber: number
        startColumn: number
        endLineNumber: number
        endColumn: number
      }
      text: string
      forceMoveMarkers: boolean
    }>
  ) => void
  focus: () => void
}

// ─── Pure helpers (exported for testing) ────────────────────────────

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

/** Get MIME type for an image filename, or null if not a supported image */
export function getImageMimeType(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (!ext) return null
  return MIME_MAP[ext] ?? null
}

/** Convert Uint8Array to base64 string */
export function uint8ToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

// ─── Helpers ────────────────────────────────────────────────────────

function isWithinContainer(position: { x: number; y: number }, container: HTMLDivElement): boolean {
  const rect = container.getBoundingClientRect()
  return (
    position.x >= rect.left &&
    position.x <= rect.right &&
    position.y >= rect.top &&
    position.y <= rect.bottom
  )
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useImageDrop(
  editorRef: RefObject<EditorInstance | null>,
  containerRef: RefObject<HTMLDivElement | null>
): { isDraggingImage: boolean } {
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const editorRefLocal = useRef(editorRef)
  editorRefLocal.current = editorRef

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    getCurrentWebviewWindow()
      .onDragDropEvent(async (event) => {
        if (event.payload.type === 'over') {
          const container = containerRef.current
          if (container && 'position' in event.payload) {
            const pos = event.payload.position as { x: number; y: number }
            setIsDraggingImage(isWithinContainer(pos, container))
          } else {
            setIsDraggingImage(true)
          }
        } else if (event.payload.type === 'leave') {
          setIsDraggingImage(false)
        } else if (event.payload.type === 'drop') {
          setIsDraggingImage(false)
          const container = containerRef.current
          if (container && 'position' in event.payload) {
            const pos = event.payload.position as { x: number; y: number }
            if (!isWithinContainer(pos, container)) return
          }
          const paths = event.payload.paths
          if (paths.length === 0) return

          const editor = editorRefLocal.current.current
          if (!editor) return

          const insertions: string[] = []

          for (const filePath of paths) {
            const filename = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath
            const mime = getImageMimeType(filename)
            if (!mime) continue

            try {
              const bytes = await readFile(filePath)
              const base64 = uint8ToBase64(bytes)
              insertions.push(`![${filename}](data:${mime};base64,${base64})`)
            } catch (err) {
              console.error('Failed to read dropped image:', err)
            }
          }

          if (insertions.length === 0) return

          const model = editor.getModel()
          const position = editor.getPosition()
          if (!model || !position) return

          const text = insertions.join('\n\n')
          editor.executeEdits('image-drop', [
            {
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
              text: '\n' + text + '\n',
              forceMoveMarkers: true,
            },
          ])
          editor.focus()
        }
      })
      .then((fn) => {
        if (cancelled) {
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

  return { isDraggingImage }
}
