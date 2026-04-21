import { useCallback, useEffect, useRef, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { TabBar } from '@/components/shared/TabBar'
import {
  ImageIcon,
  UploadSimpleIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  ArrowCounterClockwiseIcon,
  DownloadSimpleIcon,
  CopyIcon,
} from '@phosphor-icons/react'

// ── Types ──────────────────────────────────────────────────────────

type ImageToolState = {
  activeTab: string
  // Resize
  resizeW: number | null
  resizeH: number | null
  lockAspect: boolean
  // Crop
  cropEnabled: boolean
  cropX: number
  cropY: number
  cropW: number | null
  cropH: number | null
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

// ── Constants ──────────────────────────────────────────────────────

const TABS = [
  { id: 'resize', label: 'Resize' },
  { id: 'crop', label: 'Crop' },
  { id: 'export', label: 'Export' },
]

const FORMAT_TABS = [
  { id: 'png', label: 'PNG' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'webp', label: 'WebP' },
]

const PRESET_SIZES = [
  { label: '1:1', w: 1, h: 1 },
  { label: '16:9', w: 16, h: 9 },
  { label: '4:3', w: 4, h: 3 },
  { label: '3:2', w: 3, h: 2 },
]

// ── Helpers ────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// Estimate compressed file size from data URL length
function estimateSizeFromDataUrl(dataUrl: string): number {
  // data URL is base64 encoded; each 4 chars ≈ 3 bytes
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.round((base64.length * 3) / 4)
}

// ── Component ──────────────────────────────────────────────────────

export default function ImageTool() {
  const [state, updateState] = useToolState<ImageToolState>('image-tool', {
    activeTab: 'resize',
    resizeW: null,
    resizeH: null,
    lockAspect: true,
    cropEnabled: false,
    cropX: 0,
    cropY: 0,
    cropW: null,
    cropH: null,
    format: 'png',
    quality: 85,
  })

  const setLastAction = useUiStore((s) => s.setLastAction)

  // ── Local state ────────────────────────────────────────────────

  const [originalImg, setOriginalImg] = useState<HTMLImageElement | null>(null)
  const [originalFileSize, setOriginalFileSize] = useState<number>(0)
  const [fileName, setFileName] = useState<string>('image')
  const [isDragOver, setIsDragOver] = useState(false)
  const [displayMetrics, setDisplayMetrics] = useState<DisplayMetrics | null>(null)
  const [outputDataUrl, setOutputDataUrl] = useState<string | null>(null)
  const [outputSize, setOutputSize] = useState<{ w: number; h: number } | null>(null)

  // ── Refs ────────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const outputCanvasRef = useRef<HTMLCanvasElement>(null)
  const cropDragRef = useRef<CropDragState | null>(null)

  // ── Image loading ──────────────────────────────────────────────

  const loadImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setLastAction('File is not an image', 'error')
        return
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        const src = e.target?.result as string
        const img = new Image()
        img.onload = () => {
          // Reset display metrics before setting the new image so one stale render
          // of the crop overlay with the previous image's metrics doesn't occur.
          setDisplayMetrics(null)
          setOriginalImg(img)
          setFileName(file.name)
          setOriginalFileSize(file.size)
          updateState({
            resizeW: img.naturalWidth,
            resizeH: img.naturalHeight,
            cropX: 0,
            cropY: 0,
            cropW: img.naturalWidth,
            cropH: img.naturalHeight,
            cropEnabled: false,
          })
          setLastAction(`Opened "${file.name}"`, 'success')
        }
        img.onerror = () => setLastAction('Failed to load image', 'error')
        img.src = src
      }
      reader.readAsDataURL(file)
    },
    [updateState, setLastAction]
  )

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

    const srcX = state.cropEnabled ? state.cropX : 0
    const srcY = state.cropEnabled ? state.cropY : 0
    const srcW = state.cropEnabled
      ? (state.cropW ?? originalImg.naturalWidth)
      : originalImg.naturalWidth
    const srcH = state.cropEnabled
      ? (state.cropH ?? originalImg.naturalHeight)
      : originalImg.naturalHeight

    const outW = Math.max(1, state.resizeW ?? srcW)
    const outH = Math.max(1, state.resizeH ?? srcH)

    canvas.width = outW
    canvas.height = outH
    ctx.clearRect(0, 0, outW, outH)
    ctx.drawImage(originalImg, srcX, srcY, srcW, srcH, 0, 0, outW, outH)

    setOutputSize({ w: outW, h: outH })

    const mimeType =
      state.format === 'jpeg' ? 'image/jpeg' : state.format === 'webp' ? 'image/webp' : 'image/png'
    setOutputDataUrl(canvas.toDataURL(mimeType, state.quality / 100))
  }, [originalImg, state])

  // ── Resize helpers ─────────────────────────────────────────────

  const sourceW = state.cropEnabled
    ? (state.cropW ?? originalImg?.naturalWidth ?? 0)
    : (originalImg?.naturalWidth ?? 0)
  const sourceH = state.cropEnabled
    ? (state.cropH ?? originalImg?.naturalHeight ?? 0)
    : (originalImg?.naturalHeight ?? 0)
  const aspect = sourceW > 0 && sourceH > 0 ? sourceW / sourceH : 1

  const handleResizeW = useCallback(
    (w: number) => {
      if (!w || w < 1) return
      if (state.lockAspect) {
        updateState({ resizeW: w, resizeH: Math.max(1, Math.round(w / aspect)) })
      } else {
        updateState({ resizeW: w })
      }
    },
    [state.lockAspect, aspect, updateState]
  )

  const handleResizeH = useCallback(
    (h: number) => {
      if (!h || h < 1) return
      if (state.lockAspect) {
        updateState({ resizeH: h, resizeW: Math.max(1, Math.round(h * aspect)) })
      } else {
        updateState({ resizeH: h })
      }
    },
    [state.lockAspect, aspect, updateState]
  )

  const handleResetResize = useCallback(() => {
    if (!originalImg) return
    updateState({ resizeW: originalImg.naturalWidth, resizeH: originalImg.naturalHeight })
  }, [originalImg, updateState])

  const handleApplyPreset = useCallback(
    (pw: number, ph: number) => {
      if (!originalImg) return
      const baseW = originalImg.naturalWidth
      // Fit the preset ratio within the original dimensions
      const targetAspect = pw / ph
      let w = baseW
      let h = Math.round(baseW / targetAspect)
      if (h > originalImg.naturalHeight) {
        h = originalImg.naturalHeight
        w = Math.round(h * targetAspect)
      }
      updateState({ resizeW: w, resizeH: h })
    },
    [originalImg, updateState]
  )

  // ── Crop interaction ────────────────────────────────────────────

  const handleCropHandleMouseDown = useCallback(
    (e: React.MouseEvent, handle: CropHandle) => {
      e.preventDefault()
      e.stopPropagation()
      if (!displayMetrics || !originalImg) return
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
    [displayMetrics, originalImg, state.cropX, state.cropY, state.cropW, state.cropH]
  )

  const handleCropMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const drag = cropDragRef.current
      if (!drag) return
      const { displayScale, origW, origH } = drag
      const dx = (e.clientX - drag.startMouseX) / displayScale
      const dy = (e.clientY - drag.startMouseY) / displayScale

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

      // Clamp dimensions first, then positions — ordering matters because
      // the position clamp uses the (now correct) clamped w/h values.
      w = Math.max(1, Math.min(w, origW))
      h = Math.max(1, Math.min(h, origH))
      x = Math.max(0, Math.min(x, origW - w))
      y = Math.max(0, Math.min(y, origH - h))

      updateState({
        cropX: Math.round(x),
        cropY: Math.round(y),
        cropW: Math.round(w),
        cropH: Math.round(h),
      })
    },
    [updateState]
  )

  const handleCropMouseUp = useCallback(() => {
    cropDragRef.current = null
  }, [])

  useEffect(() => {
    if (state.activeTab !== 'crop') {
      cropDragRef.current = null
      return
    }
    window.addEventListener('mouseup', handleCropMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleCropMouseUp)
      cropDragRef.current = null
    }
  }, [handleCropMouseUp, state.activeTab])

  const handleResetCrop = useCallback(() => {
    if (!originalImg) return
    updateState({
      cropX: 0,
      cropY: 0,
      cropW: originalImg.naturalWidth,
      cropH: originalImg.naturalHeight,
    })
  }, [originalImg, updateState])

  // ── Export ─────────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    const canvas = outputCanvasRef.current
    if (!canvas) return
    const mimeType =
      state.format === 'jpeg' ? 'image/jpeg' : state.format === 'webp' ? 'image/webp' : 'image/png'
    const ext = state.format
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${fileName.replace(/\.[^.]+$/, '')}.${ext}`
        a.click()
        URL.revokeObjectURL(url)
        setLastAction(`Saved as ${ext.toUpperCase()} (${formatBytes(blob.size)})`, 'success')
      },
      mimeType,
      state.quality / 100
    )
  }, [state.format, state.quality, fileName, setLastAction])

  const handleCopyImage = useCallback(async () => {
    const canvas = outputCanvasRef.current
    if (!canvas) return
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
  }, [setLastAction])

  const handleResetAll = useCallback(() => {
    if (!originalImg) return
    updateState({
      resizeW: originalImg.naturalWidth,
      resizeH: originalImg.naturalHeight,
      lockAspect: true,
      cropEnabled: false,
      cropX: 0,
      cropY: 0,
      cropW: originalImg.naturalWidth,
      cropH: originalImg.naturalHeight,
      format: 'png',
      quality: 85,
    })
    setLastAction('Reset all settings', 'info')
  }, [originalImg, updateState, setLastAction])

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

  const estimatedBytes = outputDataUrl ? estimateSizeFromDataUrl(outputDataUrl) : 0

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
          <UploadSimpleIcon size={13} />
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
            <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
              {originalImg.naturalWidth} × {originalImg.naturalHeight}px
            </span>
            {originalFileSize > 0 && (
              <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                {formatBytes(originalFileSize)}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">
            Open an image or drop it anywhere
          </span>
        )}

        {originalImg && (
          <button
            onClick={handleResetAll}
            title="Reset all settings"
            className="ml-auto flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <ArrowCounterClockwiseIcon size={13} />
            Reset
          </button>
        )}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div className="border-b border-[var(--color-border)]">
        <TabBar
          tabs={TABS}
          activeTab={state.activeTab}
          onTabChange={(id) => updateState({ activeTab: id })}
        />
      </div>

      {/* ── Main body ────────────────────────────────────────────── */}
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

              {/* Output canvas — always rendered; visible only outside crop tab */}
              <canvas
                ref={outputCanvasRef}
                className={`max-h-full max-w-full object-contain ${state.activeTab === 'crop' ? 'hidden' : ''}`}
              />

              {/* Crop selection overlay */}
              {state.activeTab === 'crop' && state.cropEnabled && cropDisplayRect && (
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
                    className="absolute"
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
                      <div
                        key={handle}
                        onMouseDown={(e) => handleCropHandleMouseDown(e, handle)}
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
                <div className="mt-0.5 text-[10px] opacity-60">
                  JPEG · PNG · WebP · GIF · BMP · SVG
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                Browse files
              </Button>
            </div>
          )}

          {/* Drag-over overlay */}
          {isDragOver && (
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
          {!originalImg ? (
            <p className="text-xs text-[var(--color-text-muted)]">Open an image to get started.</p>
          ) : state.activeTab === 'resize' ? (
            <ResizePanel
              resizeW={state.resizeW}
              resizeH={state.resizeH}
              lockAspect={state.lockAspect}
              originalW={originalImg.naturalWidth}
              originalH={originalImg.naturalHeight}
              onResizeW={handleResizeW}
              onResizeH={handleResizeH}
              onLockToggle={() => updateState({ lockAspect: !state.lockAspect })}
              onReset={handleResetResize}
              onPreset={handleApplyPreset}
            />
          ) : state.activeTab === 'crop' ? (
            <CropPanel
              enabled={state.cropEnabled}
              x={state.cropX}
              y={state.cropY}
              w={state.cropW ?? originalImg.naturalWidth}
              h={state.cropH ?? originalImg.naturalHeight}
              maxW={originalImg.naturalWidth}
              maxH={originalImg.naturalHeight}
              onToggle={() => updateState({ cropEnabled: !state.cropEnabled })}
              onChange={(x, y, w, h) => updateState({ cropX: x, cropY: y, cropW: w, cropH: h })}
              onReset={handleResetCrop}
            />
          ) : (
            <ExportPanel
              format={state.format}
              quality={state.quality}
              outputW={outputSize?.w ?? 0}
              outputH={outputSize?.h ?? 0}
              originalBytes={originalFileSize}
              estimatedBytes={estimatedBytes}
              onFormatChange={(f) => updateState({ format: f as ImageToolState['format'] })}
              onQualityChange={(q) => updateState({ quality: q })}
              onDownload={handleDownload}
              onCopy={handleCopyImage}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── ResizePanel ────────────────────────────────────────────────────

function ResizePanel({
  resizeW,
  resizeH,
  lockAspect,
  originalW,
  originalH,
  onResizeW,
  onResizeH,
  onLockToggle,
  onReset,
  onPreset,
}: {
  resizeW: number | null
  resizeH: number | null
  lockAspect: boolean
  originalW: number
  originalH: number
  onResizeW: (w: number) => void
  onResizeH: (h: number) => void
  onLockToggle: () => void
  onReset: () => void
  onPreset: (w: number, h: number) => void
}) {
  const inputClass =
    'w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-mono text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Dimensions
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[10px] text-[var(--color-text-muted)]">Width (px)</label>
            <input
              type="number"
              min={1}
              value={resizeW ?? ''}
              onChange={(e) => onResizeW(Number(e.target.value))}
              placeholder="Width"
              className={inputClass}
            />
          </div>

          <button
            onClick={onLockToggle}
            title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            className="mt-4 shrink-0 rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent)]"
          >
            {lockAspect ? <LockSimpleIcon size={14} /> : <LockSimpleOpenIcon size={14} />}
          </button>

          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[10px] text-[var(--color-text-muted)]">Height (px)</label>
            <input
              type="number"
              min={1}
              value={resizeH ?? ''}
              onChange={(e) => onResizeH(Number(e.target.value))}
              placeholder="Height"
              className={inputClass}
            />
          </div>
        </div>

        <button
          onClick={onReset}
          className="mt-2 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          Reset to original ({originalW} × {originalH})
        </button>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Aspect Ratio Presets
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_SIZES.map(({ label, w, h }) => (
            <button
              key={label}
              onClick={() => onPreset(w, h)}
              className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {resizeW && resizeH && (resizeW !== originalW || resizeH !== originalH) && (
        <div className="rounded bg-[var(--color-accent)]/10 px-3 py-2 text-[10px] text-[var(--color-accent)]">
          Output: {resizeW} × {resizeH}px (
          {((resizeW * resizeH) / (originalW * originalH)).toFixed(2)}× pixels)
        </div>
      )}
    </div>
  )
}

// ── CropPanel ──────────────────────────────────────────────────────

function CropPanel({
  enabled,
  x,
  y,
  w,
  h,
  maxW,
  maxH,
  onToggle,
  onChange,
  onReset,
}: {
  enabled: boolean
  x: number
  y: number
  w: number
  h: number
  maxW: number
  maxH: number
  onToggle: () => void
  onChange: (x: number, y: number, w: number, h: number) => void
  onReset: () => void
}) {
  const inputClass =
    'w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-mono text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] disabled:opacity-40'

  return (
    <div className="flex flex-col gap-4">
      {/* Enable toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={enabled}
          aria-label={enabled ? 'Disable crop' : 'Enable crop'}
          className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`}
        >
          <div
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-bg)] shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
          />
        </button>
        <span className="text-xs text-[var(--color-text)]">Enable crop</span>
      </div>

      {/* Crop coordinates */}
      <div className={enabled ? '' : 'pointer-events-none opacity-40'}>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Offset
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--color-text-muted)]">X (px)</label>
            <input
              type="number"
              min={0}
              max={maxW - 1}
              value={x}
              disabled={!enabled}
              onChange={(e) => onChange(Number(e.target.value), y, w, h)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--color-text-muted)]">Y (px)</label>
            <input
              type="number"
              min={0}
              max={maxH - 1}
              value={y}
              disabled={!enabled}
              onChange={(e) => onChange(x, Number(e.target.value), w, h)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Size
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--color-text-muted)]">Width (px)</label>
            <input
              type="number"
              min={1}
              max={maxW}
              value={w}
              disabled={!enabled}
              onChange={(e) => onChange(x, y, Number(e.target.value), h)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--color-text-muted)]">Height (px)</label>
            <input
              type="number"
              min={1}
              max={maxH}
              value={h}
              disabled={!enabled}
              onChange={(e) => onChange(x, y, w, Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>

        <button
          onClick={onReset}
          disabled={!enabled}
          className="mt-3 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:pointer-events-none"
        >
          Reset to full image
        </button>
      </div>

      {enabled && (
        <div className="rounded bg-[var(--color-accent)]/10 px-3 py-2 text-[10px] text-[var(--color-accent)]">
          Crop: {w} × {h}px at ({x}, {y})
        </div>
      )}

      <p className="text-[10px] text-[var(--color-text-muted)]">
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
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Format
        </div>
        <TabBar tabs={FORMAT_TABS} activeTab={format} onTabChange={onFormatChange} />
        <div className="mt-1.5 text-[10px] text-[var(--color-text-muted)]">
          {format === 'png' && 'Lossless · Supports transparency'}
          {format === 'jpeg' && 'Lossy · Best for photos · No transparency'}
          {format === 'webp' && 'Lossy/lossless · Modern · Smallest size'}
        </div>
      </div>

      {isLossy && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Quality
            </div>
            <span className="font-mono text-xs text-[var(--color-text)]">{quality}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={quality}
            onChange={(e) => onQualityChange(Number(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
          <div className="mt-1 flex justify-between text-[9px] text-[var(--color-text-muted)]">
            <span>Smaller</span>
            <span>Higher quality</span>
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Output Info
        </div>
        <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
          <div>
            Dimensions:{' '}
            <span className="font-mono text-[var(--color-text)]">
              {outputW} × {outputH}px
            </span>
          </div>
          <div>
            Est. size:{' '}
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
        <Button variant="primary" size="sm" onClick={onDownload}>
          <DownloadSimpleIcon size={13} />
          Download {format.toUpperCase()}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCopy}>
          <CopyIcon size={13} />
          Copy as PNG
        </Button>
      </div>
    </div>
  )
}
