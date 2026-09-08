import { useUiStore } from '@/stores/ui.store'
import { useToolStateCache } from '@/stores/tool-state.store'
import { loadToolState, saveToolState } from '@/lib/db'

export type SendToToolOptions = {
  /**
   * State keys that hold a whole document rather than a selection.
   *
   * Set this whenever the patch replaces the destination's content. A destination already holding
   * a different document then receives the handoff in a new tab instead of losing what it has.
   */
  documentKeys?: string[]
}

/**
 * The document each handoff last delivered, keyed by `${stateKey}:${documentKey}`.
 *
 * A destination still holding exactly what a handoff put there has not been edited since, so the
 * next handoff refills it rather than opening another tab. Without this, every repeat of the same
 * button leaves one more tab behind.
 */
const delivered = new Map<string, string>()

/**
 * How many delivered documents to remember. Each entry holds a whole document, and closing a tab
 * does not free its key, so the map is capped rather than left to grow for the session.
 *
 * Evicting an entry only costs one extra tab: the destination then looks edited, so the handoff
 * moves aside instead of replacing it. Forgetting is always the safe direction.
 */
const MAX_REMEMBERED_DELIVERIES = 32

/**
 * State keys that name the file a document came from.
 *
 * A handoff replaces the document but not the row around it, so these would otherwise survive and
 * point the destination's next Save at a file the handed-over content never came from.
 */
const FILE_METADATA_KEYS = ['filePath', 'fileName'] as const

/** The `tool_state` key of the tab now in front, falling back to the bare tool id. */
function focusedStateKey(toolId: string): string {
  const ui = useUiStore.getState()
  return ui.tabs.find((tab) => tab.id === ui.activeTabId)?.stateKey ?? toolId
}

/**
 * True when the patch would replace a document the user could still want.
 *
 * Empty documents and documents identical to the incoming one are not losses. Neither is a
 * document a previous handoff delivered and nobody has edited since.
 */
function wouldReplaceDocument(
  state: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
  key: string,
  documentKeys: string[]
): boolean {
  if (!state) return false
  return documentKeys.some((documentKey) => {
    const current = state[documentKey]
    if (typeof current !== 'string' || current.trim() === '') return false
    if (current === patch[documentKey]) return false
    return delivered.get(`${key}:${documentKey}`) !== current
  })
}

/** Records what this handoff put in the destination, so a repeat can reuse the same tab. */
function rememberDelivery(key: string, patch: Record<string, unknown>, documentKeys: string[]) {
  for (const documentKey of documentKeys) {
    const value = patch[documentKey]
    if (typeof value !== 'string') continue
    // Re-insert rather than update, so the entry counts as the most recent for eviction.
    delivered.delete(`${key}:${documentKey}`)
    delivered.set(`${key}:${documentKey}`, value)
  }
  // Map iterates in insertion order, so the first key is the oldest.
  while (delivered.size > MAX_REMEMBERED_DELIVERIES) {
    const oldest = delivered.keys().next().value
    if (oldest === undefined) break
    delivered.delete(oldest)
  }
}

/**
 * Clears the destination's file metadata, so the handed-over document is not tied to its file.
 *
 * Only touches keys the destination actually holds and the caller does not set itself. A handoff
 * that names its own file keeps it.
 */
function withoutFileMetadata(
  patch: Record<string, unknown>,
  state: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!state) return patch
  const next = { ...patch }
  for (const key of FILE_METADATA_KEYS) {
    if (state[key] != null && !(key in next)) next[key] = null
  }
  return next
}

/** Seeds the patch into one tab's state row, on top of whatever that row already holds. */
function deliver(key: string, patch: Record<string, unknown>): void {
  const cache = useToolStateCache.getState()

  // `seed`, not `set` — the destination may already be mounted and hidden, in
  // which case only the seed counter will make it look at the cache again.
  if (cache.get(key) !== undefined) {
    cache.seed(key, patch)
    const seeded = useToolStateCache.getState().get(key)
    if (seeded) void saveToolState(key, seeded).catch(() => {})
    return
  }

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

/** Picks the tab the handoff goes to, then seeds it. */
async function route(
  toolId: string,
  patch: Record<string, unknown>,
  options: SendToToolOptions
): Promise<void> {
  // Focus-or-create first, then address exactly the tab `openTab` selected. This
  // also keeps handoffs aligned with sidebar/palette MRU behavior.
  useUiStore.getState().openTab(toolId)
  let key = focusedStateKey(toolId)
  const documentKeys = options.documentKeys
  let outgoing = patch

  if (documentKeys?.length) {
    // A destination that has never been open keeps its document on disk, so the check has to read
    // it. Nothing is seeded until the tab that receives the handoff is known.
    const cached = useToolStateCache.getState().get(key)
    const stored = cached ?? (await loadToolState(key).catch(() => null))
    // WARNING: the tab is on screen and usable during that read. Whatever the user typed while it
    // ran is in the cache and is newer than the row on disk, so the check has to see it.
    const state = { ...stored, ...useToolStateCache.getState().get(key) }

    if (wouldReplaceDocument(state, patch, key, documentKeys)) {
      // The new tab has its own state key and holds nothing, so there is no file to detach from.
      useUiStore.getState().openTabInstance(toolId)
      key = focusedStateKey(toolId)
    } else {
      outgoing = withoutFileMetadata(patch, state)
    }
    rememberDelivery(key, outgoing, documentKeys)
  }

  deliver(key, outgoing)
}

/**
 * Seeds another tool's state and brings it forward — cURL → Fetch handing a
 * request to the API Client, the API Client handing a response to JSON Tools.
 *
 * WARNING: the patch overwrites the destination's state. Pass `documentKeys` for every key that
 * carries a whole document. Without it a handoff replaces a document the destination already
 * holds, and a document opened from disk keeps its path — the next save would write the
 * handed-over content back to the user's file.
 *
 * The patch has to go to the *tab* that will receive focus, not to the tool id.
 * Those were the same thing until a tool could be open in more than one tab;
 * now a second API Client tab writes to `api-client#<id>`, and addressing the
 * bare id would drop the handoff into a row nothing is reading.
 */
export function sendToTool(
  toolId: string,
  patch: Record<string, unknown>,
  options: SendToToolOptions = {}
): void {
  // Synchronous until the destination has to be read from disk, so a handoff that cannot lose
  // anything still seeds within the click that asked for it.
  void route(toolId, patch, options).catch(() => {})
}

/** Forgets every recorded delivery. Test helper — the map outlives a component tree. */
export function clearHandoffDeliveries(): void {
  delivered.clear()
}
