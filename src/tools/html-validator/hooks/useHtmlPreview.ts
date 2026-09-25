import { useEffect, useState } from 'react'

/** Longer than validation: reloading the iframe mid-word is the costly one. */
const PREVIEW_DEBOUNCE_MS = 400

export function useHtmlPreview(input: string, hasInput: boolean) {
  /** Reloading the iframe on every keystroke made typing stutter. */
  const [previewHtml, setPreviewHtml] = useState('')

  // --- Preview ---------------------------------------------------------

  useEffect(() => {
    if (!hasInput) {
      setPreviewHtml('')
      return
    }
    const timer = setTimeout(() => setPreviewHtml(input), PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input, hasInput])

  return previewHtml
}
