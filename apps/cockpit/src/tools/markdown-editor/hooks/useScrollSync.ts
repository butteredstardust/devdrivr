import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

export type ScrollSyncEditor = {
  onDidScrollChange: (cb: () => void) => { dispose: () => void }
  getVisibleRanges: () => ReadonlyArray<{ startLineNumber: number }>
  getTopForLineNumber: (lineNumber: number) => number
  setScrollTop: (value: number) => void
}

export type PreviewLineEntry = {
  startLine: number
  endLine: number
  top: number
  bottom: number
}

type ScrollSource = 'editor' | 'preview' | null

const SOURCE_SELECTOR =
  '[data-markdown-start-line][data-markdown-end-line][data-markdown-start][data-markdown-end]'
// Back to the pre-line-mapping value: the extra window existed to cover per-frame DOM measurement,
// which the entry cache removed. Shorter means the other pane regains control sooner.
const COOLDOWN_MS = 50

// Mirrors the preview's own scheduler: environments without rAF (jsdom, and the tests that run
// there) still need the deferred measurement to happen rather than throw.
function scheduleFrame(callback: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback)
  return window.setTimeout(callback, 0)
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
  else window.clearTimeout(handle)
}

function interpolate(
  value: number,
  fromStart: number,
  fromEnd: number,
  toStart: number,
  toEnd: number
) {
  if (fromEnd <= fromStart) return toStart
  const progress = Math.min(1, Math.max(0, (value - fromStart) / (fromEnd - fromStart)))
  return toStart + progress * (toEnd - toStart)
}

/** Map a one-based Markdown source line to its rendered vertical offset. */
export function previewOffsetForSourceLine(entries: PreviewLineEntry[], line: number): number {
  if (entries.length === 0) return 0
  const targetLine = Math.max(1, line)

  for (const entry of entries) {
    if (targetLine >= entry.startLine && targetLine <= entry.endLine) {
      return interpolate(targetLine, entry.startLine, entry.endLine, entry.top, entry.bottom)
    }
  }

  const nextIndex = entries.findIndex((entry) => entry.startLine > targetLine)
  if (nextIndex === 0) return entries[0]?.top ?? 0
  if (nextIndex === -1) return entries.at(-1)?.bottom ?? 0

  const previous = entries[nextIndex - 1]
  const next = entries[nextIndex]
  if (!previous || !next) return 0
  return interpolate(targetLine, previous.endLine, next.startLine, previous.bottom, next.top)
}

/** Map a rendered vertical offset back to the nearest one-based Markdown source line. */
export function sourceLineForPreviewOffset(entries: PreviewLineEntry[], offset: number): number {
  if (entries.length === 0) return 1
  const targetOffset = Math.max(0, offset)

  for (const entry of entries) {
    if (targetOffset >= entry.top && targetOffset <= entry.bottom) {
      return Math.max(
        1,
        Math.round(
          interpolate(targetOffset, entry.top, entry.bottom, entry.startLine, entry.endLine)
        )
      )
    }
  }

  const nextIndex = entries.findIndex((entry) => entry.top > targetOffset)
  if (nextIndex === 0) return entries[0]?.startLine ?? 1
  if (nextIndex === -1) return entries.at(-1)?.endLine ?? 1

  const previous = entries[nextIndex - 1]
  const next = entries[nextIndex]
  if (!previous || !next) return 1
  return Math.max(
    1,
    Math.round(
      interpolate(targetOffset, previous.bottom, next.top, previous.endLine, next.startLine)
    )
  )
}

function getPreviewLineEntries(preview: HTMLDivElement): PreviewLineEntry[] {
  const previewRect = preview.getBoundingClientRect()
  const elements = Array.from(preview.querySelectorAll<HTMLElement>(SOURCE_SELECTOR))
  const leafElements = elements.filter((element) => !element.querySelector(SOURCE_SELECTOR))

  return leafElements
    .map((element): PreviewLineEntry | null => {
      const startLine = Number(element.dataset.markdownStartLine)
      const endLine = Number(element.dataset.markdownEndLine)
      const rect = element.getBoundingClientRect()
      if (
        !Number.isInteger(startLine) ||
        !Number.isInteger(endLine) ||
        startLine < 1 ||
        endLine < startLine ||
        rect.height <= 0 ||
        rect.width <= 0
      ) {
        return null
      }
      const top = rect.top - previewRect.top + preview.scrollTop
      return { startLine, endLine, top, bottom: top + rect.height }
    })
    .filter((entry): entry is PreviewLineEntry => entry !== null)
    .sort((a, b) => a.top - b.top || a.startLine - b.startLine)
}

function clampScrollTop(value: number, scrollHeight: number, clientHeight: number): number {
  return Math.min(Math.max(0, scrollHeight - clientHeight), Math.max(0, value))
}

/**
 * Measuring every annotated block costs a full layout pass, so it must not happen on each scroll
 * frame. The entry list only changes when the rendered markup changes or the layout reflows, so
 * cache it and invalidate from a MutationObserver plus a ResizeObserver instead. Entries are stored
 * relative to the scroll container's content box (rect offset plus `scrollTop`), which scrolling
 * does not alter — that is what makes the cache safe to keep across scroll events.
 */
function createLineEntryCache(preview: HTMLDivElement) {
  let entries: PreviewLineEntry[] | null = null

  const invalidate = () => {
    entries = null
  }

  // Reached through `window` rather than as bare globals: the test harness attaches jsdom to
  // `window` without mirroring it onto `globalThis`, so the bare names would read as undefined and
  // quietly disable invalidation there.
  const mutationObserver = window.MutationObserver
    ? new window.MutationObserver(() => {
        invalidate()
        observeContent()
      })
    : null
  const resizeObserver = window.ResizeObserver ? new window.ResizeObserver(invalidate) : null

  // Content height can change without a mutation (images and Mermaid SVGs settling late), so the
  // rendered wrapper is observed alongside the scroll container itself.
  function observeContent() {
    if (!resizeObserver) return
    resizeObserver.disconnect()
    resizeObserver.observe(preview)
    for (const child of Array.from(preview.children)) resizeObserver.observe(child)
  }

  mutationObserver?.observe(preview, { childList: true, subtree: true })
  observeContent()

  return {
    get(): PreviewLineEntry[] {
      if (entries === null) entries = getPreviewLineEntries(preview)
      return entries
    },
    dispose() {
      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      entries = null
    },
  }
}

export function useScrollSync(
  editor: ScrollSyncEditor | null,
  previewRef: RefObject<HTMLDivElement | null>,
  syncPreviewWithEditor: boolean,
  syncEditorWithPreview: boolean
): void {
  const sourceRef = useRef<ScrollSource>(null)
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if ((!syncPreviewWithEditor && !syncEditorWithPreview) || !editor) return
    const preview = previewRef.current
    if (!preview) return

    const lineEntries = createLineEntryCache(preview)

    const resetSource = () => {
      if (cooldownRef.current) clearTimeout(cooldownRef.current)
      cooldownRef.current = setTimeout(() => {
        sourceRef.current = null
      }, COOLDOWN_MS)
    }

    const editorDisposable = syncPreviewWithEditor
      ? editor.onDidScrollChange(() => {
          if (sourceRef.current === 'preview') return
          sourceRef.current = 'editor'
          resetSource()

          if (rafRef.current) cancelFrame(rafRef.current)
          rafRef.current = scheduleFrame(() => {
            const visibleLine = editor.getVisibleRanges()[0]?.startLineNumber
            if (!visibleLine) return
            const target = previewOffsetForSourceLine(lineEntries.get(), visibleLine)
            preview.scrollTop = clampScrollTop(target, preview.scrollHeight, preview.clientHeight)
          })
        })
      : null

    const handlePreviewScroll = () => {
      if (sourceRef.current === 'editor') return
      sourceRef.current = 'preview'
      resetSource()

      if (rafRef.current) cancelFrame(rafRef.current)
      rafRef.current = scheduleFrame(() => {
        const line = sourceLineForPreviewOffset(lineEntries.get(), preview.scrollTop)
        editor.setScrollTop(editor.getTopForLineNumber(line))
      })
    }

    if (syncEditorWithPreview) {
      preview.addEventListener('scroll', handlePreviewScroll, { passive: true })
    }

    return () => {
      lineEntries.dispose()
      editorDisposable?.dispose()
      if (syncEditorWithPreview) {
        preview.removeEventListener('scroll', handlePreviewScroll)
      }
      if (cooldownRef.current) clearTimeout(cooldownRef.current)
      if (rafRef.current) cancelFrame(rafRef.current)
      sourceRef.current = null
    }
  }, [editor, previewRef, syncEditorWithPreview, syncPreviewWithEditor])
}
