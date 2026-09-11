import { type RefObject } from 'react'
import { useNativeFileDrop } from '@/hooks/useNativeFileDrop'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])

function supportsImagePath(path: string): boolean {
  const extension = path.split('.').pop()?.toLowerCase()
  return extension !== undefined && IMAGE_EXTENSIONS.has(extension)
}

type ImageFileDropCallbacks = {
  /** The path lets the tool restore the image after a reload. */
  onFile: (file: File, path: string) => void
  onError: (message: string) => void
}

/** Takes the image half of a native file drop. See `useNativeFileDrop` for the drop contract. */
export function useImageFileDrop(
  containerRef: RefObject<HTMLDivElement | null>,
  callbacks: ImageFileDropCallbacks,
  enabled: boolean
): { isDraggingImage: boolean } {
  const { isDragging } = useNativeFileDrop(
    containerRef,
    { onFile: callbacks.onFile, onError: callbacks.onError, accept: supportsImagePath },
    enabled
  )
  return { isDraggingImage: isDragging }
}
