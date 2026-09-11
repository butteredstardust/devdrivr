import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readFile } from '@tauri-apps/plugin-fs'
import { filenameFromPath, readSupportedTextFile } from '@/lib/file-io'

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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    binary += String.fromCharCode(bytes[i]!) // safe: i < bytes.length
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

type TextFileHandler = (content: string, filename: string, path: string) => void

/**
 * Take every file dropped on the editor.
 *
 * The tool carries `ownsFileDrop`, so the shell does not listen and this hook answers the whole
 * drop. An image is embedded at the cursor. Anything else is read as text and passed to
 * `onTextFile`, which is what the shell used to do.
 */
export function useImageDrop(
  editorRef: RefObject<EditorInstance | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  onTextFile?: TextFileHandler,
  onError?: (message: string) => void
): { isDraggingImage: boolean } {
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const editorRefLocal = useRef(editorRef)
  editorRefLocal.current = editorRef
  const onTextFileRef = useRef(onTextFile)
  onTextFileRef.current = onTextFile
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    const webview = getCurrentWebviewWindow()

    // Read the scale factor once, when the listener starts. The drop reports physical pixels and
    // the container rectangle is in CSS pixels, so on a scaled display the hit test rejects most
    // of the editor without it. Fall back to 1; the test then uses physical pixels.
    const scaleFactor = webview.scaleFactor().catch(() => 1)

    const isInside = async (payload: { position?: { x: number; y: number } }) => {
      const container = containerRef.current
      if (!container || !payload.position) return true
      const factor = await scaleFactor
      return isWithinContainer(
        { x: payload.position.x / factor, y: payload.position.y / factor },
        container
      )
    }

    webview
      .onDragDropEvent(async (event) => {
        if (event.payload.type === 'over') {
          setIsDraggingImage(await isInside(event.payload))
        } else if (event.payload.type === 'leave') {
          setIsDraggingImage(false)
        } else if (event.payload.type === 'drop') {
          setIsDraggingImage(false)
          if (!(await isInside(event.payload))) return
          if (cancelled) return
          const paths = event.payload.paths
          if (paths.length === 0) return

          const editor = editorRefLocal.current.current
          if (!editor) return

          const insertions: string[] = []
          const textPaths: string[] = []

          for (const filePath of paths) {
            const filename = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath
            const mime = getImageMimeType(filename)
            if (!mime) {
              textPaths.push(filePath)
              continue
            }

            try {
              const bytes = await readFile(filePath)
              const base64 = uint8ToBase64(bytes)
              insertions.push(`![${filename}](data:${mime};base64,${base64})`)
            } catch (err) {
              console.error('Failed to read dropped image:', err)
            }
          }

          // Open the first text file. A second document cannot go anywhere, and the editor holds
          // one at a time.
          const textPath = textPaths[0]
          if (insertions.length === 0 && textPath !== undefined) {
            try {
              const content = await readSupportedTextFile(textPath)
              if (cancelled) return
              onTextFileRef.current?.(content, filenameFromPath(textPath), textPath)
            } catch (err) {
              if (cancelled) return
              onErrorRef.current?.(err instanceof Error ? err.message : String(err))
            }
            return
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- containerRef is a stable useRef, intentionally omitted

  return { isDraggingImage }
}
