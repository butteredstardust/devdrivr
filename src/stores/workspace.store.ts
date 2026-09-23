import { create } from 'zustand'
import { deleteToolState, setSetting } from '@/lib/db'
import { assignStateKeys, stateKeyFor } from '@/lib/tab-state-key'
import { discardPendingToolAction } from '@/lib/tool-actions'
import { useToolStateCache } from '@/stores/tool-state.store'
import { useUiStore } from '@/stores/ui.store'
import type { WorkspaceTab } from '@/types/tools'

const MAX_RECENT = 5

type PendingTabClose = {
  tabIds: string[]
  nextActiveTabId: string | null
}

type WorkspaceStore = {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  /** Always matches `tabs.find((tab) => tab.id === activeTabId)?.toolId ?? ''`. */
  activeTool: string
  /**
   * Lists the most recently active tab ids first.
   * The workspace keeps the leading tabs mounted, which preserves their editors while it unmounts other background tabs.
   */
  tabMru: string[]
  /**
   * Do not persist this list because tool state restores the derived values at launch.
   * Lists tabs whose tools report unsaved work, so the tab strip can mark them. `useTabDirty` reports each value.
   */
  dirtyTabIds: string[]
  /** Holds a destructive close request when at least one affected tab contains unsaved work. */
  pendingTabClose: PendingTabClose | null
  /** Opens a tool in a new tab, or focuses its most recently active tab. */
  openTab: (toolId: string) => void
  /**
   * Keep this separate from `openTab`, because sidebar selections must return to existing work instead of duplicating it.
   * Opens another instance of a tool.
   */
  openTabInstance: (toolId: string) => void
  /** Does not move a tab outside its pin group. Moves the tab to the requested index within that group. */
  reorderTab: (tabId: string, toIndex: number) => void
  /** Pins or unpins a tab and keeps pinned tabs first. */
  toggleTabPinned: (tabId: string) => void
  /** Closes a tab and activates an adjacent tab when necessary. */
  closeTab: (tabId: string) => void
  /** Closes every other unpinned tab. */
  closeOtherTabs: (tabId: string) => void
  /** Closes every unpinned tab to the right of the selected tab. */
  closeTabsToRight: (tabId: string) => void
  confirmPendingTabClose: () => void
  cancelPendingTabClose: () => void
  /** Activates an existing tab without opening another tab. */
  setActiveTab: (tabId: string) => void
  /** Reports whether a tab contains unsaved work. Tools call this through `useTabDirty`. */
  setTabDirty: (tabId: string, dirty: boolean) => void
  /** Does not write to the database. Restores tabs during startup. */
  restoreTabs: (tabs: WorkspaceTab[], activeTabId: string | null) => void
  /** Opens or focuses a tool through `openTab`. */
  setActiveTool: (toolId: string) => void
  /** Does not write to the database. Restores one active tool. */
  restoreActiveTool: (toolId: string) => void
  recentToolIds: string[]
  trackRecent: (toolId: string) => void
}

function derivedActiveTool(tabs: WorkspaceTab[], activeTabId: string | null): string {
  return tabs.find((tab) => tab.id === activeTabId)?.toolId ?? ''
}

/**
 * Indicates whether the current persistence outage has produced a toast.
 * Each tab selection writes state, so report only one toast per outage. A successful write resets the indicator.
 */
let persistFailureReported = false

function reportPersistFailure(what: string, error: unknown): void {
  console.error(`[workspace.store] failed to persist ${what}`, error)
  if (persistFailureReported) return
  persistFailureReported = true
  const message = error instanceof Error ? error.message : String(error)
  useUiStore
    .getState()
    .addToast(`Failed to save your workspace: ${message}. Open tabs may not be restored.`, 'error')
}

function persistTabs(tabs: WorkspaceTab[], activeTabId: string | null): void {
  // Always report failures. Otherwise, users discover the failed save only when the next launch cannot restore their session.
  Promise.all([setSetting('openTabs', tabs), setSetting('activeTabId', activeTabId)]).then(
    () => {
      persistFailureReported = false
    },
    (error: unknown) => reportPersistFailure('open tabs', error)
  )
}

/**
 * Preserve bare tool ids so reopening a tool restores its work.
 * Remove scoped `<toolId>#<tabId>` keys because their tab ids never recur. These keys belong only to closed tab instances.
 */
function discardClosedState(closed: WorkspaceTab[]): void {
  for (const tab of closed) {
    const key = tab.stateKey ?? tab.toolId
    // Discard queued files for this tab. Otherwise, another tab with the same key can open a file that the user dismissed.
    discardPendingToolAction(key)
    if (!key.includes('#')) continue
    useToolStateCache.getState().discard(key)
    // Report cleanup failures only in the console. An unreachable row is harmless and does not justify a toast.
    deleteToolState(key).catch((error: unknown) => {
      console.error(`[workspace.store] failed to discard tool state for ${key}`, error)
    })
  }
}

/** Removes dirty flags for tabs that no longer exist. */
function pruneDirty(dirtyTabIds: string[], tabs: WorkspaceTab[]): string[] {
  if (dirtyTabIds.length === 0) return dirtyTabIds
  const live = new Set(tabs.map((tab) => tab.id))
  const next = dirtyTabIds.filter((id) => live.has(id))
  // Preserve the array reference when every flag remains, so subscribers do not render again.
  return next.length === dirtyTabIds.length ? dirtyTabIds : next
}

/**
 * Puts pinned tabs before unpinned tabs and preserves each group order.
 * The tab strip renders store order directly, so every mutation and restored session keeps pinned tabs on the left.
 */
function sortPinnedFirst(tabs: WorkspaceTab[]): WorkspaceTab[] {
  const pinned = tabs.filter((tab) => tab.pinned)
  if (pinned.length === 0 || pinned.length === tabs.length) return tabs
  return [...pinned, ...tabs.filter((tab) => !tab.pinned)]
}

/** Puts the active tab first and removes ids for closed tabs. */
function touchMru(mru: string[], tabId: string | null, tabs: WorkspaceTab[]): string[] {
  const live = new Set(tabs.map((tab) => tab.id))
  const rest = mru.filter((id) => id !== tabId && live.has(id))
  return tabId && live.has(tabId) ? [tabId, ...rest] : rest
}

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  activeTool: '',
  tabMru: [],
  dirtyTabIds: [],
  pendingTabClose: null,

  openTab: (toolId) => {
    const { tabs: currentTabs, tabMru } = get()
    const existing =
      tabMru
        .map((id) => currentTabs.find((tab) => tab.id === id))
        .find((tab) => tab?.toolId === toolId) ?? currentTabs.find((tab) => tab.toolId === toolId)
    if (existing) {
      // Focus the tool's most recently active instance when the tool has multiple tabs.
      const activeTool = derivedActiveTool(currentTabs, existing.id)
      set({
        activeTabId: existing.id,
        activeTool,
        tabMru: touchMru(get().tabMru, existing.id, currentTabs),
      })
      persistTabs(currentTabs, existing.id)
      get().trackRecent(toolId)
    } else {
      get().openTabInstance(toolId)
    }
  },

  openTabInstance: (toolId) => {
    const id = crypto.randomUUID()
    const current = get().tabs
    const tab: WorkspaceTab = { id, toolId, stateKey: stateKeyFor(current, toolId, id) }
    const tabs = [...current, tab]
    set({ tabs, activeTabId: id, activeTool: toolId, tabMru: touchMru(get().tabMru, id, tabs) })
    persistTabs(tabs, id)
    get().trackRecent(toolId)
  },

  reorderTab: (tabId, toIndex) => {
    const { tabs, activeTabId } = get()
    const from = tabs.findIndex((tab) => tab.id === tabId)
    if (from === -1) return
    const moved = tabs[from]
    if (!moved) return
    // Keep the tab in its current pin group. Otherwise, a later sort appears to undo the accepted drag without explanation.
    const pinnedCount = tabs.filter((tab) => tab.pinned).length
    const lower = moved.pinned ? 0 : pinnedCount
    const upper = moved.pinned ? pinnedCount - 1 : tabs.length - 1
    const to = Math.max(lower, Math.min(toIndex, upper))
    if (from === to) return
    const next = [...tabs]
    next.splice(from, 1)
    next.splice(to, 0, moved)
    set({ tabs: next })
    persistTabs(next, activeTabId)
  },

  toggleTabPinned: (tabId) => {
    const { tabs, activeTabId } = get()
    const target = tabs.find((tab) => tab.id === tabId)
    if (!target) return
    const rest = tabs.filter((tab) => tab.id !== tabId)
    const pinnedCount = rest.filter((tab) => tab.pinned).length
    // Insert at the nearest edge of the destination group. This minimizes movement and avoids preserving an unrequested order change after unpinning.
    const next = [...rest]
    next.splice(pinnedCount, 0, { ...target, pinned: !target.pinned })
    set({ tabs: next })
    persistTabs(next, activeTabId)
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId, dirtyTabIds } = get()
    const index = tabs.findIndex((tab) => tab.id === tabId)
    if (index === -1) return
    const next = tabs.filter((tab) => tab.id !== tabId)
    let nextActiveId = activeTabId
    if (activeTabId === tabId) {
      // Prefer the previous tab, then the next tab, then no active tab.
      const candidate = next[index - 1] ?? next[index] ?? null
      nextActiveId = candidate?.id ?? null
    }
    const doomed = tabs.filter((tab) => tab.id === tabId)
    if (dirtyTabIds.includes(tabId)) {
      set({ pendingTabClose: { tabIds: [tabId], nextActiveTabId: nextActiveId } })
      return
    }
    const nextActiveTool = derivedActiveTool(next, nextActiveId)
    discardClosedState(doomed)
    // Preserve surviving state keys. A new tab can claim the bare key and restore the closed tool's work.
    set({
      tabs: next,
      activeTabId: nextActiveId,
      activeTool: nextActiveTool,
      tabMru: touchMru(get().tabMru, nextActiveId, next),
      dirtyTabIds: pruneDirty(get().dirtyTabIds, next),
    })
    persistTabs(next, nextActiveId)
  },

  closeOtherTabs: (tabId) => {
    const { tabs, dirtyTabIds } = get()
    // Ignore unknown tab ids.
    if (!tabs.some((tab) => tab.id === tabId)) return
    // Preserve pinned tabs. Closing them through "Close Others" would make pinning ineffective when it matters.
    const survives = (tab: WorkspaceTab) => tab.id === tabId || !!tab.pinned
    const next = tabs.filter(survives)
    // Stop when every tab survives.
    if (next.length === tabs.length) return
    const doomed = tabs.filter((tab) => !survives(tab))
    const nextActiveId = tabId
    if (doomed.some((tab) => dirtyTabIds.includes(tab.id))) {
      set({
        pendingTabClose: { tabIds: doomed.map((tab) => tab.id), nextActiveTabId: nextActiveId },
      })
      return
    }
    discardClosedState(doomed)
    set({
      tabs: next,
      activeTabId: nextActiveId,
      activeTool: derivedActiveTool(next, nextActiveId),
      tabMru: touchMru(get().tabMru, nextActiveId, next),
      dirtyTabIds: pruneDirty(get().dirtyTabIds, next),
    })
    persistTabs(next, nextActiveId)
  },

  closeTabsToRight: (tabId) => {
    const { tabs, activeTabId, dirtyTabIds } = get()
    const index = tabs.findIndex((tab) => tab.id === tabId)
    // Stop when the tab is unknown or has no tabs to its right.
    if (index === -1 || index === tabs.length - 1) return
    // Preserve pinned tabs for the same reason that "Close Others" preserves them.
    const doomed = tabs.slice(index + 1).filter((tab) => !tab.pinned)
    if (doomed.length === 0) return
    const doomedIds = new Set(doomed.map((tab) => tab.id))
    const next = tabs.filter((tab) => !doomedIds.has(tab.id))
    // Activate the anchor when the current tab is in the closed range.
    const nextActiveId = next.some((tab) => tab.id === activeTabId)
      ? activeTabId
      : (next[next.length - 1]?.id ?? null)
    if (doomed.some((tab) => dirtyTabIds.includes(tab.id))) {
      set({
        pendingTabClose: { tabIds: doomed.map((tab) => tab.id), nextActiveTabId: nextActiveId },
      })
      return
    }
    discardClosedState(doomed)
    set({
      tabs: next,
      activeTabId: nextActiveId,
      activeTool: derivedActiveTool(next, nextActiveId),
      tabMru: touchMru(get().tabMru, nextActiveId, next),
      dirtyTabIds: pruneDirty(get().dirtyTabIds, next),
    })
    persistTabs(next, nextActiveId)
  },

  confirmPendingTabClose: () => {
    const { pendingTabClose, tabs, activeTabId } = get()
    if (!pendingTabClose) return
    const doomedIds = new Set(pendingTabClose.tabIds)
    const doomed = tabs.filter((tab) => doomedIds.has(tab.id))
    const next = tabs.filter((tab) => !doomedIds.has(tab.id))
    let nextActiveId = pendingTabClose.nextActiveTabId
    if (nextActiveId !== null && !next.some((tab) => tab.id === nextActiveId)) {
      nextActiveId = null
    }
    if (
      nextActiveId === null &&
      activeTabId !== null &&
      next.some((tab) => tab.id === activeTabId)
    ) {
      nextActiveId = activeTabId
    }
    if (nextActiveId === null) {
      const firstDoomedIndex = tabs.findIndex((tab) => doomedIds.has(tab.id))
      nextActiveId = next[Math.max(0, firstDoomedIndex - 1)]?.id ?? next[0]?.id ?? null
    }
    discardClosedState(doomed)
    set({
      tabs: next,
      activeTabId: nextActiveId,
      activeTool: derivedActiveTool(next, nextActiveId),
      tabMru: touchMru(get().tabMru, nextActiveId, next),
      dirtyTabIds: pruneDirty(get().dirtyTabIds, next),
      pendingTabClose: null,
    })
    persistTabs(next, nextActiveId)
  },

  cancelPendingTabClose: () => set({ pendingTabClose: null }),
  setActiveTab: (tabId) => {
    const { tabs } = get()
    if (!tabs.some((tab) => tab.id === tabId)) return
    const activeTool = derivedActiveTool(tabs, tabId)
    set({ activeTabId: tabId, activeTool, tabMru: touchMru(get().tabMru, tabId, tabs) })
    persistTabs(tabs, tabId)
  },
  setTabDirty: (tabId, dirty) => {
    const { dirtyTabIds, tabs } = get()
    const already = dirtyTabIds.includes(tabId)
    if (already === dirty) return
    // Ignore unknown ids. A tool that unmounts after closure must not restore a dirty flag that pruning removed.
    if (dirty && !tabs.some((tab) => tab.id === tabId)) return
    set({
      dirtyTabIds: dirty ? [...dirtyTabIds, tabId] : dirtyTabIds.filter((id) => id !== tabId),
    })
  },
  restoreTabs: (tabs, activeTabId) => {
    // Tabs may lack state keys. Assign missing keys before sorting restored tabs.
    const keyed = sortPinnedFirst(assignStateKeys(tabs))
    const activeTool = derivedActiveTool(keyed, activeTabId)
    set({ tabs: keyed, activeTabId, activeTool, tabMru: touchMru([], activeTabId, keyed) })
    // Do not persist here. This action only restores startup state.
  },
  setActiveTool: (toolId) => {
    get().openTab(toolId)
  },
  restoreActiveTool: (toolId) => {
    const tab: WorkspaceTab = { id: crypto.randomUUID(), toolId, stateKey: toolId }
    set({ tabs: [tab], activeTabId: tab.id, activeTool: toolId, tabMru: [tab.id] })
  },
  recentToolIds: [],
  trackRecent: (toolId) => {
    set((state) => ({
      recentToolIds: [toolId, ...state.recentToolIds.filter((id) => id !== toolId)].slice(
        0,
        MAX_RECENT
      ),
    }))
  },
}))
