import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react'
import type { RefObject } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readFile } from '@tauri-apps/plugin-fs'
import { importNoteImage } from '@/lib/note-assets'
import type { EditorInstance } from '@/tools/markdown-editor/markdown-model'

const SUPPORTED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

function filenameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || 'image'
}

function supportsFilename(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase()
  return extension !== undefined && SUPPORTED_EXTENSIONS.has(extension)
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

function insertAtCursor(editor: EditorInstance, markdown: string): void {
  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position) return
  editor.executeEdits('note-image-attachment', [
    {
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
      text: `\n${markdown}\n`,
      forceMoveMarkers: true,
    },
  ])
  editor.focus()
}

type AttachmentCallbacks = {
  onSuccess: (count: number) => void
  onError: (message: string) => void
}

export function useNoteImageAttachments(
  editor: EditorInstance | null,
  containerRef: RefObject<HTMLDivElement | null>,
  callbacks: AttachmentCallbacks,
  enabled: boolean
): {
  isDraggingImage: boolean
  onPasteCapture: (event: ClipboardEvent<HTMLDivElement>) => void
} {
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const editorRef = useRef(editor)
  const callbacksRef = useRef(callbacks)
  editorRef.current = editor
  callbacksRef.current = callbacks

  const importFiles = useCallback(async (files: Array<{ name: string; bytes: Uint8Array }>) => {
    const activeEditor = editorRef.current
    if (!activeEditor) return
    const markdown: string[] = []
    try {
      for (const file of files) {
        markdown.push(await importNoteImage(file.bytes, file.name))
      }
      if (markdown.length === 0) return
      if (editorRef.current !== activeEditor) {
        throw new Error('The active note changed before the image import finished')
      }
      insertAtCursor(activeEditor, markdown.join('\n\n'))
      callbacksRef.current.onSuccess(markdown.length)
    } catch (error) {
      callbacksRef.current.onError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const onPasteCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const files = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/'))
      if (files.length === 0) return
      event.preventDefault()
      void Promise.all(
        files.map(async (file) => ({
          name: file.name || 'pasted-image.png',
          bytes: new Uint8Array(await file.arrayBuffer()),
        }))
      ).then(importFiles, (error: unknown) => {
        callbacksRef.current.onError(error instanceof Error ? error.message : String(error))
      })
    },
    [importFiles]
  )

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
        if (event.payload.type === 'leave') {
          setIsDraggingImage(false)
          return
        }
        const container = containerRef.current
        const position = 'position' in event.payload ? event.payload.position : null
        const factor = await webview.scaleFactor()
        const logicalPosition = position ? { x: position.x / factor, y: position.y / factor } : null
        const withinEditor = Boolean(
          container && (!logicalPosition || isInside(logicalPosition, container))
        )
        if (event.payload.type === 'over') {
          setIsDraggingImage(withinEditor)
          return
        }
        setIsDraggingImage(false)
        if (!withinEditor || event.payload.type !== 'drop') return
        const paths = event.payload.paths.filter(supportsFilename)
        if (paths.length === 0) return
        try {
          const files = await Promise.all(
            paths.map(async (path) => ({
              name: filenameFromPath(path),
              bytes: await readFile(path),
            }))
          )
          await importFiles(files)
        } catch (error) {
          callbacksRef.current.onError(error instanceof Error ? error.message : String(error))
        }
      })
      .then((cleanup) => {
        if (cancelled) cleanup()
        else unlisten = cleanup
      })
      .catch((error: unknown) => {
        callbacksRef.current.onError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [containerRef, enabled, importFiles])

  return { isDraggingImage, onPasteCapture }
}
