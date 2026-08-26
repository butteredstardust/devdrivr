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
const COOLDOWN_MS = 80

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

          if (rafRef.current) cancelAnimationFrame(rafRef.current)
          rafRef.current = requestAnimationFrame(() => {
            const visibleLine = editor.getVisibleRanges()[0]?.startLineNumber
            if (!visibleLine) return
            const target = previewOffsetForSourceLine(getPreviewLineEntries(preview), visibleLine)
            preview.scrollTop = clampScrollTop(target, preview.scrollHeight, preview.clientHeight)
          })
        })
      : null

    const handlePreviewScroll = () => {
      if (sourceRef.current === 'editor') return
      sourceRef.current = 'preview'
      resetSource()

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const line = sourceLineForPreviewOffset(getPreviewLineEntries(preview), preview.scrollTop)
        editor.setScrollTop(editor.getTopForLineNumber(line))
      })
    }

    if (syncEditorWithPreview) {
      preview.addEventListener('scroll', handlePreviewScroll, { passive: true })
    }

    return () => {
      editorDisposable?.dispose()
      if (syncEditorWithPreview) {
        preview.removeEventListener('scroll', handlePreviewScroll)
      }
      if (cooldownRef.current) clearTimeout(cooldownRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      sourceRef.current = null
    }
  }, [editor, previewRef, syncEditorWithPreview, syncPreviewWithEditor])
}
