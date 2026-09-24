import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { buildExportFilename, exportFile } from '@/lib/file-io'
import { formatBytes } from '@/lib/format'
import { useUiStore } from '@/stores/ui.store'
import {
  JPEG_BACKGROUND,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  type ImageToolState,
  type LoadedImage,
} from '@/tools/image-tool/image-tool-model'

type UseImageExportOptions = {
  state: ImageToolState
  originalImg: LoadedImage | null
  fileName: string
  outputError: string | null
  setOutputBlobSize: Dispatch<SetStateAction<number>>
  setOutputSize: Dispatch<SetStateAction<{ w: number; h: number } | null>>
  setOutputError: Dispatch<SetStateAction<string | null>>
  setIsExporting: Dispatch<SetStateAction<boolean>>
}

export function useImageExport({
  state,
  originalImg,
  fileName,
  outputError,
  setOutputBlobSize,
  setOutputSize,
  setOutputError,
  setIsExporting,
}: UseImageExportOptions) {
  const setLastAction = useUiStore((s) => s.setLastAction)
  const outputCanvasRef = useRef<HTMLCanvasElement>(null)
  const exportInFlightRef = useRef(false)

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
    setOutputBlobSize,
    setOutputError,
    setOutputSize,
  ])

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
  }, [state.format, state.quality, fileName, outputError, setIsExporting, setLastAction])

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

  return { outputCanvasRef, handleDownload, handleCopyImage }
}
