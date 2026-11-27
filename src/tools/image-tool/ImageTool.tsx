import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsInstanceActive } from '@/app/tool-instance'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolState } from '@/hooks/useToolState'
import { buildExportFilename } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'
import { ImageToolView } from '@/tools/image-tool/components/ImageToolView'
import { useCropInteraction } from '@/tools/image-tool/hooks/useCropInteraction'
import { useImageExport } from '@/tools/image-tool/hooks/useImageExport'
import { useImageLoading } from '@/tools/image-tool/hooks/useImageLoading'
import {
  getImageParameters,
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

  const undoRef = useRef<ImageParameters | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  const recordUndo = useCallback((snapshot: ImageParameters) => {
    undoRef.current = snapshot
    setCanUndo(true)
  }, [])

  const updateParameters = useCallback(
    (patch: Partial<ImageParameters>) => {
      recordUndo(getImageParameters(state))
      persistState(patch)
    },
    [persistState, recordUndo, state]
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

  const {
    handleCropHandleMouseDown,
    handleCropMouseMove,
    handleCropMouseUp,
    handleCropKeyDown,
    handleCropHandleKeyDown,
    handleResetCrop,
    handleCropChange,
  } = useCropInteraction({
    state,
    displayMetrics,
    originalImg,
    persistState,
    updateParameters,
    recordUndo,
  })

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
