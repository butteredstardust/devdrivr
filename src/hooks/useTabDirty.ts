import { useEffect } from 'react'
import { useToolInstance } from '@/app/tool-instance'
import { useUiStore } from '@/stores/ui.store'

/**
 * Reports whether this tool instance holds unsaved work, so its tab can say so.
 *
 * Tools that have a notion of "saved" already compute this for their own status
 * line; this is the one line that publishes the answer to the tab strip. Pass
 * the same boolean the tool already derives — do not add a second source of
 * truth for it.
 *
 * Safe to call from a tool rendered outside a tab (tests, previews): with no
 * instance in context there is no tab to mark, and the hook does nothing.
 *
 * The flag is cleared on unmount so a tool torn down by the keep-alive limit
 * does not leave its tab marked dirty forever — the tab is still open, so
 * `pruneDirty` would not have caught it.
 */
export function useTabDirty(dirty: boolean): void {
  const tabId = useToolInstance()?.tabId
  const setTabDirty = useUiStore((s) => s.setTabDirty)

  useEffect(() => {
    if (!tabId) return
    setTabDirty(tabId, dirty)
  }, [tabId, dirty, setTabDirty])

  useEffect(() => {
    if (!tabId) return
    return () => setTabDirty(tabId, false)
  }, [tabId, setTabDirty])
}
