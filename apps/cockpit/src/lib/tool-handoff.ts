import { useUiStore } from '@/stores/ui.store'
import { useToolStateCache } from '@/stores/tool-state.store'
import { loadToolState, saveToolState } from '@/lib/db'

/**
 * Seeds another tool's state and brings it forward — cURL → Fetch handing a
 * request to the API Client, the API Client handing a response to JSON Tools.
 *
 * The patch has to go to the *tab* that will receive focus, not to the tool id.
 * Those were the same thing until a tool could be open in more than one tab;
 * now a second API Client tab writes to `api-client#<id>`, and addressing the
 * bare id would drop the handoff into a row nothing is reading.
 */
export function sendToTool(toolId: string, patch: Record<string, unknown>): void {
  // Focus-or-create first, then address exactly the tab `openTab` selected. This
  // also keeps handoffs aligned with sidebar/palette MRU behavior.
  useUiStore.getState().openTab(toolId)
  const ui = useUiStore.getState()
  const target = ui.tabs.find((tab) => tab.id === ui.activeTabId)
  const key = target?.stateKey ?? toolId
  const cache = useToolStateCache.getState()

  // `seed`, not `set` — the destination may already be mounted and hidden, in
  // which case only the seed counter will make it look at the cache again.
  if (cache.get(key) !== undefined) {
    cache.seed(key, patch)
    const seeded = useToolStateCache.getState().get(key)
    if (seeded) void saveToolState(key, seeded).catch(() => {})
  } else {
    // Deliver immediately so the newly focused tab can render the handoff while
    // its saved state is being read. When that read resolves, fill in only the
    // fields that have not since changed in memory, so live edits always win.
    cache.seed(key, patch)
    loadToolState(key)
      .then((saved) => {
        const latest = useToolStateCache.getState()
        if (latest.isDiscarded(key)) return
        const merged = { ...saved, ...latest.get(key) }
        latest.seed(key, merged)
        void saveToolState(key, merged).catch(() => {})
      })
      .catch(() => {
        const latest = useToolStateCache.getState()
        if (latest.isDiscarded(key)) return
        const current = latest.get(key) ?? patch
        latest.seed(key, current)
        void saveToolState(key, current).catch(() => {})
      })
  }
}
