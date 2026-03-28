import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

type EditorInstance = {
  onDidScrollChange: (cb: (e: { scrollTop: number }) => void) => { dispose: () => void }
  getScrollTop: () => number
  setScrollTop: (v: number) => void
  getScrollHeight: () => number
  getLayoutInfo: () => { height: number }
}

type ScrollSource = 'editor' | 'preview' | null

// ─── Pure helpers (exported for testing) ────────────────────────────

/** Compute scroll ratio 0..1 from scroll position */
export function scrollRatio(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const maxScroll = scrollHeight - clientHeight
  if (maxScroll <= 0) return 0
  return Math.min(1, Math.max(0, scrollTop / maxScroll))
}

/** Convert ratio 0..1 to a scrollTop for a given container */
export function applyRatio(
  ratio: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const maxScroll = scrollHeight - clientHeight
  if (maxScroll <= 0) return 0
  return Math.round(ratio * maxScroll)
}

// ─── Hook ───────────────────────────────────────────────────────────

const COOLDOWN_MS = 50

export function useScrollSync(
  editorRef: RefObject<EditorInstance | null>,
  previewRef: RefObject<HTMLDivElement | null>,
  enabled: boolean
): void {
  const sourceRef = useRef<ScrollSource>(null)
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const editor = editorRef.current
    const preview = previewRef.current
    if (!editor || !preview) return

    function resetSource() {
      if (cooldownRef.current) clearTimeout(cooldownRef.current)
      cooldownRef.current = setTimeout(() => {
        sourceRef.current = null
      }, COOLDOWN_MS)
    }

    // Editor → Preview
    const editorDisposable = editor.onDidScrollChange(() => {
      if (sourceRef.current === 'preview') return
      sourceRef.current = 'editor'
      resetSource()

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        if (!preview) return
        const ratio = scrollRatio(
          editor.getScrollTop(),
          editor.getScrollHeight(),
          editor.getLayoutInfo().height
        )
        preview.scrollTop = applyRatio(ratio, preview.scrollHeight, preview.clientHeight)
      })
    })

    // Preview → Editor
    function handlePreviewScroll() {
      if (sourceRef.current === 'editor') return
      sourceRef.current = 'preview'
      resetSource()

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        if (!editor || !preview) return
        const ratio = scrollRatio(preview.scrollTop, preview.scrollHeight, preview.clientHeight)
        editor.setScrollTop(
          applyRatio(ratio, editor.getScrollHeight(), editor.getLayoutInfo().height)
        )
      })
    }

    preview.addEventListener('scroll', handlePreviewScroll, { passive: true })

    return () => {
      editorDisposable.dispose()
      preview.removeEventListener('scroll', handlePreviewScroll)
      if (cooldownRef.current) clearTimeout(cooldownRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
}
