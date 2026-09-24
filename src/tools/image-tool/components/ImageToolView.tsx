import type { ChangeEvent, DragEvent, KeyboardEvent, MouseEvent, RefObject } from 'react'
import { Button } from '@/components/shared/Button'
import { TabBar, TabPanel } from '@/components/shared/TabBar'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Toolbar, ToolbarSpacer } from '@/components/shared/Toolbar'
import { formatBytes } from '@/lib/format'
import {
  CropPanel,
  ExportPanel,
  ResizePanel,
  TransformPanel,
} from '@/tools/image-tool/components/ImageControls'
import {
  CROP_HANDLE_LABELS,
  TABS,
  type CropHandle,
  type DisplayMetrics,
  type ImageParameters,
  type ImageToolState,
  type LoadedImage,
} from '@/tools/image-tool/image-tool-model'
import { ArrowCounterClockwiseIcon, ImageIcon, UploadSimpleIcon } from '@phosphor-icons/react'

type CropDisplayRect = {
  left: number
  top: number
  width: number
  height: number
}

type ImageToolViewProps = {
  toolRootRef: RefObject<HTMLDivElement | null>
  originalImg: LoadedImage | null
  handleOpenImage: () => Promise<void>
  fileInputRef: RefObject<HTMLInputElement | null>
  handleFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  fileName: string
  canUndo: boolean
  handleUndo: () => void
  handleResetAll: () => void
  state: ImageToolState
  persistState: (patch: Partial<ImageToolState>) => void
  previewContainerRef: RefObject<HTMLDivElement | null>
  handleDragOver: (event: DragEvent) => void
  handleDragLeave: () => void
  handleDrop: (event: DragEvent) => void
  outputCanvasRef: RefObject<HTMLCanvasElement | null>
  isDragOver: boolean
  isDraggingImage: boolean
  displayMetrics: DisplayMetrics | null
  cropDisplayRect: CropDisplayRect | null
  handleCropMouseMove: (event: MouseEvent) => void
  handleCropMouseUp: () => void
  handleCropKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  handleCropHandleMouseDown: (event: MouseEvent, handle: CropHandle) => void
  handleCropHandleKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    handle: Exclude<CropHandle, 'body'>
  ) => void
  loadMessage: string | null
  sourceW: number
  sourceH: number
  handleResizeW: (width: number) => void
  handleResizeH: (height: number) => void
  updateParameters: (patch: Partial<ImageParameters>) => void
  handleResetResize: () => void
  handleApplyPreset: (width: number, height: number) => void
  cropActive: boolean
  handleCropChange: (x: number, y: number, width: number, height: number) => void
  handleResetCrop: () => void
  outputSize: { w: number; h: number } | null
  originalFileSize: number
  estimatedBytes: number
  exportFilename: string
  outputError: string | null
  isExporting: boolean
  handleDownload: () => Promise<void>
  handleCopyImage: () => Promise<void>
}

export function ImageToolView({
  toolRootRef,
  originalImg,
  handleOpenImage,
  fileInputRef,
  handleFileInputChange,
  fileName,
  canUndo,
  handleUndo,
  handleResetAll,
  state,
  persistState,
  previewContainerRef,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  outputCanvasRef,
  isDragOver,
  isDraggingImage,
  displayMetrics,
  cropDisplayRect,
  handleCropMouseMove,
  handleCropMouseUp,
  handleCropKeyDown,
  handleCropHandleMouseDown,
  handleCropHandleKeyDown,
  loadMessage,
  sourceW,
  sourceH,
  handleResizeW,
  handleResizeH,
  updateParameters,
  handleResetResize,
  handleApplyPreset,
  cropActive,
  handleCropChange,
  handleResetCrop,
  outputSize,
  originalFileSize,
  estimatedBytes,
  exportFilename,
  outputError,
  isExporting,
  handleDownload,
  handleCopyImage,
}: ImageToolViewProps) {
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
