import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { SelectionToolbarState } from '@/components/shared/SelectionContextToolbar'

export function useDomSelectionToolbar(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  const [selection, setSelection] = useState<SelectionToolbarState | null>(null)

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

  useEffect(() => {
    if (!enabled) {
      setSelection(null)
      return
    }

    document.addEventListener('selectionchange', updateSelection)
    document.addEventListener('mouseup', updateSelection)
    document.addEventListener('keyup', updateSelection)
    window.addEventListener('scroll', clearSelection, true)
    window.addEventListener('resize', clearSelection)

    return () => {
      document.removeEventListener('selectionchange', updateSelection)
      document.removeEventListener('mouseup', updateSelection)
      document.removeEventListener('keyup', updateSelection)
      window.removeEventListener('scroll', clearSelection, true)
      window.removeEventListener('resize', clearSelection)
    }
  }, [clearSelection, enabled, updateSelection])

  return { selection, clearSelection }
}
