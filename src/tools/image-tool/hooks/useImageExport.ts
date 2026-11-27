import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { buildExportFilename, exportFile } from '@/lib/file-io'
import { formatBytes } from '@/lib/format'
import { useUiStore } from '@/stores/ui.store'
import { renderImage } from '@/tools/image-tool/image-renderer'
import type { ImageToolState, LoadedImage } from '@/tools/image-tool/image-tool-model'

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
    const result = renderImage(canvas, originalImg, {
      cropX: state.cropX,
      cropY: state.cropY,
      cropW: state.cropW,
      cropH: state.cropH,
      resizeW: state.resizeW,
      resizeH: state.resizeH,
      rotation: state.rotation,
      flipX: state.flipX,
      flipY: state.flipY,
      format: state.format,
    })
    if (!result) return
    if ('error' in result) {
      setOutputSize(null)
      setOutputBlobSize(0)
      setOutputError(result.error)
      setLastAction(result.error, 'error')
      return
    }
    setOutputSize(result)
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
