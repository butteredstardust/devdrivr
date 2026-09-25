import { type RefObject } from 'react'
import { useNativeFileDrop } from '@/hooks/useNativeFileDrop'
import { formatBytes } from '@/lib/format'
import { MAX_IMAGE_FILE_BYTES } from '@/tools/image-tool/image-tool-model'

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
    {
      onFile: callbacks.onFile,
      onError: callbacks.onError,
      accept: supportsImagePath,
      // Check the size before the read. The tool rejects a larger image anyway, but only after
      // the whole file is in memory.
      maxBytes: MAX_IMAGE_FILE_BYTES,
      onTooLarge: () =>
        callbacks.onError(`Image exceeds the ${formatBytes(MAX_IMAGE_FILE_BYTES)} file limit`),
    },
    enabled
  )
  return { isDraggingImage: isDragging }
}
