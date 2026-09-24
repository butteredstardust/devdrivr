import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsInstanceActive } from '@/app/tool-instance'
import { useFrameThrottle } from '@/hooks/useFrameThrottle'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolState } from '@/hooks/useToolState'
import { buildExportFilename } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'
import { ImageToolView } from '@/tools/image-tool/components/ImageToolView'
import { useImageExport } from '@/tools/image-tool/hooks/useImageExport'
import { useImageLoading } from '@/tools/image-tool/hooks/useImageLoading'
import {
  clampCropRect,
  cropRectsMatch,
  getImageParameters,
  type CropDragState,
  type CropHandle,
  type DisplayMetrics,
  type ImageParameters,
  type ImageToolState,
} from '@/tools/image-tool/image-tool-model'

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

  const [displayMetrics, setDisplayMetrics] = useState<DisplayMetrics | null>(null)
  const [outputBlobSize, setOutputBlobSize] = useState(0)
  const [outputSize, setOutputSize] = useState<{ w: number; h: number } | null>(null)
  const [outputError, setOutputError] = useState<string | null>('Output is not ready')
  const [isExporting, setIsExporting] = useState(false)

  // ── Refs ────────────────────────────────────────────────────────

  const cropDragRef = useRef<CropDragState | null>(null)
  const cropDragUndoRef = useRef<ImageParameters | null>(null)
  const undoRef = useRef<ImageParameters | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  const updateParameters = useCallback(
    (patch: Partial<ImageParameters>) => {
      undoRef.current = getImageParameters(state)
      setCanUndo(true)
      persistState(patch)
    },
    [persistState, state]
  )

  const handleImageLoaded = useCallback(() => {
    setDisplayMetrics(null)
    setOutputError('Output is not ready')
    undoRef.current = null
    setCanUndo(false)
  }, [])

  const {
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
  } = useImageLoading({ state, persistState, isInstanceActive, onImageLoaded: handleImageLoaded })

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
  }, [originalImg, previewContainerRef])

  const { outputCanvasRef, handleDownload, handleCopyImage } = useImageExport({
    state,
    originalImg,
    fileName,
    outputError,
    setOutputBlobSize,
    setOutputSize,
    setOutputError,
    setIsExporting,
  })

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

  useToolAction((action) => {
    if (action.type === 'open-file-dialog') void handleOpenImage()
    if (action.type === 'save-file') void handleDownload()
    if (action.type === 'copy-output') void handleCopyImage()
  })

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
    <ImageToolView
      toolRootRef={toolRootRef}
      originalImg={originalImg}
      handleOpenImage={handleOpenImage}
      fileInputRef={fileInputRef}
      handleFileInputChange={handleFileInputChange}
      fileName={fileName}
      canUndo={canUndo}
      handleUndo={handleUndo}
      handleResetAll={handleResetAll}
      state={state}
      persistState={persistState}
      previewContainerRef={previewContainerRef}
      handleDragOver={handleDragOver}
      handleDragLeave={handleDragLeave}
      handleDrop={handleDrop}
      outputCanvasRef={outputCanvasRef}
      isDragOver={isDragOver}
      isDraggingImage={isDraggingImage}
      displayMetrics={displayMetrics}
      cropDisplayRect={cropDisplayRect}
      handleCropMouseMove={handleCropMouseMove}
      handleCropMouseUp={handleCropMouseUp}
      handleCropKeyDown={handleCropKeyDown}
      handleCropHandleMouseDown={handleCropHandleMouseDown}
      handleCropHandleKeyDown={handleCropHandleKeyDown}
      loadMessage={loadMessage}
      sourceW={sourceW}
      sourceH={sourceH}
      handleResizeW={handleResizeW}
      handleResizeH={handleResizeH}
      updateParameters={updateParameters}
      handleResetResize={handleResetResize}
      handleApplyPreset={handleApplyPreset}
      cropActive={cropActive}
      handleCropChange={handleCropChange}
      handleResetCrop={handleResetCrop}
      outputSize={outputSize}
      originalFileSize={originalFileSize}
      estimatedBytes={estimatedBytes}
      exportFilename={exportFilename}
      outputError={outputError}
      isExporting={isExporting}
      handleDownload={handleDownload}
      handleCopyImage={handleCopyImage}
    />
  )
}
