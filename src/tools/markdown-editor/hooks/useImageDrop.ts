import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readFile, stat } from '@tauri-apps/plugin-fs'
import { filenameFromPath, readSupportedTextFile } from '@/lib/file-io'
import { MAX_EDITABLE_TEXT_FILE_BYTES } from '@/lib/file-limits'
import { formatBytes } from '@/lib/format'

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

/**
 * Largest image to embed as a data URI. Base64 grows the bytes by 4/3, so an image at this size
 * still fits in a document the editor can open again.
 */
export const MAX_INLINE_IMAGE_BYTES = Math.floor((MAX_EDITABLE_TEXT_FILE_BYTES * 3) / 4)

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
 * WARNING: pass `enabled: false` while the tab is in the background. Every mounted tab keeps its
 * listener, and every listener sees every drop, so an ungated tab answers a drop meant for the tab
 * in front of it. A background tab would replace its own document with the dropped file.
 *
 * The tool carries `ownsFileDrop`, so the shell does not listen and this hook answers the whole
 * drop. Embed images at the cursor. Read other files as text and pass them to `onTextFile`.
 */
export function useImageDrop(
  editorRef: RefObject<EditorInstance | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
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
    if (!enabled) {
      setIsDraggingImage(false)
      return
    }

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

    // The hit test awaits, so an `over` that started first can finish last and switch the overlay
    // back on after a `leave` already cleared it. The counter keeps the newest event in charge.
    let eventId = 0

    webview
      .onDragDropEvent(async (event) => {
        const thisEvent = ++eventId
        const isCurrentEvent = () => !cancelled && thisEvent === eventId
        if (event.payload.type === 'over') {
          const inside = await isInside(event.payload)
          if (isCurrentEvent()) setIsDraggingImage(inside)
        } else if (event.payload.type === 'leave') {
          setIsDraggingImage(false)
        } else if (event.payload.type === 'drop') {
          setIsDraggingImage(false)
          if (!(await isInside(event.payload))) return
          if (cancelled) return
          const paths = event.payload.paths
          if (paths.length === 0) return

          const insertions: string[] = []
          const textPaths: string[] = []
          const skipped: string[] = []

          for (const filePath of paths) {
            const filename = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath
            const mime = getImageMimeType(filename)
            if (!mime) {
              textPaths.push(filePath)
              continue
            }

            try {
              // Check the size first. Reading a large photo only to reject it stalls the editor.
              if ((await stat(filePath)).size > MAX_INLINE_IMAGE_BYTES) {
                skipped.push(`${filename} is larger than ${formatBytes(MAX_INLINE_IMAGE_BYTES)}`)
                continue
              }
              const bytes = await readFile(filePath)
              const base64 = uint8ToBase64(bytes)
              insertions.push(`![${filename}](data:${mime};base64,${base64})`)
            } catch (err) {
              skipped.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`)
            }
          }

          if (skipped.length > 0 && !cancelled) {
            onErrorRef.current?.(`Image not embedded — ${skipped.join('; ')}`)
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

          // Each image read awaits, so the tab can go to the background before the last one
          // resolves. Stop here rather than write into an editor the user no longer looks at.
          if (cancelled) return

          // Only an image needs the editor. A document opens through `onTextFile` above, which
          // works in preview-only mode where no editor is focused.
          const editor = editorRefLocal.current.current
          if (!editor) return

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
  }, [enabled, containerRef])

  return { isDraggingImage }
}
