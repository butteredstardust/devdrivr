import type { WorkspaceTab } from '@/types/tools'

/**
 * Picks the `tool_state` key for a tab.
 *
 * The bare tool id is the prize: it is the row every version of this app
 * before duplicate tabs wrote to, so whichever tab holds it inherits the
 * user's existing work. It goes to the first open tab of a tool and is only
 * taken by a later one if that tab has since closed. Everything else gets a
 * key scoped to the tab instance, which is what makes two tabs of the same
 * tool independent rather than two views of one state.
 */
export function stateKeyFor(tabs: WorkspaceTab[], toolId: string, tabId: string): string {
  const taken = tabs.some((tab) => tab.id !== tabId && (tab.stateKey ?? tab.toolId) === toolId)
  return taken ? `${toolId}#${tabId}` : toolId
}

/**
 * Fills in keys for tabs restored from a session that predates them, left to
 * right so the leftmost tab of each tool keeps the state it had.
 */
export function assignStateKeys(tabs: WorkspaceTab[]): WorkspaceTab[] {
  const assigned: WorkspaceTab[] = []
  for (const tab of tabs) {
    assigned.push({ ...tab, stateKey: tab.stateKey ?? stateKeyFor(assigned, tab.toolId, tab.id) })
  }
  return assigned
}
