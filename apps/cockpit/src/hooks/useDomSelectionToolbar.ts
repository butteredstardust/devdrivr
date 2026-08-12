import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { SelectionToolbarState } from '@/components/shared/SelectionContextToolbar'

export function useDomSelectionToolbar(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  const [selection, setSelection] = useState<SelectionToolbarState | null>(null)
  const rafRef = useRef<number | null>(null)

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }, [])

  const updateSelection = useCallback(() => {
    if (!enabled) {
      setSelection(null)
      return
    }

    const container = containerRef.current
    const selected = window.getSelection()
    if (!container || !selected || selected.rangeCount === 0 || selected.isCollapsed) {
      setSelection(null)
      return
    }

    const range = selected.getRangeAt(0)
    const commonAncestor =
      range.commonAncestorContainer.nodeType === window.Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement

    if (!commonAncestor || !container.contains(commonAncestor)) {
      setSelection(null)
      return
    }

    const text = selected.toString().trim()
    const rect = range.getBoundingClientRect()
    if (!text || rect.width === 0 || rect.height === 0) {
      setSelection(null)
      return
    }

    setSelection({ text, rect })
  }, [containerRef, enabled])

  // Scroll/resize must only reposition the toolbar from the live selection —
  // never destroy the user's actual DOM selection (removeAllRanges). Throttled
  // via requestAnimationFrame since scroll/resize can fire at high frequency.
  const repositionSelection = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      updateSelection()
    })
  }, [updateSelection])

  useEffect(() => {
    if (!enabled) {
      setSelection(null)
      return
    }

    document.addEventListener('selectionchange', updateSelection)
    document.addEventListener('mouseup', updateSelection)
    document.addEventListener('keyup', updateSelection)
    window.addEventListener('scroll', repositionSelection, true)
    window.addEventListener('resize', repositionSelection)

    return () => {
      document.removeEventListener('selectionchange', updateSelection)
      document.removeEventListener('mouseup', updateSelection)
      document.removeEventListener('keyup', updateSelection)
      window.removeEventListener('scroll', repositionSelection, true)
      window.removeEventListener('resize', repositionSelection)
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [enabled, repositionSelection, updateSelection])

  return { selection, clearSelection }
}
