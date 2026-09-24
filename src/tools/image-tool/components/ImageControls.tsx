import { Button } from '@/components/shared/Button'
import { Field } from '@/components/shared/Field'
import { Input } from '@/components/shared/Input'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TabBar } from '@/components/shared/TabBar'
import { formatBytes } from '@/lib/format'
import {
  FORMAT_TABS,
  MAX_IMAGE_DIMENSION,
  NUMBER_FIELD_CLASS,
  PRESET_SIZES,
  type ImageToolState,
} from '@/tools/image-tool/image-tool-model'
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
} from '@phosphor-icons/react'

export function TransformPanel({
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

export function ResizePanel({
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

export function CropPanel({
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

export function ExportPanel({
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
