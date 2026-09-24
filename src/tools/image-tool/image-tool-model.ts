// ── Types ──────────────────────────────────────────────────────────

export type ImageToolState = {
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

export type DisplayMetrics = {
  displayScale: number
  displayW: number
  displayH: number
  offsetX: number
  offsetY: number
}

export type CropHandle = 'nw' | 'ne' | 'sw' | 'se' | 'body'

export type CropDragState = {
  handle: CropHandle
  startMouseX: number
  startMouseY: number
  startCrop: { x: number; y: number; w: number; h: number }
  displayScale: number
  origW: number
  origH: number
}

export type LoadedImage = {
  drawable: CanvasImageSource
  naturalWidth: number
  naturalHeight: number
  src: string
}

// ── Constants ──────────────────────────────────────────────────────

export const TABS = [
  { id: 'resize', label: 'Resize' },
  { id: 'crop', label: 'Crop' },
  { id: 'transform', label: 'Rotate & Flip' },
  { id: 'export', label: 'Export' },
]

export const FORMAT_TABS = [
  { id: 'png', label: 'PNG' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'webp', label: 'WebP' },
]

export const MAX_IMAGE_FILE_BYTES = 50 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 16_384
export const MAX_IMAGE_PIXELS = 64_000_000
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])
// JPEG has no alpha channel. Transparent pixels take this colour on export.
export const JPEG_BACKGROUND = '#ffffff'

// The resize/crop dimension fields. `Input` owns the border, background, radius
// and focus ring; only the monospace digits and the full-width fill are local.
export const NUMBER_FIELD_CLASS = 'w-full py-1 font-mono'

export const PRESET_SIZES = [
  { label: '1:1', w: 1, h: 1 },
  { label: '16:9', w: 16, h: 9 },
  { label: '4:3', w: 4, h: 3 },
  { label: '3:2', w: 3, h: 2 },
]

export const CROP_HANDLE_LABELS = {
  nw: 'Northwest crop handle',
  ne: 'Northeast crop handle',
  sw: 'Southwest crop handle',
  se: 'Southeast crop handle',
} as const

// ── Helpers ────────────────────────────────────────────────────────

export type CropRect = {
  x: number
  y: number
  w: number
  h: number
}

export type ImageParameters = Omit<ImageToolState, 'activeTab' | 'sourcePath'>

export function getImageParameters(state: ImageToolState): ImageParameters {
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

export function cropRectsMatch(first: CropRect, second: CropRect): boolean {
  return (
    first.x === second.x && first.y === second.y && first.w === second.w && first.h === second.h
  )
}

function hasSupportedImageExtension(name: string): boolean {
  const extension = name.split('.').pop()?.toLowerCase()
  return extension !== undefined && IMAGE_EXTENSIONS.has(extension)
}

export function isSupportedImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const typeNeedsExtension = file.type === '' || file.type === 'application/octet-stream'
  return typeNeedsExtension && hasSupportedImageExtension(file.name)
}
