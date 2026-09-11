import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsInstanceActive } from '@/app/tool-instance'
import { useToolState } from '@/hooks/useToolState'
import { useFrameThrottle } from '@/hooks/useFrameThrottle'
import { useUiStore } from '@/stores/ui.store'
import {
  buildExportFilename,
  exportFile,
  filenameFromPath,
  openImageFileDialog,
} from '@/lib/file-io'
import { subscribeToolAction } from '@/lib/tool-actions'
import { useImageFileDrop } from '@/tools/image-tool/useImageFileDrop'
import { readFile } from '@tauri-apps/plugin-fs'
import { Button } from '@/components/shared/Button'
import { Field } from '@/components/shared/Field'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Input } from '@/components/shared/Input'
import { TabBar, TabPanel } from '@/components/shared/TabBar'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Toolbar, ToolbarSpacer } from '@/components/shared/Toolbar'
import {
  ImageIcon,
  UploadSimpleIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  DownloadSimpleIcon,
  CopyIcon,
} from '@phosphor-icons/react'
import { formatBytes } from '@/lib/format'

// ── Types ──────────────────────────────────────────────────────────

type ImageToolState = {
  activeTab: string
  sourcePath: string | null
  // Resize
  resizeW: number | null
  resizeH: number | null
  lockAspect: boolean
  // Crop
  cropX: number
  cropY: number
  cropW: number | null
  cropH: number | null
  rotation: 0 | 90 | 180 | 270
  flipX: boolean
  flipY: boolean
  // Export
  format: 'png' | 'jpeg' | 'webp'
  quality: number
}

type DisplayMetrics = {
  displayScale: number
  displayW: number
  displayH: number
  offsetX: number
  offsetY: number
}

type CropHandle = 'nw' | 'ne' | 'sw' | 'se' | 'body'

type CropDragState = {
  handle: CropHandle
  startMouseX: number
  startMouseY: number
  startCrop: { x: number; y: number; w: number; h: number }
  displayScale: number
  origW: number
  origH: number
}

type LoadedImage = {
  drawable: CanvasImageSource
  naturalWidth: number
  naturalHeight: number
  src: string
}

// ── Constants ──────────────────────────────────────────────────────

const TABS = [
  { id: 'resize', label: 'Resize' },
  { id: 'crop', label: 'Crop' },
  { id: 'transform', label: 'Rotate & Flip' },
  { id: 'export', label: 'Export' },
]

const FORMAT_TABS = [
  { id: 'png', label: 'PNG' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'webp', label: 'WebP' },
]

const MAX_IMAGE_FILE_BYTES = 50 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 16_384
const MAX_IMAGE_PIXELS = 64_000_000
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])
// JPEG has no alpha channel. Transparent pixels take this colour on export.
const JPEG_BACKGROUND = '#ffffff'

// The resize/crop dimension fields. `Input` owns the border, background, radius
// and focus ring; only the monospace digits and the full-width fill are local.
const NUMBER_FIELD_CLASS = 'w-full py-1 font-mono'

const PRESET_SIZES = [
  { label: '1:1', w: 1, h: 1 },
  { label: '16:9', w: 16, h: 9 },
  { label: '4:3', w: 4, h: 3 },
  { label: '3:2', w: 3, h: 2 },
]

const CROP_HANDLE_LABELS = {
  nw: 'Northwest crop handle',
  ne: 'Northeast crop handle',
  sw: 'Southwest crop handle',
  se: 'Southeast crop handle',
} as const

// ── Helpers ────────────────────────────────────────────────────────

type CropRect = {
  x: number
  y: number
  w: number
  h: number
}

type ImageParameters = Omit<ImageToolState, 'activeTab' | 'sourcePath'>

function getImageParameters(state: ImageToolState): ImageParameters {
  return {
    resizeW: state.resizeW,
    resizeH: state.resizeH,
    lockAspect: state.lockAspect,
    cropX: state.cropX,
    cropY: state.cropY,
    cropW: state.cropW,
    cropH: state.cropH,
    rotation: state.rotation,
    flipX: state.flipX,
    flipY: state.flipY,
    format: state.format,
    quality: state.quality,
  }
}

export function clampCropRect(rect: CropRect, bounds: { maxW: number; maxH: number }): CropRect {
  const maxW = Math.max(1, bounds.maxW)
  const maxH = Math.max(1, bounds.maxH)
  let w = Math.round(Number.isFinite(rect.w) ? rect.w : maxW)
  let h = Math.round(Number.isFinite(rect.h) ? rect.h : maxH)
  let x = Math.round(Number.isFinite(rect.x) ? rect.x : 0)
  let y = Math.round(Number.isFinite(rect.y) ? rect.y : 0)

  w = Math.max(1, Math.min(w, maxW))
  h = Math.max(1, Math.min(h, maxH))
  x = Math.max(0, Math.min(x, maxW - w))
  y = Math.max(0, Math.min(y, maxH - h))

  return { x, y, w, h }
}

function cropRectsMatch(first: CropRect, second: CropRect): boolean {
  return (
    first.x === second.x && first.y === second.y && first.w === second.w && first.h === second.h
  )
}

function hasSupportedImageExtension(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase()
  return extension !== undefined && IMAGE_EXTENSIONS.has(extension)
}

function isSupportedImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const typeNeedsExtension = file.type === '' || file.type === 'application/octet-stream'
  return typeNeedsExtension && hasSupportedImageExtension(file.name)
}

// ── Component ──────────────────────────────────────────────────────

export default function ImageTool() {
  const isInstanceActive = useIsInstanceActive()
  const [state, persistState] = useToolState<ImageToolState>('image-tool', {
    activeTab: 'resize',
    sourcePath: null,
    resizeW: null,
    resizeH: null,
    lockAspect: true,
    cropX: 0,
    cropY: 0,
    cropW: null,
    cropH: null,
    rotation: 0,
    flipX: false,
    flipY: false,
    format: 'png',
    quality: 85,
  })

  const setLastAction = useUiStore((s) => s.setLastAction)

  // ── Local state ────────────────────────────────────────────────

  const [originalImg, setOriginalImg] = useState<LoadedImage | null>(null)
  const [originalFileSize, setOriginalFileSize] = useState<number>(0)
  const [fileName, setFileName] = useState<string>('image')
  const [isDragOver, setIsDragOver] = useState(false)
  const [displayMetrics, setDisplayMetrics] = useState<DisplayMetrics | null>(null)
  const [outputBlobSize, setOutputBlobSize] = useState(0)
  const [outputSize, setOutputSize] = useState<{ w: number; h: number } | null>(null)
  const [outputError, setOutputError] = useState<string | null>('Output is not ready')
  const [isExporting, setIsExporting] = useState(false)
  const [loadMessage, setLoadMessage] = useState<string | null>(null)

  // ── Refs ────────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null)
  const toolRootRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const outputCanvasRef = useRef<HTMLCanvasElement>(null)
  const cropDragRef = useRef<CropDragState | null>(null)
  const cropDragUndoRef = useRef<ImageParameters | null>(null)
  const loadGenerationRef = useRef(0)
  const objectUrlRef = useRef<string | null>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const restorePathRef = useRef<string | null>(null)
  const missingSourceNoticeRef = useRef(false)
  const exportInFlightRef = useRef(false)
  const undoRef = useRef<ImageParameters | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  // A restore decode finishes long after it starts. It reads the saved crop
  // here, so `loadImageFile` does not have to depend on the whole state.
  const stateRef = useRef(state)
  stateRef.current = state

  const updateParameters = useCallback(
    (patch: Partial<ImageParameters>) => {
      undoRef.current = getImageParameters(state)
      setCanUndo(true)
      persistState(patch)
    },
    [persistState, state]
  )

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
          setDisplayMetrics(null)
          setOutputError('Output is not ready')
          setOriginalImg({ drawable, naturalWidth, naturalHeight, src: objectUrl })
          setFileName(file.name)
          setOriginalFileSize(file.size)
          setLoadMessage(null)
          missingSourceNoticeRef.current = false
          undoRef.current = null
          setCanUndo(false)
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
    [persistState, setLastAction]
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) loadImageFile(file)
    },
    [loadImageFile]
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) loadImageFile(file)
      e.target.value = ''
    },
    [loadImageFile]
  )

  const handleOpenImage = useCallback(async () => {
    try {
      const selected = await openImageFileDialog()
      if (!selected) return
      loadImageFile(new File([new Uint8Array(selected.bytes)], selected.filename), selected.path)
    } catch {
      fileInputRef.current?.click()
    }
  }, [loadImageFile])

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

  // ── Display metrics (for crop overlay positioning) ─────────────
  // Updated via ResizeObserver so crop handles stay accurate on resize.

  useEffect(() => {
    const container = previewContainerRef.current
    if (!container || !originalImg) return

    const update = () => {
      const { width, height } = container.getBoundingClientRect()
      if (!width || !height) return
      const origW = originalImg.naturalWidth
      const origH = originalImg.naturalHeight
      const scale = Math.min(width / origW, height / origH)
      const displayW = origW * scale
      const displayH = origH * scale
      setDisplayMetrics({
        displayScale: scale,
        displayW,
        displayH,
        offsetX: (width - displayW) / 2,
        offsetY: (height - displayH) / 2,
      })
    }

    update()

    // Guard for jsdom / environments without ResizeObserver
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [originalImg])

  // ── Canvas rendering ───────────────────────────────────────────
  // Always draws to the hidden/visible output canvas so export works
  // regardless of which tab is active.

  useEffect(() => {
    const canvas = outputCanvasRef.current
    if (!canvas || !originalImg) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const srcX = state.cropX
    const srcY = state.cropY
    const srcW = state.cropW ?? originalImg.naturalWidth
    const srcH = state.cropH ?? originalImg.naturalHeight

    const sourceOutW = Math.round(state.resizeW ?? srcW)
    const sourceOutH = Math.round(state.resizeH ?? srcH)
    const quarterTurn = state.rotation === 90 || state.rotation === 270
    const outW = quarterTurn ? sourceOutH : sourceOutW
    const outH = quarterTurn ? sourceOutW : sourceOutH

    if (
      !Number.isFinite(outW) ||
      !Number.isFinite(outH) ||
      outW < 1 ||
      outH < 1 ||
      outW > MAX_IMAGE_DIMENSION ||
      outH > MAX_IMAGE_DIMENSION ||
      outW * outH > MAX_IMAGE_PIXELS
    ) {
      const reason = `Output exceeds the ${MAX_IMAGE_DIMENSION.toLocaleString()}px per side or ${MAX_IMAGE_PIXELS.toLocaleString()}px² limit`
      if (canvas.width !== 1) canvas.width = 1
      if (canvas.height !== 1) canvas.height = 1
      setOutputSize(null)
      setOutputBlobSize(0)
      setOutputError(reason)
      setLastAction(reason, 'error')
      return
    }

    if (canvas.width !== outW) canvas.width = outW
    if (canvas.height !== outH) canvas.height = outH
    ctx.clearRect(0, 0, outW, outH)
    // JPEG carries no alpha. Fill a fixed white matte so a transparent source
    // exports the same file in every theme.
    if (state.format === 'jpeg') {
      ctx.fillStyle = JPEG_BACKGROUND
      ctx.fillRect(0, 0, outW, outH)
    }
    ctx.save()
    ctx.translate(outW / 2, outH / 2)
    ctx.rotate((state.rotation * Math.PI) / 180)
    ctx.scale(state.flipX ? -1 : 1, state.flipY ? -1 : 1)
    ctx.drawImage(
      originalImg.drawable,
      srcX,
      srcY,
      srcW,
      srcH,
      -sourceOutW / 2,
      -sourceOutH / 2,
      sourceOutW,
      sourceOutH
    )
    ctx.restore()

    setOutputSize({ w: outW, h: outH })
    setOutputError(null)

    const mimeType =
      state.format === 'jpeg' ? 'image/jpeg' : state.format === 'webp' ? 'image/webp' : 'image/png'
    let live = true
    const encodeTimer = setTimeout(() => {
      canvas.toBlob(
        (blob) => {
          if (live) setOutputBlobSize(blob?.size ?? 0)
        },
        mimeType,
        state.quality / 100
      )
    }, 180)
    return () => {
      live = false
      clearTimeout(encodeTimer)
    }
    // Keyed on the fields the draw reads, not on the whole state object. `state` is a new object
    // on every patch, so switching a tab or toggling the aspect lock redrew the canvas and
    // restarted the encode for an output that could not have changed.
  }, [
    originalImg,
    state.cropX,
    state.cropY,
    state.cropW,
    state.cropH,
    state.resizeW,
    state.resizeH,
    state.rotation,
    state.flipX,
    state.flipY,
    state.format,
    state.quality,
    setLastAction,
  ])

  // ── Resize helpers ─────────────────────────────────────────────

  const sourceW = state.cropW ?? originalImg?.naturalWidth ?? 0
  const sourceH = state.cropH ?? originalImg?.naturalHeight ?? 0
  const aspect = sourceW > 0 && sourceH > 0 ? sourceW / sourceH : 1

  const handleResizeW = useCallback(
    (w: number) => {
      if (!w || w < 1) return
      if (state.lockAspect) {
        updateParameters({ resizeW: w, resizeH: Math.max(1, Math.round(w / aspect)) })
      } else {
        updateParameters({ resizeW: w })
      }
    },
    [state.lockAspect, aspect, updateParameters]
  )

  const handleResizeH = useCallback(
    (h: number) => {
      if (!h || h < 1) return
      if (state.lockAspect) {
        updateParameters({ resizeH: h, resizeW: Math.max(1, Math.round(h * aspect)) })
      } else {
        updateParameters({ resizeH: h })
      }
    },
    [state.lockAspect, aspect, updateParameters]
  )

  const handleResetResize = useCallback(() => {
    if (!originalImg) return
    updateParameters({ resizeW: null, resizeH: null })
  }, [originalImg, updateParameters])

  const handleApplyPreset = useCallback(
    (pw: number, ph: number) => {
      if (!originalImg || sourceW < 1 || sourceH < 1) return
      // Fit the preset ratio within the crop. Resize reads the crop as its
      // source, so measuring the original here would scale the output.
      const targetAspect = pw / ph
      let w = sourceW
      let h = Math.round(sourceW / targetAspect)
      if (h > sourceH) {
        h = sourceH
        w = Math.round(sourceH * targetAspect)
      }
      updateParameters({ resizeW: Math.max(1, w), resizeH: Math.max(1, h) })
    },
    [originalImg, sourceW, sourceH, updateParameters]
  )

  // ── Crop interaction ────────────────────────────────────────────

  const handleCropHandleMouseDown = useCallback(
    (e: React.MouseEvent, handle: CropHandle) => {
      e.preventDefault()
      e.stopPropagation()
      if (!displayMetrics || !originalImg) return
      cropDragUndoRef.current = getImageParameters(state)
      cropDragRef.current = {
        handle,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startCrop: {
          x: state.cropX,
          y: state.cropY,
          w: state.cropW ?? originalImg.naturalWidth,
          h: state.cropH ?? originalImg.naturalHeight,
        },
        displayScale: displayMetrics.displayScale,
        origW: originalImg.naturalWidth,
        origH: originalImg.naturalHeight,
      }
    },
    [displayMetrics, originalImg, state]
  )

  /** Last rect handed to updateState. Guards a redraw for a crop that has not moved. */
  const committedCropRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  // Every commit re-renders the tool, resizes the output canvas and redraws the image. A mouse
  // delivers several moves per frame, and only the last one can paint, so only the last is applied.
  const { run: scheduleCrop, flush: flushCrop } = useFrameThrottle(
    (clientX: number, clientY: number) => {
      const drag = cropDragRef.current
      if (!drag) return
      const { displayScale, origW, origH } = drag
      const dx = (clientX - drag.startMouseX) / displayScale
      const dy = (clientY - drag.startMouseY) / displayScale

      let { x, y, w, h } = drag.startCrop
      switch (drag.handle) {
        case 'nw': {
          // Lower-bound nx/ny so dragging past the image edge doesn't invert the rect
          const nx = Math.max(
            0,
            Math.min(drag.startCrop.x + dx, drag.startCrop.x + drag.startCrop.w - 1)
          )
          const ny = Math.max(
            0,
            Math.min(drag.startCrop.y + dy, drag.startCrop.y + drag.startCrop.h - 1)
          )
          w = drag.startCrop.w - (nx - drag.startCrop.x)
          h = drag.startCrop.h - (ny - drag.startCrop.y)
          x = nx
          y = ny
          break
        }
        case 'ne': {
          const ny = Math.max(
            0,
            Math.min(drag.startCrop.y + dy, drag.startCrop.y + drag.startCrop.h - 1)
          )
          h = drag.startCrop.h - (ny - drag.startCrop.y)
          w = Math.max(1, drag.startCrop.w + dx)
          y = ny
          break
        }
        case 'sw': {
          // Lower-bound nx so dragging past x=0 doesn't produce a negative width
          const nx = Math.max(
            0,
            Math.min(drag.startCrop.x + dx, drag.startCrop.x + drag.startCrop.w - 1)
          )
          w = drag.startCrop.w - (nx - drag.startCrop.x)
          h = Math.max(1, drag.startCrop.h + dy)
          x = nx
          break
        }
        case 'se':
          w = Math.max(1, drag.startCrop.w + dx)
          h = Math.max(1, drag.startCrop.h + dy)
          break
        case 'body':
          x = drag.startCrop.x + dx
          y = drag.startCrop.y + dy
          break
      }

      const next = clampCropRect({ x, y, w, h }, { maxW: origW, maxH: origH })

      // Dragging past the image edge keeps producing the same clamped rect. Committing it again
      // would redraw the canvas once a frame for a crop that is standing still.
      const previous = committedCropRef.current
      const comparison = previous ?? drag.startCrop
      if (
        comparison.x === next.x &&
        comparison.y === next.y &&
        comparison.w === next.w &&
        comparison.h === next.h
      ) {
        return
      }
      if (!previous && cropDragUndoRef.current) {
        undoRef.current = cropDragUndoRef.current
        setCanUndo(true)
      }
      committedCropRef.current = next

      persistState({
        cropX: next.x,
        cropY: next.y,
        cropW: next.w,
        cropH: next.h,
      })
    }
  )

  const handleCropMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!cropDragRef.current) return
      scheduleCrop(e.clientX, e.clientY)
    },
    [scheduleCrop]
  )

  const handleCropMouseUp = useCallback(() => {
    // Land the last position before the drag is dropped, or the crop settles a frame behind
    // where the pointer let go.
    flushCrop()
    cropDragRef.current = null
    cropDragUndoRef.current = null
    committedCropRef.current = null
  }, [flushCrop])

  const handleCropKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!originalImg) return
      const step = event.shiftKey ? 10 : 1
      let dx = 0
      let dy = 0
      if (event.key === 'ArrowLeft') dx = -step
      if (event.key === 'ArrowRight') dx = step
      if (event.key === 'ArrowUp') dy = -step
      if (event.key === 'ArrowDown') dy = step
      if (!dx && !dy) return
      event.preventDefault()
      const next = clampCropRect(
        {
          x: state.cropX + dx,
          y: state.cropY + dy,
          w: state.cropW ?? originalImg.naturalWidth,
          h: state.cropH ?? originalImg.naturalHeight,
        },
        { maxW: originalImg.naturalWidth, maxH: originalImg.naturalHeight }
      )
      const current = {
        x: state.cropX,
        y: state.cropY,
        w: state.cropW ?? originalImg.naturalWidth,
        h: state.cropH ?? originalImg.naturalHeight,
      }
      if (cropRectsMatch(next, current)) return
      updateParameters({ cropX: next.x, cropY: next.y, cropW: next.w, cropH: next.h })
    },
    [originalImg, state.cropH, state.cropW, state.cropX, state.cropY, updateParameters]
  )

  const handleCropHandleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, handle: Exclude<CropHandle, 'body'>) => {
      if (!originalImg) return
      const step = event.shiftKey ? 10 : 1
      let dx = 0
      let dy = 0
      if (event.key === 'ArrowLeft') dx = -step
      if (event.key === 'ArrowRight') dx = step
      if (event.key === 'ArrowUp') dy = -step
      if (event.key === 'ArrowDown') dy = step
      if (!dx && !dy) return
      event.preventDefault()
      event.stopPropagation()

      let x = state.cropX
      let y = state.cropY
      let w = state.cropW ?? originalImg.naturalWidth
      let h = state.cropH ?? originalImg.naturalHeight

      if (handle === 'nw' || handle === 'sw') {
        const nextX = Math.max(0, x + dx)
        w -= nextX - x
        x = nextX
      } else {
        w += dx
      }
      if (handle === 'nw' || handle === 'ne') {
        const nextY = Math.max(0, y + dy)
        h -= nextY - y
        y = nextY
      } else {
        h += dy
      }

      const next = clampCropRect(
        { x, y, w, h },
        { maxW: originalImg.naturalWidth, maxH: originalImg.naturalHeight }
      )
      const current = {
        x: state.cropX,
        y: state.cropY,
        w: state.cropW ?? originalImg.naturalWidth,
        h: state.cropH ?? originalImg.naturalHeight,
      }
      if (cropRectsMatch(next, current)) return
      updateParameters({ cropX: next.x, cropY: next.y, cropW: next.w, cropH: next.h })
    },
    [originalImg, state.cropH, state.cropW, state.cropX, state.cropY, updateParameters]
  )

  useEffect(() => {
    if (state.activeTab !== 'crop') {
      cropDragRef.current = null
      cropDragUndoRef.current = null
      return
    }
    window.addEventListener('mouseup', handleCropMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleCropMouseUp)
      cropDragRef.current = null
      cropDragUndoRef.current = null
    }
  }, [handleCropMouseUp, state.activeTab])

  const handleResetCrop = useCallback(() => {
    if (!originalImg) return
    updateParameters({
      cropX: 0,
      cropY: 0,
      cropW: originalImg.naturalWidth,
      cropH: originalImg.naturalHeight,
    })
  }, [originalImg, updateParameters])

  const handleCropChange = useCallback(
    (x: number, y: number, w: number, h: number) => {
      if (!originalImg) return
      const next = clampCropRect(
        { x, y, w, h },
        { maxW: originalImg.naturalWidth, maxH: originalImg.naturalHeight }
      )
      updateParameters({
        cropX: next.x,
        cropY: next.y,
        cropW: next.w,
        cropH: next.h,
      })
    },
    [originalImg, updateParameters]
  )

  // ── Export ─────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    const canvas = outputCanvasRef.current
    if (!canvas || outputError || exportInFlightRef.current) return
    exportInFlightRef.current = true
    setIsExporting(true)
    const mimeType =
      state.format === 'jpeg' ? 'image/jpeg' : state.format === 'webp' ? 'image/webp' : 'image/png'
    const ext = state.format
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, mimeType, state.quality / 100)
      })
      if (!blob) {
        setLastAction('Image export failed', 'error')
        return
      }
      const filename = buildExportFilename(fileName.replace(/\.[^.]+$/, ''), ext)
      const path = await exportFile(blob, filename)
      if (path) {
        setLastAction(
          `Saved ${ext.toUpperCase()} to "${path}" (${formatBytes(blob.size)})`,
          'success'
        )
      } else {
        setLastAction('Save cancelled', 'info')
      }
    } catch {
      setLastAction('Image export failed', 'error')
    } finally {
      exportInFlightRef.current = false
      setIsExporting(false)
    }
  }, [state.format, state.quality, fileName, outputError, setLastAction])

  const handleCopyImage = useCallback(async () => {
    const canvas = outputCanvasRef.current
    if (!canvas || outputError || exportInFlightRef.current) return
    try {
      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error('No blob'))
            return
          }
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            resolve()
          } catch (err) {
            reject(err)
          }
        }, 'image/png')
      })
      setLastAction('Copied image to clipboard', 'success')
    } catch {
      setLastAction('Clipboard write failed', 'error')
    }
  }, [outputError, setLastAction])

  useEffect(() => {
    if (!isInstanceActive) return
    return subscribeToolAction((action) => {
      if (action.type === 'open-file-dialog') void handleOpenImage()
      if (action.type === 'save-file') void handleDownload()
      if (action.type === 'copy-output') void handleCopyImage()
    })
  }, [handleCopyImage, handleDownload, handleOpenImage, isInstanceActive])

  const handleResetAll = useCallback(() => {
    if (!originalImg) return
    updateParameters({
      resizeW: null,
      resizeH: null,
      lockAspect: true,
      cropX: 0,
      cropY: 0,
      cropW: originalImg.naturalWidth,
      cropH: originalImg.naturalHeight,
      rotation: 0,
      flipX: false,
      flipY: false,
      format: 'png',
      quality: 85,
    })
    setLastAction('Reset all settings', 'info')
  }, [originalImg, updateParameters, setLastAction])

  const handleUndo = useCallback(() => {
    const previous = undoRef.current
    if (!previous) return
    undoRef.current = null
    setCanUndo(false)
    persistState(previous)
    setLastAction('Restored previous parameters', 'info')
  }, [persistState, setLastAction])

  // ── Crop box display rect (image coords → screen coords) ────────

  const cropDisplayRect =
    displayMetrics && originalImg
      ? {
          left: displayMetrics.offsetX + state.cropX * displayMetrics.displayScale,
          top: displayMetrics.offsetY + state.cropY * displayMetrics.displayScale,
          width: (state.cropW ?? originalImg.naturalWidth) * displayMetrics.displayScale,
          height: (state.cropH ?? originalImg.naturalHeight) * displayMetrics.displayScale,
        }
      : null

  const cropActive = Boolean(
    originalImg &&
    ((state.cropW ?? originalImg.naturalWidth) < originalImg.naturalWidth ||
      (state.cropH ?? originalImg.naturalHeight) < originalImg.naturalHeight)
  )

  const estimatedBytes = outputBlobSize
  const exportFilename = buildExportFilename(fileName.replace(/\.[^.]+$/, ''), state.format)

  // ── Render ─────────────────────────────────────────────────────

  return (
    <ToolLayout
      ref={toolRootRef}
      fullBleed
      toolbar={
        <>
          <Toolbar aria-label="Image actions" className="gap-3">
            {/* Primary only until an image is open. After that the tool's one primary action is
                Download, in the export panel — opening another image is a restart, not the goal. */}
            <Button
              variant={originalImg ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => void handleOpenImage()}
            >
              <UploadSimpleIcon size={14} />
              Open Image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileInputChange}
            />

            {originalImg ? (
              <>
                <span
                  className="max-w-48 truncate font-mono text-xs text-[var(--color-text-muted)]"
                  title={fileName}
                >
                  {fileName}
                </span>
                <span className="shrink-0 text-2xs text-[var(--color-text-muted)]">
                  {originalImg.naturalWidth} × {originalImg.naturalHeight}px
                </span>
                {originalFileSize > 0 && (
                  <span className="shrink-0 text-2xs text-[var(--color-text-muted)]">
                    {formatBytes(originalFileSize)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-[var(--color-text-muted)]">
                {loadMessage ?? 'Open an image or drop it on the preview'}
              </span>
            )}

            {originalImg && (
              <>
                <ToolbarSpacer />
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  aria-label="Undo last parameter change"
                  title="Undo last parameter change"
                  className="gap-1"
                >
                  <ArrowCounterClockwiseIcon size={14} />
                  Undo
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleResetAll}
                  title="Reset all settings"
                  className="gap-1"
                >
                  <ArrowCounterClockwiseIcon size={14} />
                  Reset
                </Button>
              </>
            )}
          </Toolbar>

          <div className="border-b border-[var(--color-border)]">
            <TabBar
              baseId="image-tool-sections"
              tabs={TABS}
              activeTab={state.activeTab}
              onTabChange={(id) => persistState({ activeTab: id })}
            />
          </div>
        </>
      }
    >
      <div className="flex flex-1 overflow-hidden">
        {/* Preview panel */}
        <div
          ref={previewContainerRef}
          data-testid="image-preview"
          className="relative flex flex-1 select-none items-center justify-center overflow-hidden bg-[var(--color-surface)]"
          style={{
            backgroundImage:
              'repeating-conic-gradient(var(--color-border) 0% 25%, transparent 0% 50%)',
            backgroundSize: '16px 16px',
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onMouseMove={state.activeTab === 'crop' ? handleCropMouseMove : undefined}
          // onMouseLeave is intentionally NOT wired to handleCropMouseUp: letting
          // the drag continue if the cursor briefly exits the container and
          // re-enters is more forgiving UX than silently aborting mid-drag.
          onMouseUp={state.activeTab === 'crop' ? handleCropMouseUp : undefined}
        >
          {originalImg ? (
            <>
              {/* Original image — shown in crop tab for the crop overlay UI */}
              {state.activeTab === 'crop' && (
                <img
                  src={originalImg.src}
                  alt="Original"
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              )}

              {/* Output canvas */}
              <canvas
                ref={outputCanvasRef}
                aria-label="Image result"
                className={
                  state.activeTab === 'crop'
                    ? 'pointer-events-none absolute bottom-4 right-4 z-20 max-h-40 max-w-40 border border-[var(--color-border)] bg-[var(--color-surface)] object-contain shadow-[var(--color-shadow)]'
                    : 'max-h-full max-w-full object-contain'
                }
              />

              {/* Crop selection overlay */}
              {state.activeTab === 'crop' && cropDisplayRect && (
                <>
                  {/* Dimming strips around the crop area */}
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      top: displayMetrics?.offsetY ?? 0,
                      left: displayMetrics?.offsetX ?? 0,
                      width: displayMetrics?.displayW ?? 0,
                      height: cropDisplayRect.top - (displayMetrics?.offsetY ?? 0),
                      background: 'color-mix(in srgb, var(--color-bg) 72%, transparent)',
                    }}
                  />
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      top: cropDisplayRect.top + cropDisplayRect.height,
                      left: displayMetrics?.offsetX ?? 0,
                      width: displayMetrics?.displayW ?? 0,
                      bottom: 0,
                      height:
                        (displayMetrics?.offsetY ?? 0) +
                        (displayMetrics?.displayH ?? 0) -
                        (cropDisplayRect.top + cropDisplayRect.height),
                      background: 'color-mix(in srgb, var(--color-bg) 72%, transparent)',
                    }}
                  />
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      top: cropDisplayRect.top,
                      left: displayMetrics?.offsetX ?? 0,
                      width: cropDisplayRect.left - (displayMetrics?.offsetX ?? 0),
                      height: cropDisplayRect.height,
                      background: 'color-mix(in srgb, var(--color-bg) 72%, transparent)',
                    }}
                  />
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      top: cropDisplayRect.top,
                      left: cropDisplayRect.left + cropDisplayRect.width,
                      width:
                        (displayMetrics?.offsetX ?? 0) +
                        (displayMetrics?.displayW ?? 0) -
                        (cropDisplayRect.left + cropDisplayRect.width),
                      height: cropDisplayRect.height,
                      background: 'color-mix(in srgb, var(--color-bg) 72%, transparent)',
                    }}
                  />

                  {/* Crop box + handles */}
                  <div
                    data-testid="crop-box"
                    tabIndex={0}
                    role="group"
                    aria-label="Crop selection. Use arrow keys to nudge; hold Shift for larger steps."
                    onKeyDown={handleCropKeyDown}
                    className="absolute focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    style={{
                      left: cropDisplayRect.left,
                      top: cropDisplayRect.top,
                      width: cropDisplayRect.width,
                      height: cropDisplayRect.height,
                      border: '1.5px solid var(--color-accent)',
                      boxSizing: 'border-box',
                      cursor: 'move',
                    }}
                    onMouseDown={(e) => handleCropHandleMouseDown(e, 'body')}
                  >
                    {/* Rule-of-thirds grid lines */}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage:
                          'linear-gradient(color-mix(in srgb, var(--color-accent) 35%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 35%, transparent) 1px, transparent 1px)',
                        backgroundSize: '33.33% 33.33%',
                      }}
                    />

                    {/* Corner handles */}
                    {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                      // eslint-disable-next-line no-restricted-syntax -- The crop handle needs exact size and position.
                      <button
                        key={handle}
                        type="button"
                        aria-label={CROP_HANDLE_LABELS[handle]}
                        onMouseDown={(e) => handleCropHandleMouseDown(e, handle)}
                        onKeyDown={(e) => handleCropHandleKeyDown(e, handle)}
                        className="focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                        style={{
                          position: 'absolute',
                          width: 12,
                          height: 12,
                          background: 'var(--color-bg)',
                          border:
                            '1.5px solid color-mix(in srgb, var(--color-accent) 70%, var(--color-border))',
                          boxSizing: 'border-box',
                          ...(handle === 'nw' && {
                            top: -6,
                            left: -6,
                            cursor: 'nw-resize',
                          }),
                          ...(handle === 'ne' && {
                            top: -6,
                            right: -6,
                            cursor: 'ne-resize',
                          }),
                          ...(handle === 'sw' && {
                            bottom: -6,
                            left: -6,
                            cursor: 'sw-resize',
                          }),
                          ...(handle === 'se' && {
                            bottom: -6,
                            right: -6,
                            cursor: 'se-resize',
                          }),
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            /* Drop zone placeholder */
            <div className="flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
              <ImageIcon size={52} className="opacity-20" />
              <div className="text-center">
                <div className="text-sm font-medium">Drop an image here</div>
                <div className="mt-0.5 text-2xs opacity-60">
                  JPEG · PNG · WebP · GIF · BMP · SVG
                </div>
                {loadMessage && <div className="mt-1 text-xs">{loadMessage}</div>}
              </div>
              <Button variant="secondary" size="sm" onClick={() => void handleOpenImage()}>
                Browse files
              </Button>
            </div>
          )}

          {/* Drag-over overlay */}
          {(isDragOver || isDraggingImage) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--color-surface)]/90 backdrop-blur-sm">
              <UploadSimpleIcon size={32} className="text-[var(--color-accent)]" />
              <span className="text-sm font-medium text-[var(--color-accent)]">
                Drop to open image
              </span>
            </div>
          )}
        </div>

        {/* ── Controls panel ──────────────────────────────────────── */}
        <div className="w-64 shrink-0 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <TabPanel baseId="image-tool-sections" tabId={state.activeTab}>
            <p className="mb-4 text-2xs text-[var(--color-text-muted)]">
              Order: crop, resize, rotate, flip, encode.
            </p>
            {!originalImg ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                Open an image to get started.
              </p>
            ) : state.activeTab === 'resize' ? (
              <ResizePanel
                resizeW={state.resizeW}
                resizeH={state.resizeH}
                lockAspect={state.lockAspect}
                sourceW={sourceW}
                sourceH={sourceH}
                onResizeW={handleResizeW}
                onResizeH={handleResizeH}
                onLockToggle={() => updateParameters({ lockAspect: !state.lockAspect })}
                onReset={handleResetResize}
                onPreset={handleApplyPreset}
              />
            ) : state.activeTab === 'crop' ? (
              <CropPanel
                active={cropActive}
                x={state.cropX}
                y={state.cropY}
                w={state.cropW ?? originalImg.naturalWidth}
                h={state.cropH ?? originalImg.naturalHeight}
                maxW={originalImg.naturalWidth}
                maxH={originalImg.naturalHeight}
                onChange={handleCropChange}
                onReset={handleResetCrop}
              />
            ) : state.activeTab === 'transform' ? (
              <TransformPanel
                rotation={state.rotation}
                flipX={state.flipX}
                flipY={state.flipY}
                onRotate={() =>
                  updateParameters({
                    rotation: ((state.rotation + 90) % 360) as ImageToolState['rotation'],
                  })
                }
                onFlipX={() => updateParameters({ flipX: !state.flipX })}
                onFlipY={() => updateParameters({ flipY: !state.flipY })}
                onReset={() => updateParameters({ rotation: 0, flipX: false, flipY: false })}
              />
            ) : (
              <ExportPanel
                format={state.format}
                quality={state.quality}
                outputW={outputSize?.w ?? 0}
                outputH={outputSize?.h ?? 0}
                originalBytes={originalFileSize}
                estimatedBytes={estimatedBytes}
                filename={exportFilename}
                outputError={outputError}
                isExporting={isExporting}
                onFormatChange={(f) => updateParameters({ format: f as ImageToolState['format'] })}
                onQualityChange={(q) => updateParameters({ quality: q })}
                onDownload={() => void handleDownload()}
                onCopy={() => void handleCopyImage()}
              />
            )}
          </TabPanel>
        </div>
      </div>
    </ToolLayout>
  )
}

function TransformPanel({
  rotation,
  flipX,
  flipY,
  onRotate,
  onFlipX,
  onFlipY,
  onReset,
}: {
  rotation: ImageToolState['rotation']
  flipX: boolean
  flipY: boolean
  onRotate: () => void
  onFlipX: () => void
  onFlipY: () => void
  onReset: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel as="div" className="mb-2">
          Orientation
        </SectionLabel>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm" onClick={onRotate}>
            <ArrowClockwiseIcon size={14} aria-hidden="true" />
            Rotate 90° clockwise
          </Button>
          <Button variant="secondary" size="sm" onClick={onFlipX} aria-pressed={flipX}>
            <FlipHorizontalIcon size={14} aria-hidden="true" />
            Flip horizontally
          </Button>
          <Button variant="secondary" size="sm" onClick={onFlipY} aria-pressed={flipY}>
            <FlipVerticalIcon size={14} aria-hidden="true" />
            Flip vertically
          </Button>
        </div>
      </div>
      <div className="rounded bg-[var(--color-accent)]/10 px-3 py-2 text-2xs text-[var(--color-accent)]">
        Rotation: {rotation}° · Horizontal: {flipX ? 'flipped' : 'normal'} · Vertical:{' '}
        {flipY ? 'flipped' : 'normal'}
      </div>
      <Button variant="ghost" size="xs" onClick={onReset} disabled={!rotation && !flipX && !flipY}>
        <ArrowCounterClockwiseIcon size={14} aria-hidden="true" />
        Reset orientation
      </Button>
    </div>
  )
}

// ── ResizePanel ────────────────────────────────────────────────────

function ResizePanel({
  resizeW,
  resizeH,
  lockAspect,
  sourceW,
  sourceH,
  onResizeW,
  onResizeH,
  onLockToggle,
  onReset,
  onPreset,
}: {
  resizeW: number | null
  resizeH: number | null
  lockAspect: boolean
  sourceW: number
  sourceH: number
  onResizeW: (w: number) => void
  onResizeH: (h: number) => void
  onLockToggle: () => void
  onReset: () => void
  onPreset: (w: number, h: number) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel as="div" className="mb-2">
          Dimensions
        </SectionLabel>
        <div className="flex items-center gap-2">
          <Field label="Width (px)" className="flex-1">
            <Input
              type="number"
              min={1}
              max={MAX_IMAGE_DIMENSION}
              value={resizeW ?? ''}
              onChange={(e) => onResizeW(Number(e.target.value))}
              placeholder={String(sourceW)}
              className={NUMBER_FIELD_CLASS}
            />
          </Field>

          <Button
            variant="icon"
            size="xs"
            onClick={onLockToggle}
            aria-pressed={lockAspect}
            title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            className="mt-4 shrink-0"
          >
            {lockAspect ? <LockSimpleIcon size={14} /> : <LockSimpleOpenIcon size={14} />}
          </Button>

          <Field label="Height (px)" className="flex-1">
            <Input
              type="number"
              min={1}
              max={MAX_IMAGE_DIMENSION}
              value={resizeH ?? ''}
              onChange={(e) => onResizeH(Number(e.target.value))}
              placeholder={String(sourceH)}
              className={NUMBER_FIELD_CLASS}
            />
          </Field>
        </div>

        {/* eslint-disable-next-line no-restricted-syntax -- 10px underlabel link beneath the
            dimension inputs; Button's smallest size is text-xs (12px), which would outweigh
            the fields it annotates. */}
        <button
          type="button"
          onClick={onReset}
          disabled={resizeW === null && resizeH === null}
          className="mt-2 rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] text-2xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-50"
        >
          Clear resize
        </button>
        <p className="mt-2 text-2xs text-[var(--color-text-muted)]">
          The output follows the crop when resize is empty.
        </p>
      </div>

      <div>
        <SectionLabel as="div" className="mb-2">
          Aspect Ratio Presets
        </SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_SIZES.map(({ label, w, h }) => (
            // eslint-disable-next-line no-restricted-syntax -- dense 10px preset chip grid; Button's smallest size (text-xs, px-1.5) makes the row wrap at this panel width.
            <button
              key={label}
              type="button"
              onClick={() => onPreset(w, h)}
              className="rounded border border-[var(--color-border)] px-2 py-0.5 text-2xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {resizeW && resizeH && (resizeW !== sourceW || resizeH !== sourceH) && (
        <div className="rounded bg-[var(--color-accent)]/10 px-3 py-2 text-2xs text-[var(--color-accent)]">
          Output: {resizeW} × {resizeH}px ({((resizeW * resizeH) / (sourceW * sourceH)).toFixed(2)}×
          crop pixels)
        </div>
      )}
    </div>
  )
}

// ── CropPanel ──────────────────────────────────────────────────────

function CropPanel({
  active,
  x,
  y,
  w,
  h,
  maxW,
  maxH,
  onChange,
  onReset,
}: {
  active: boolean
  x: number
  y: number
  w: number
  h: number
  maxW: number
  maxH: number
  onChange: (x: number, y: number, w: number, h: number) => void
  onReset: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Crop coordinates */}
      <div>
        <SectionLabel as="div" className="mb-2">
          Offset
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X (px)">
            <Input
              type="number"
              min={0}
              max={maxW - 1}
              value={x}
              onChange={(e) => onChange(Number(e.target.value), y, w, h)}
              className={NUMBER_FIELD_CLASS}
            />
          </Field>
          <Field label="Y (px)">
            <Input
              type="number"
              min={0}
              max={maxH - 1}
              value={y}
              onChange={(e) => onChange(x, Number(e.target.value), w, h)}
              className={NUMBER_FIELD_CLASS}
            />
          </Field>
        </div>

        <SectionLabel as="div" className="mb-2 mt-3">
          Size
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width (px)">
            <Input
              type="number"
              min={1}
              max={maxW}
              value={w}
              onChange={(e) => onChange(x, y, Number(e.target.value), h)}
              className={NUMBER_FIELD_CLASS}
            />
          </Field>
          <Field label="Height (px)">
            <Input
              type="number"
              min={1}
              max={maxH}
              value={h}
              onChange={(e) => onChange(x, y, w, Number(e.target.value))}
              className={NUMBER_FIELD_CLASS}
            />
          </Field>
        </div>

        {/* eslint-disable-next-line no-restricted-syntax -- 10px underlabel link beneath the
            crop inputs; Button's smallest size is text-xs (12px), which would outweigh the
            fields it annotates. */}
        <button
          type="button"
          onClick={onReset}
          disabled={!active}
          className="mt-3 rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] text-2xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-50"
        >
          Reset to full image
        </button>
      </div>

      {active && (
        <div className="rounded bg-[var(--color-accent)]/10 px-3 py-2 text-2xs text-[var(--color-accent)]">
          Crop: {w} × {h}px at ({x}, {y})
        </div>
      )}

      <p className="text-2xs text-[var(--color-text-muted)]">
        Drag the crop box or its corners in the preview to adjust visually.
      </p>
    </div>
  )
}

// ── ExportPanel ────────────────────────────────────────────────────

function ExportPanel({
  format,
  quality,
  outputW,
  outputH,
  originalBytes,
  estimatedBytes,
  filename,
  outputError,
  isExporting,
  onFormatChange,
  onQualityChange,
  onDownload,
  onCopy,
}: {
  format: string
  quality: number
  outputW: number
  outputH: number
  originalBytes: number
  estimatedBytes: number
  filename: string
  outputError: string | null
  isExporting: boolean
  onFormatChange: (f: string) => void
  onQualityChange: (q: number) => void
  onDownload: () => void
  onCopy: () => void
}) {
  const isLossy = format === 'jpeg' || format === 'webp'
  const compressionRatio =
    originalBytes > 0 && estimatedBytes > 0
      ? ((1 - estimatedBytes / originalBytes) * 100).toFixed(0)
      : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel as="div" className="mb-2">
          Format
        </SectionLabel>
        <TabBar tabs={FORMAT_TABS} activeTab={format} onTabChange={onFormatChange} />
        <div className="mt-1.5 text-2xs text-[var(--color-text-muted)]">
          {format === 'png' && 'Lossless · Supports transparency'}
          {format === 'jpeg' && 'Lossy · Best for photos · White replaces transparency'}
          {format === 'webp' && 'Lossy · Modern · Small file size'}
        </div>
      </div>

      {isLossy && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel as="div">Quality</SectionLabel>
            <span className="text-xs tabular-nums text-[var(--color-text)]">{quality}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={quality}
            aria-label="Image quality"
            aria-valuetext={`${quality}%`}
            onChange={(e) => onQualityChange(Number(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
          <div className="mt-1 flex justify-between text-2xs text-[var(--color-text-muted)]">
            <span>Smaller</span>
            <span>Higher quality</span>
          </div>
        </div>
      )}

      <div>
        <SectionLabel as="div" className="mb-2">
          Output Info
        </SectionLabel>
        <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
          <div>
            Filename: <span className="font-mono text-[var(--color-text)]">{filename}</span>
          </div>
          <div>
            Dimensions:{' '}
            <span className="font-mono text-[var(--color-text)]">
              {outputW} × {outputH}px
            </span>
          </div>
          <div>
            Size:{' '}
            <span className="font-mono text-[var(--color-text)]">
              {formatBytes(estimatedBytes)}
            </span>
          </div>
          {originalBytes > 0 && compressionRatio !== null && Number(compressionRatio) > 0 && (
            <div>
              Savings:{' '}
              <span className="font-mono text-[var(--color-success)]">{compressionRatio}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {outputError && (
          <p id="image-export-disabled-reason" className="text-2xs text-[var(--color-error)]">
            Export is disabled. {outputError}.
          </p>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            void onDownload()
          }}
          loading={isExporting}
          disabled={outputError !== null}
          aria-describedby={outputError ? 'image-export-disabled-reason' : undefined}
        >
          <DownloadSimpleIcon size={14} />
          Download {format.toUpperCase()}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void onCopy()
          }}
          disabled={outputError !== null || isExporting}
          aria-describedby={outputError ? 'image-export-disabled-reason' : undefined}
        >
          <CopyIcon size={14} />
          Copy as PNG
        </Button>
      </div>
    </div>
  )
}
