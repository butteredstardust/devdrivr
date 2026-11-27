import { useCallback, useEffect, useRef } from 'react'
import { useFrameThrottle } from '@/hooks/useFrameThrottle'
import {
  clampCropRect,
  cropRectForDrag,
  cropRectsMatch,
  getImageParameters,
  type CropDragState,
  type CropHandle,
  type CropRect,
  type DisplayMetrics,
  type ImageParameters,
  type ImageToolState,
  type LoadedImage,
} from '@/tools/image-tool/image-tool-model'

type CropInteractionOptions = {
  state: ImageToolState
  displayMetrics: DisplayMetrics | null
  originalImg: LoadedImage | null
  persistState: (patch: Partial<ImageToolState>) => void
  updateParameters: (patch: Partial<ImageParameters>) => void
  recordUndo: (snapshot: ImageParameters) => void
}

export function useCropInteraction({
  state,
  displayMetrics,
  originalImg,
  persistState,
  updateParameters,
  recordUndo,
}: CropInteractionOptions) {
  const cropDragRef = useRef<CropDragState | null>(null)
  const cropDragUndoRef = useRef<ImageParameters | null>(null)

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
  const committedCropRef = useRef<CropRect | null>(null)

  // Every commit re-renders the tool, resizes the output canvas and redraws the image. A mouse
  // delivers several moves per frame, and only the last one can paint, so only the last is applied.
  const {
    run: scheduleCrop,
    flush: flushCrop,
    cancel: cancelCrop,
  } = useFrameThrottle((clientX: number, clientY: number) => {
    const drag = cropDragRef.current
    if (!drag) return
    const next = cropRectForDrag(drag, clientX, clientY)

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
      recordUndo(cropDragUndoRef.current)
    }
    committedCropRef.current = next

    persistState({
      cropX: next.x,
      cropY: next.y,
      cropW: next.w,
      cropH: next.h,
    })
  })

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
    if (state.activeTab !== 'crop') return
    window.addEventListener('mouseup', handleCropMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleCropMouseUp)
      cancelCrop()
      cropDragRef.current = null
      cropDragUndoRef.current = null
      committedCropRef.current = null
    }
  }, [cancelCrop, handleCropMouseUp, originalImg, state.activeTab])

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

  return {
    handleCropHandleMouseDown,
    handleCropMouseMove,
    handleCropMouseUp,
    handleCropKeyDown,
    handleCropHandleKeyDown,
    handleResetCrop,
    handleCropChange,
  }
}
