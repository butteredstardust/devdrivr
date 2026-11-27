import {
  JPEG_BACKGROUND,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  type ImageToolState,
  type LoadedImage,
} from '@/tools/image-tool/image-tool-model'

type RenderParameters = Pick<
  ImageToolState,
  | 'cropX'
  | 'cropY'
  | 'cropW'
  | 'cropH'
  | 'resizeW'
  | 'resizeH'
  | 'rotation'
  | 'flipX'
  | 'flipY'
  | 'format'
>

export function renderImage(
  canvas: HTMLCanvasElement,
  originalImg: LoadedImage,
  state: RenderParameters
): { w: number; h: number } | { error: string } | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

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
    return { error: reason }
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
  return { w: outW, h: outH }
}
