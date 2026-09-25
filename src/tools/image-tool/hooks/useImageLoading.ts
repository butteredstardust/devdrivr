import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { readFile } from '@tauri-apps/plugin-fs'
import { FileTooLargeError, filenameFromPath, openImageFileDialog } from '@/lib/file-io'
import { formatBytes } from '@/lib/format'
import { useUiStore } from '@/stores/ui.store'
import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_FILE_BYTES,
  MAX_IMAGE_PIXELS,
  clampCropRect,
  isSupportedImageFile,
  type ImageToolState,
  type LoadedImage,
} from '@/tools/image-tool/image-tool-model'
import { useImageFileDrop } from '@/tools/image-tool/useImageFileDrop'

type UseImageLoadingOptions = {
  state: ImageToolState
  persistState: (patch: Partial<ImageToolState>) => void
  isInstanceActive: boolean
  onImageLoaded: () => void
}

export function useImageLoading({
  state,
  persistState,
  isInstanceActive,
  onImageLoaded,
}: UseImageLoadingOptions) {
  const setLastAction = useUiStore((s) => s.setLastAction)
  // ── Local state ────────────────────────────────────────────────

  const [originalImg, setOriginalImg] = useState<LoadedImage | null>(null)
  const [originalFileSize, setOriginalFileSize] = useState<number>(0)
  const [fileName, setFileName] = useState<string>('image')
  const [isDragOver, setIsDragOver] = useState(false)
  const [loadMessage, setLoadMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toolRootRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const loadGenerationRef = useRef(0)
  const objectUrlRef = useRef<string | null>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const restorePathRef = useRef<string | null>(null)
  const missingSourceNoticeRef = useRef(false)
  // A restore decode finishes long after it starts. It reads the saved crop
  // here, so `loadImageFile` does not have to depend on the whole state.
  const stateRef = useRef(state)
  stateRef.current = state
  // ── Image loading ──────────────────────────────────────────────

  const loadImageFile = useCallback(
    (file: File, sourcePath: string | null = null, restore = false) => {
      const generation = ++loadGenerationRef.current
      if (!isSupportedImageFile(file)) {
        setLastAction('File is not an image', 'error')
        return
      }
      if (file.size > MAX_IMAGE_FILE_BYTES) {
        setLastAction(`Image exceeds the ${formatBytes(MAX_IMAGE_FILE_BYTES)} file limit`, 'error')
        return
      }
      const objectUrl = URL.createObjectURL(file)
      void (async () => {
        let bitmap: ImageBitmap | null = null
        try {
          let drawable: CanvasImageSource
          let naturalWidth: number
          let naturalHeight: number

          if (typeof globalThis.createImageBitmap === 'function') {
            bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' })
            drawable = bitmap
            naturalWidth = bitmap.width
            naturalHeight = bitmap.height
          } else {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const candidate = new Image()
              candidate.onload = () => resolve(candidate)
              candidate.onerror = () => reject(new Error('Image decode failed'))
              candidate.src = objectUrl
            })
            drawable = img
            naturalWidth = img.naturalWidth
            naturalHeight = img.naturalHeight
          }

          if (generation !== loadGenerationRef.current) {
            bitmap?.close()
            URL.revokeObjectURL(objectUrl)
            return
          }

          const decodedPixels = naturalWidth * naturalHeight
          if (
            naturalWidth > MAX_IMAGE_DIMENSION ||
            naturalHeight > MAX_IMAGE_DIMENSION ||
            decodedPixels > MAX_IMAGE_PIXELS
          ) {
            bitmap?.close()
            URL.revokeObjectURL(objectUrl)
            setLastAction(
              `Image dimensions exceed the ${MAX_IMAGE_DIMENSION.toLocaleString()}px / ${MAX_IMAGE_PIXELS.toLocaleString()}px² limit`,
              'error'
            )
            return
          }

          bitmapRef.current?.close()
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
          bitmapRef.current = bitmap
          objectUrlRef.current = objectUrl
          onImageLoaded()
          setOriginalImg({ drawable, naturalWidth, naturalHeight, src: objectUrl })
          setFileName(file.name)
          setOriginalFileSize(file.size)
          setLoadMessage(null)
          missingSourceNoticeRef.current = false
          if (!restore) {
            persistState({
              sourcePath,
              resizeW: null,
              resizeH: null,
              cropX: 0,
              cropY: 0,
              cropW: naturalWidth,
              cropH: naturalHeight,
              rotation: 0,
              flipX: false,
              flipY: false,
            })
          } else {
            // The file on disk can differ from the one the crop was saved for.
            // Clamp the saved rectangle, so `drawImage` never reads outside it.
            const savedState = stateRef.current
            const saved = {
              x: savedState.cropX,
              y: savedState.cropY,
              w: savedState.cropW ?? naturalWidth,
              h: savedState.cropH ?? naturalHeight,
            }
            const fitted = clampCropRect(saved, { maxW: naturalWidth, maxH: naturalHeight })
            persistState({
              sourcePath,
              cropX: fitted.x,
              cropY: fitted.y,
              cropW: fitted.w,
              cropH: fitted.h,
            })
          }
          const action = `${restore ? 'Restored' : 'Opened'} "${file.name}"`
          const message = /(?:^image\/gif$|\.gif$)/i.test(file.type || file.name)
            ? `${action}. GIF import uses the first frame only.`
            : action
          setLastAction(message, 'success')
        } catch {
          bitmap?.close()
          URL.revokeObjectURL(objectUrl)
          if (generation !== loadGenerationRef.current) return
          if (restore) {
            const message = 'Open the image again.'
            setLoadMessage(message)
            persistState({
              sourcePath: null,
              resizeW: null,
              resizeH: null,
              cropX: 0,
              cropY: 0,
              cropW: null,
              cropH: null,
              rotation: 0,
              flipX: false,
              flipY: false,
            })
            setLastAction(message, 'error')
          } else {
            setLastAction('Failed to load image', 'error')
          }
        }
      })()
    },
    [onImageLoaded, persistState, setLastAction]
  )

  useEffect(() => {
    const loadGeneration = loadGenerationRef
    const bitmap = bitmapRef
    const objectUrl = objectUrlRef
    return () => {
      loadGeneration.current++
      bitmap.current?.close()
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])

  useEffect(() => {
    if (originalImg || !state.sourcePath || restorePathRef.current === state.sourcePath) return
    const sourcePath = state.sourcePath
    let cancelled = false
    restorePathRef.current = sourcePath
    // A restore read is slow. Drop it when the user opens another image while
    // it runs, otherwise the restore replaces the image the user chose.
    const generation = loadGenerationRef.current
    const superseded = () => cancelled || generation !== loadGenerationRef.current
    void readFile(sourcePath)
      .then((bytes) => {
        if (superseded()) return
        loadImageFile(new File([bytes], filenameFromPath(sourcePath)), sourcePath, true)
      })
      .catch(() => {
        if (superseded()) return
        const message = 'Open the image again.'
        setLoadMessage(message)
        persistState({
          sourcePath: null,
          resizeW: null,
          resizeH: null,
          cropX: 0,
          cropY: 0,
          cropW: null,
          cropH: null,
          rotation: 0,
          flipX: false,
          flipY: false,
        })
        setLastAction(message, 'error')
      })
    return () => {
      cancelled = true
    }
  }, [loadImageFile, originalImg, persistState, setLastAction, state.sourcePath])

  useEffect(() => {
    const hasStaleImageState = state.cropW !== null || state.cropH !== null
    if (originalImg || state.sourcePath || !hasStaleImageState || missingSourceNoticeRef.current) {
      return
    }
    missingSourceNoticeRef.current = true
    const message = 'Open the image again.'
    setLoadMessage(message)
    persistState({
      resizeW: null,
      resizeH: null,
      cropX: 0,
      cropY: 0,
      cropW: null,
      cropH: null,
      rotation: 0,
      flipX: false,
      flipY: false,
    })
    setLastAction(message, 'info')
  }, [originalImg, persistState, setLastAction, state.cropH, state.cropW, state.sourcePath])

  // ── Drag & drop ────────────────────────────────────────────────
  //
  // Two paths, because the tool runs in two windows. `useImageFileDrop` handles the desktop, where
  // Tauri claims the OS drop. The React handlers below are the only path in the remote-UI browser,
  // where no Tauri listener exists.
  /* tool-contract-ignore: html-drop-is-dead the remote-UI browser has no Tauri drop event */

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) loadImageFile(file)
    },
    [loadImageFile]
  )

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) loadImageFile(file)
      e.target.value = ''
    },
    [loadImageFile]
  )

  const handleOpenImage = useCallback(async () => {
    try {
      const selected = await openImageFileDialog({ maxBytes: MAX_IMAGE_FILE_BYTES })
      if (!selected) return
      loadImageFile(new File([new Uint8Array(selected.bytes)], selected.filename), selected.path)
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        setLastAction(`Image exceeds the ${formatBytes(MAX_IMAGE_FILE_BYTES)} file limit`, 'error')
        return
      }
      fileInputRef.current?.click()
    }
  }, [loadImageFile, setLastAction])

  // The tool has no focusable root, so a paste lands on the document. Listen
  // there, and only while this instance is the visible one.
  useEffect(() => {
    if (!isInstanceActive) return
    const onPaste = (event: ClipboardEvent) => {
      // The notes drawer and the command palette render beside the workspace and
      // paste images of their own. Claim only what lands on this tool or on
      // nothing, or one paste is handled twice.
      const target = event.target
      const owned =
        target === document ||
        target === document.body ||
        (target instanceof Node && toolRootRef.current?.contains(target) === true)
      if (!owned) return

      const file = [...(event.clipboardData?.files ?? [])].find(isSupportedImageFile)
      if (!file) return
      event.preventDefault()
      const namedFile = file.name
        ? file
        : new File([file], 'pasted-image.png', { type: file.type || 'image/png' })
      loadImageFile(namedFile)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [isInstanceActive, loadImageFile])

  const { isDraggingImage } = useImageFileDrop(
    previewContainerRef,
    {
      onFile: (file, path) => loadImageFile(file, path),
      onError: (message) => setLastAction(message, 'error'),
    },
    isInstanceActive
  )

  return {
    originalImg,
    originalFileSize,
    fileName,
    isDragOver,
    loadMessage,
    fileInputRef,
    toolRootRef,
    previewContainerRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
    handleOpenImage,
    isDraggingImage,
  }
}
