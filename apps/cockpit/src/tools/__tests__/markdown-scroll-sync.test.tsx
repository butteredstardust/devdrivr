import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  previewOffsetForSourceLine,
  sourceLineForPreviewOffset,
  type ScrollSyncEditor,
  useScrollSync,
} from '@/tools/markdown-editor/hooks/useScrollSync'

const entries = [
  { startLine: 1, endLine: 1, top: 0, bottom: 30 },
  { startLine: 5, endLine: 9, top: 120, bottom: 320 },
  { startLine: 12, endLine: 12, top: 400, bottom: 440 },
]

describe('Markdown scroll synchronization', () => {
  it('maps source lines through variable-height rendered blocks and gaps', () => {
    expect(previewOffsetForSourceLine(entries, 7)).toBe(220)
    expect(previewOffsetForSourceLine(entries, 3)).toBe(75)
    expect(previewOffsetForSourceLine(entries, 20)).toBe(440)
  })

  it('maps preview offsets back to source lines', () => {
    expect(sourceLineForPreviewOffset(entries, 220)).toBe(7)
    expect(sourceLineForPreviewOffset(entries, 75)).toBe(3)
    expect(sourceLineForPreviewOffset(entries, 600)).toBe(12)
  })

  it('attaches after Monaco mounts and disposes listeners on unmount', () => {
    const preview = document.createElement('div')
    const previewRef = { current: preview }
    const dispose = vi.fn()
    const editor: ScrollSyncEditor = {
      onDidScrollChange: vi.fn(() => ({ dispose })),
      getVisibleRanges: vi.fn(() => [{ startLineNumber: 1 }]),
      getTopForLineNumber: vi.fn(() => 0),
      setScrollTop: vi.fn(),
    }

    const { rerender, unmount } = renderHook(
      ({ mountedEditor }: { mountedEditor: ScrollSyncEditor | null }) =>
        useScrollSync(mountedEditor, previewRef, true, true),
      { initialProps: { mountedEditor: null as ScrollSyncEditor | null } }
    )
    expect(editor.onDidScrollChange).not.toHaveBeenCalled()

    rerender({ mountedEditor: editor })
    expect(editor.onDidScrollChange).toHaveBeenCalledOnce()

    unmount()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('measures preview blocks once per markup change rather than once per scroll frame', async () => {
    const preview = document.createElement('div')
    document.body.appendChild(preview)
    const measure = vi.spyOn(preview, 'querySelectorAll')
    const editor: ScrollSyncEditor = {
      onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
      getVisibleRanges: vi.fn(() => [{ startLineNumber: 1 }]),
      getTopForLineNumber: vi.fn(() => 0),
      setScrollTop: vi.fn(),
    }
    // The hook falls back to a timeout when rAF is unavailable, as it is here.
    const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0))

    const { unmount } = renderHook(() => useScrollSync(editor, { current: preview }, false, true))

    preview.dispatchEvent(new window.Event('scroll'))
    await nextFrame()
    expect(measure).toHaveBeenCalledTimes(1)

    preview.dispatchEvent(new window.Event('scroll'))
    await nextFrame()
    expect(measure).toHaveBeenCalledTimes(1)

    // Re-rendered markup invalidates the cache through the MutationObserver.
    preview.appendChild(document.createElement('p'))
    await nextFrame()
    preview.dispatchEvent(new window.Event('scroll'))
    await nextFrame()
    expect(measure).toHaveBeenCalledTimes(2)

    unmount()
    preview.remove()
  })

  it('attaches only the enabled synchronization direction', () => {
    const preview = document.createElement('div')
    const addListener = vi.spyOn(preview, 'addEventListener')
    const editor: ScrollSyncEditor = {
      onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
      getVisibleRanges: vi.fn(() => [{ startLineNumber: 1 }]),
      getTopForLineNumber: vi.fn(() => 0),
      setScrollTop: vi.fn(),
    }

    const { unmount } = renderHook(() => useScrollSync(editor, { current: preview }, false, true))

    expect(editor.onDidScrollChange).not.toHaveBeenCalled()
    expect(addListener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    unmount()
  })
})
