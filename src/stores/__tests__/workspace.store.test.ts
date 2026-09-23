import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useWorkspaceStore } from '../workspace.store'
import { setSetting, deleteToolState } from '@/lib/db'
import { useToolStateCache } from '@/stores/tool-state.store'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
  deleteToolState: vi.fn().mockResolvedValue(undefined),
}))

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    activeTool: '',
    tabMru: [],
    dirtyTabIds: [],
    recentToolIds: [],
  })
  useUiStore.setState({
    commandPaletteOpen: false,
    lastAction: null,
    toasts: [],
    settingsPanelOpen: false,
    pendingSendTo: null,
    shortcutsModalOpen: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetStore()
  useToolStateCache.setState({ cache: new Map(), seeds: new Map(), discarded: new Set() })
})

describe('closing a tab and its state', () => {
  it('deletes the row of a duplicate tab, which nothing can reach again', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTabInstance('json-tools')
    const duplicate = useWorkspaceStore.getState().tabs[1]!
    useToolStateCache.getState().set(duplicate.stateKey!, { input: 'scratch' })

    useWorkspaceStore.getState().closeTab(duplicate.id)

    expect(deleteToolState).toHaveBeenCalledWith(duplicate.stateKey)
    expect(useToolStateCache.getState().get(duplicate.stateKey!)).toBeUndefined()
    // The pane unmounts after this and would save the row straight back.
    expect(useToolStateCache.getState().isDiscarded(duplicate.stateKey!)).toBe(true)
  })

  it('keeps the row behind a bare key, which is how work comes back', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    const only = useWorkspaceStore.getState().tabs[0]!

    useWorkspaceStore.getState().closeTab(only.id)

    expect(deleteToolState).not.toHaveBeenCalled()
    expect(useToolStateCache.getState().isDiscarded('json-tools')).toBe(false)
  })

  it('sweeps duplicates closed in bulk', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTabInstance('json-tools')
    useWorkspaceStore.getState().openTabInstance('json-tools')
    const [first, second, third] = useWorkspaceStore.getState().tabs

    useWorkspaceStore.getState().closeOtherTabs(first!.id)

    expect(deleteToolState).toHaveBeenCalledWith(second!.stateKey)
    expect(deleteToolState).toHaveBeenCalledWith(third!.stateKey)
    expect(deleteToolState).toHaveBeenCalledTimes(2)
  })

  it('sweeps duplicates closed to the right', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTabInstance('json-tools')
    const second = useWorkspaceStore.getState().tabs[1]!

    useWorkspaceStore.getState().closeTabsToRight(useWorkspaceStore.getState().tabs[0]!.id)

    expect(deleteToolState).toHaveBeenCalledWith(second.stateKey)
  })
})

describe('openTab', () => {
  it('creates a new tab when no tab with that toolId exists', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    const { tabs, activeTabId, activeTool } = useWorkspaceStore.getState()
    expect(tabs).toHaveLength(1)
    expect(tabs[0]!.toolId).toBe('json-tools')
    expect(activeTabId).toBe(tabs[0]!.id)
    expect(activeTool).toBe('json-tools')
  })

  it('focuses the existing tab instead of creating a duplicate', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    const firstId = useWorkspaceStore.getState().tabs[0]!.id

    useWorkspaceStore.getState().openTab('code-formatter')
    useWorkspaceStore.getState().openTab('json-tools') // re-open

    const { tabs, activeTabId } = useWorkspaceStore.getState()
    expect(tabs).toHaveLength(2)
    expect(activeTabId).toBe(firstId)
  })

  it('focuses the most recently used duplicate instead of the leftmost one', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    const firstId = useWorkspaceStore.getState().activeTabId
    useWorkspaceStore.getState().openTabInstance('json-tools')
    const secondId = useWorkspaceStore.getState().activeTabId
    useWorkspaceStore.getState().openTab('base64')

    useWorkspaceStore.getState().openTab('json-tools')

    expect(firstId).not.toBe(secondId)
    expect(useWorkspaceStore.getState().activeTabId).toBe(secondId)
    expect(useWorkspaceStore.getState().tabs).toHaveLength(3)
  })

  it('adds toolId to recentToolIds', () => {
    useWorkspaceStore.getState().openTab('regex-tester')
    expect(useWorkspaceStore.getState().recentToolIds[0]).toBe('regex-tester')
  })
})

describe('closeTab', () => {
  it('removes the tab from the list', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    const tabId = useWorkspaceStore.getState().tabs[0]!.id
    useWorkspaceStore.getState().closeTab(tabId)
    expect(useWorkspaceStore.getState().tabs).toHaveLength(0)
  })

  it('activates the tab before the closed one when closing the active tab', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('code-formatter')
    const firstTabId = useWorkspaceStore.getState().tabs[0]!.id
    const secondTabId = useWorkspaceStore.getState().tabs[1]!.id

    // second tab is active — close it
    useWorkspaceStore.getState().closeTab(secondTabId)

    const { activeTabId, activeTool } = useWorkspaceStore.getState()
    expect(activeTabId).toBe(firstTabId)
    expect(activeTool).toBe('json-tools')
  })

  it('activates the next tab when closing the first tab', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('code-formatter')
    const firstTabId = useWorkspaceStore.getState().tabs[0]!.id
    const secondTabId = useWorkspaceStore.getState().tabs[1]!.id

    // activate first then close it
    useWorkspaceStore.getState().setActiveTab(firstTabId)
    useWorkspaceStore.getState().closeTab(firstTabId)

    const { activeTabId } = useWorkspaceStore.getState()
    expect(activeTabId).toBe(secondTabId)
  })

  it('sets activeTool to empty string when the last tab is closed', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    const tabId = useWorkspaceStore.getState().tabs[0]!.id
    useWorkspaceStore.getState().closeTab(tabId)
    expect(useWorkspaceStore.getState().activeTool).toBe('')
    expect(useWorkspaceStore.getState().activeTabId).toBeNull()
  })

  it('is a no-op for an unknown tabId', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().closeTab('not-a-real-id')
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1)
  })
})

describe('setActiveTab', () => {
  it('changes activeTabId and syncs activeTool', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('code-formatter')
    const firstTabId = useWorkspaceStore.getState().tabs[0]!.id

    useWorkspaceStore.getState().setActiveTab(firstTabId)

    expect(useWorkspaceStore.getState().activeTabId).toBe(firstTabId)
    expect(useWorkspaceStore.getState().activeTool).toBe('json-tools')
  })

  it('is a no-op when tabId does not exist', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    const originalActiveTabId = useWorkspaceStore.getState().activeTabId

    useWorkspaceStore.getState().setActiveTab('ghost-id')

    expect(useWorkspaceStore.getState().activeTabId).toBe(originalActiveTabId)
  })
})

describe('restoreTabs', () => {
  it('restores tabs and activeTabId without calling setSetting', () => {
    vi.clearAllMocks() // clear any calls from beforeEach setup
    const tabs = [
      { id: 'tab-a', toolId: 'json-tools' },
      { id: 'tab-b', toolId: 'code-formatter' },
    ]
    useWorkspaceStore.getState().restoreTabs(tabs, 'tab-b')

    const state = useWorkspaceStore.getState()
    // Restored tabs gain state keys; a session saved before duplicates existed
    // has none, and each tool's only tab keeps the bare id it wrote under.
    expect(state.tabs).toEqual([
      { id: 'tab-a', toolId: 'json-tools', stateKey: 'json-tools' },
      { id: 'tab-b', toolId: 'code-formatter', stateKey: 'code-formatter' },
    ])
    expect(state.activeTabId).toBe('tab-b')
    expect(state.activeTool).toBe('code-formatter')
    expect(setSetting).not.toHaveBeenCalled()
  })
})

describe('setActiveTool (backward compat)', () => {
  it('delegates to openTab', () => {
    useWorkspaceStore.getState().setActiveTool('base64')
    const { tabs, activeTool } = useWorkspaceStore.getState()
    expect(tabs).toHaveLength(1)
    expect(activeTool).toBe('base64')
  })
})

describe('restoreActiveTool (backward compat)', () => {
  it('restores a single tab without calling setSetting', () => {
    vi.clearAllMocks()
    useWorkspaceStore.getState().restoreActiveTool('base64')
    const state = useWorkspaceStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTool).toBe('base64')
    expect(setSetting).not.toHaveBeenCalled()
  })
})

describe('closeOtherTabs', () => {
  it('keeps only the given tab and closes all others', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('code-formatter')
    useWorkspaceStore.getState().openTab('base64')
    const midId = useWorkspaceStore.getState().tabs[1]!.id

    useWorkspaceStore.getState().closeOtherTabs(midId)

    const { tabs, activeTabId } = useWorkspaceStore.getState()
    expect(tabs).toHaveLength(1)
    expect(tabs[0]!.id).toBe(midId)
    expect(activeTabId).toBe(midId)
  })

  it('is a no-op when there is only one tab', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    const tabId = useWorkspaceStore.getState().tabs[0]!.id
    const callsBefore = (setSetting as ReturnType<typeof vi.fn>).mock.calls.length

    useWorkspaceStore.getState().closeOtherTabs(tabId)

    expect(useWorkspaceStore.getState().tabs).toHaveLength(1)
    expect((setSetting as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it('is a no-op when tabId is unknown', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().closeOtherTabs('does-not-exist')
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1)
  })

  it('activates the kept tab even if a different tab was active', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('code-formatter')
    useWorkspaceStore.getState().openTab('base64')
    const firstId = useWorkspaceStore.getState().tabs[0]!.id
    // active tab is currently 'base64' (last opened)

    useWorkspaceStore.getState().closeOtherTabs(firstId)

    expect(useWorkspaceStore.getState().activeTabId).toBe(firstId)
    expect(useWorkspaceStore.getState().activeTool).toBe('json-tools')
  })
})

describe('closeTabsToRight', () => {
  it('removes all tabs after the given one', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('code-formatter')
    useWorkspaceStore.getState().openTab('base64')
    const firstId = useWorkspaceStore.getState().tabs[0]!.id

    useWorkspaceStore.getState().closeTabsToRight(firstId)

    const { tabs } = useWorkspaceStore.getState()
    expect(tabs).toHaveLength(1)
    expect(tabs[0]!.toolId).toBe('json-tools')
  })

  it('is a no-op when the tab is the last one', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('code-formatter')
    const lastId = useWorkspaceStore.getState().tabs[1]!.id
    const callsBefore = (setSetting as ReturnType<typeof vi.fn>).mock.calls.length

    useWorkspaceStore.getState().closeTabsToRight(lastId)

    expect(useWorkspaceStore.getState().tabs).toHaveLength(2)
    expect((setSetting as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it('preserves the active tab when it is in the kept range', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('code-formatter')
    useWorkspaceStore.getState().openTab('base64')
    const firstId = useWorkspaceStore.getState().tabs[0]!.id
    useWorkspaceStore.getState().setActiveTab(firstId)

    useWorkspaceStore.getState().closeTabsToRight(firstId)

    expect(useWorkspaceStore.getState().activeTabId).toBe(firstId)
  })

  it('activates the anchor tab when the active tab is in the closed range', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('code-formatter')
    useWorkspaceStore.getState().openTab('base64')
    const firstId = useWorkspaceStore.getState().tabs[0]!.id
    // active is 'base64' (last opened), which is to the right of firstId

    useWorkspaceStore.getState().closeTabsToRight(firstId)

    expect(useWorkspaceStore.getState().activeTabId).toBe(firstId)
    expect(useWorkspaceStore.getState().activeTool).toBe('json-tools')
  })
})

describe('state keys', () => {
  it('gives the first tab of a tool the bare tool id', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    expect(useWorkspaceStore.getState().tabs[0]!.stateKey).toBe('json-tools')
  })

  it('scopes a second tab of the same tool to its own key', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTabInstance('json-tools')

    const [first, second] = useWorkspaceStore.getState().tabs
    expect(first!.stateKey).toBe('json-tools')
    expect(second!.stateKey).toBe(`json-tools#${second!.id}`)
    expect(second!.stateKey).not.toBe(first!.stateKey)
  })

  it('hands the bare key to a later tab once the tab holding it has closed', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    const firstId = useWorkspaceStore.getState().tabs[0]!.id
    useWorkspaceStore.getState().closeTab(firstId)

    useWorkspaceStore.getState().openTab('json-tools')
    // Reopening a closed tool has always given you your work back, and the
    // bare key is where that work is.
    expect(useWorkspaceStore.getState().tabs[0]!.stateKey).toBe('json-tools')
  })

  it("leaves a surviving tab's key alone when a sibling closes", () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTabInstance('json-tools')
    const [first, second] = useWorkspaceStore.getState().tabs
    const secondKey = second!.stateKey

    useWorkspaceStore.getState().closeTab(first!.id)

    // Re-keying the survivor would swap the state out from under a live tab.
    expect(useWorkspaceStore.getState().tabs[0]!.stateKey).toBe(secondKey)
  })
})

describe('openTabInstance', () => {
  it('always opens another tab, unlike openTab', () => {
    useWorkspaceStore.getState().openTab('base64')
    useWorkspaceStore.getState().openTab('base64')
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1)

    useWorkspaceStore.getState().openTabInstance('base64')
    expect(useWorkspaceStore.getState().tabs).toHaveLength(2)
    expect(useWorkspaceStore.getState().activeTabId).toBe(useWorkspaceStore.getState().tabs[1]!.id)
  })
})

describe('tabMru', () => {
  it('lists the most recently active tab first', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('base64')
    const [a, b] = useWorkspaceStore.getState().tabs

    expect(useWorkspaceStore.getState().tabMru).toEqual([b!.id, a!.id])

    useWorkspaceStore.getState().setActiveTab(a!.id)
    expect(useWorkspaceStore.getState().tabMru).toEqual([a!.id, b!.id])
  })

  it('drops closed tabs so they cannot hold a keep-alive slot', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('base64')
    const [a, b] = useWorkspaceStore.getState().tabs

    useWorkspaceStore.getState().closeTab(b!.id)

    expect(useWorkspaceStore.getState().tabMru).toEqual([a!.id])
  })
})

describe('reorderTab', () => {
  it('moves a tab and persists the new order', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('base64')
    useWorkspaceStore.getState().openTab('code-formatter')
    const ids = useWorkspaceStore.getState().tabs.map((t) => t.id)
    vi.clearAllMocks()

    useWorkspaceStore.getState().reorderTab(ids[2]!, 0)

    expect(useWorkspaceStore.getState().tabs.map((t) => t.id)).toEqual([ids[2], ids[0], ids[1]])
    expect(setSetting).toHaveBeenCalledWith('openTabs', useWorkspaceStore.getState().tabs)
  })

  it('clamps an out-of-range index instead of losing the tab', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    useWorkspaceStore.getState().openTab('base64')
    const ids = useWorkspaceStore.getState().tabs.map((t) => t.id)

    useWorkspaceStore.getState().reorderTab(ids[0]!, 99)

    expect(useWorkspaceStore.getState().tabs.map((t) => t.id)).toEqual([ids[1], ids[0]])
  })

  it('ignores a tab id it does not know', () => {
    useWorkspaceStore.getState().openTab('json-tools')
    const before = useWorkspaceStore.getState().tabs

    useWorkspaceStore.getState().reorderTab('nope', 0)

    expect(useWorkspaceStore.getState().tabs).toBe(before)
  })
})

describe('setTabDirty', () => {
  it('marks and unmarks a tab', () => {
    useWorkspaceStore.getState().openTab('markdown-editor')
    const [tab] = useWorkspaceStore.getState().tabs

    useWorkspaceStore.getState().setTabDirty(tab!.id, true)
    expect(useWorkspaceStore.getState().dirtyTabIds).toEqual([tab!.id])

    useWorkspaceStore.getState().setTabDirty(tab!.id, false)
    expect(useWorkspaceStore.getState().dirtyTabIds).toEqual([])
  })

  it('does not record the same tab twice', () => {
    useWorkspaceStore.getState().openTab('markdown-editor')
    const [tab] = useWorkspaceStore.getState().tabs

    useWorkspaceStore.getState().setTabDirty(tab!.id, true)
    const after = useWorkspaceStore.getState().dirtyTabIds
    useWorkspaceStore.getState().setTabDirty(tab!.id, true)

    // Same array identity — a no-op must not re-render every subscriber.
    expect(useWorkspaceStore.getState().dirtyTabIds).toBe(after)
  })

  it('ignores an unknown tab id', () => {
    // A tool unmounting after its tab closed must not resurrect the flag that
    // closing the tab just pruned.
    useWorkspaceStore.getState().setTabDirty('nope', true)
    expect(useWorkspaceStore.getState().dirtyTabIds).toEqual([])
  })

  it('forgets the flag when the tab is closed', () => {
    useWorkspaceStore.getState().openTab('markdown-editor')
    useWorkspaceStore.getState().openTab('base64')
    const [first, second] = useWorkspaceStore.getState().tabs
    useWorkspaceStore.getState().setTabDirty(first!.id, true)
    useWorkspaceStore.getState().setTabDirty(second!.id, true)

    // Closing a dirty tab now asks first (SH-02); the flag is dropped once the close goes through.
    useWorkspaceStore.getState().closeTab(first!.id)
    useWorkspaceStore.getState().confirmPendingTabClose()

    expect(useWorkspaceStore.getState().dirtyTabIds).toEqual([second!.id])
  })

  it('forgets the flags of every tab closed by Close Others', () => {
    useWorkspaceStore.getState().openTab('markdown-editor')
    useWorkspaceStore.getState().openTab('base64')
    useWorkspaceStore.getState().openTab('html-validator')
    const tabs = useWorkspaceStore.getState().tabs
    for (const tab of tabs) useWorkspaceStore.getState().setTabDirty(tab.id, true)

    useWorkspaceStore.getState().closeOtherTabs(tabs[1]!.id)
    useWorkspaceStore.getState().confirmPendingTabClose()

    expect(useWorkspaceStore.getState().dirtyTabIds).toEqual([tabs[1]!.id])
  })

  it('forgets the flags of tabs closed to the right', () => {
    useWorkspaceStore.getState().openTab('markdown-editor')
    useWorkspaceStore.getState().openTab('base64')
    useWorkspaceStore.getState().openTab('html-validator')
    const tabs = useWorkspaceStore.getState().tabs
    for (const tab of tabs) useWorkspaceStore.getState().setTabDirty(tab.id, true)

    useWorkspaceStore.getState().closeTabsToRight(tabs[0]!.id)
    useWorkspaceStore.getState().confirmPendingTabClose()

    expect(useWorkspaceStore.getState().dirtyTabIds).toEqual([tabs[0]!.id])
  })
})

describe('pinned tabs', () => {
  /** Opens `count` tabs and returns them in strip order. */
  function openTabs(...toolIds: string[]) {
    for (const id of toolIds) useWorkspaceStore.getState().openTabInstance(id)
    return useWorkspaceStore.getState().tabs
  }

  it('moves a newly pinned tab to the front of the strip', () => {
    const [first, second, third] = openTabs('json-tools', 'diff-viewer', 'regex-tester')

    useWorkspaceStore.getState().toggleTabPinned(third!.id)

    expect(useWorkspaceStore.getState().tabs.map((t) => t.id)).toEqual([
      third!.id,
      first!.id,
      second!.id,
    ])
    expect(useWorkspaceStore.getState().tabs[0]!.pinned).toBe(true)
  })

  it('returns an unpinned tab to the head of the unpinned block, not the front of the strip', () => {
    const [first, second, third] = openTabs('json-tools', 'diff-viewer', 'regex-tester')
    useWorkspaceStore.getState().toggleTabPinned(first!.id)
    useWorkspaceStore.getState().toggleTabPinned(third!.id)
    // Order is now [first(pinned), third(pinned), second]

    useWorkspaceStore.getState().toggleTabPinned(third!.id)

    // third lands behind the remaining pin rather than staying at index 0,
    // which is where the pin had hoisted it.
    expect(useWorkspaceStore.getState().tabs.map((t) => t.id)).toEqual([
      first!.id,
      third!.id,
      second!.id,
    ])
    expect(useWorkspaceStore.getState().tabs.map((t) => !!t.pinned)).toEqual([true, false, false])
  })

  it('keeps pinned tabs through Close Others', () => {
    const [first, second, third] = openTabs('json-tools', 'diff-viewer', 'regex-tester')
    useWorkspaceStore.getState().toggleTabPinned(first!.id)

    useWorkspaceStore.getState().closeOtherTabs(third!.id)

    const ids = useWorkspaceStore.getState().tabs.map((t) => t.id)
    expect(ids).toContain(first!.id)
    expect(ids).toContain(third!.id)
    expect(ids).not.toContain(second!.id)
    // The anchor stays active — it is the tab the user acted on.
    expect(useWorkspaceStore.getState().activeTabId).toBe(third!.id)
  })

  it('keeps pinned tabs through Close to Right', () => {
    const [first, second, third] = openTabs('json-tools', 'diff-viewer', 'regex-tester')
    // Pin the last, which sorts it to the front, then anchor on what is now
    // index 1 so a pinned tab is genuinely to its left and none to its right.
    useWorkspaceStore.getState().toggleTabPinned(third!.id)
    useWorkspaceStore.getState().toggleTabPinned(second!.id)

    // Order is now [third(pinned), second(pinned), first]
    useWorkspaceStore.getState().closeTabsToRight(third!.id)

    expect(useWorkspaceStore.getState().tabs.map((t) => t.id)).toEqual([third!.id, second!.id])
    expect(useWorkspaceStore.getState().tabs.map((t) => t.id)).not.toContain(first!.id)
  })

  it('refuses to drag an unpinned tab into the pinned block', () => {
    const [first, second] = openTabs('json-tools', 'diff-viewer')
    useWorkspaceStore.getState().toggleTabPinned(first!.id)

    // Index 0 is inside the pinned block; the move is clamped to index 1,
    // which is where the tab already is, so nothing happens.
    useWorkspaceStore.getState().reorderTab(second!.id, 0)

    expect(useWorkspaceStore.getState().tabs.map((t) => t.id)).toEqual([first!.id, second!.id])
  })

  it('re-sorts a restored session so pins lead, however it was persisted', () => {
    useWorkspaceStore.getState().restoreTabs(
      [
        { id: 'a', toolId: 'json-tools', stateKey: 'json-tools' },
        { id: 'b', toolId: 'diff-viewer', stateKey: 'diff-viewer', pinned: true },
      ],
      'a'
    )

    expect(useWorkspaceStore.getState().tabs.map((t) => t.id)).toEqual(['b', 'a'])
    // Re-sorting must not change which tab is active.
    expect(useWorkspaceStore.getState().activeTabId).toBe('a')
  })

  it('ignores an unknown tab id', () => {
    openTabs('json-tools')
    const before = useWorkspaceStore.getState().tabs

    useWorkspaceStore.getState().toggleTabPinned('nope')

    expect(useWorkspaceStore.getState().tabs).toBe(before)
  })
})

// Persisting used to end in `.catch(() => {})`, so a workspace that failed to save looked exactly
// like one that saved — until the next launch, when the tabs were gone.
describe('reporting a persistence failure', () => {
  const setSettingMock = vi.mocked(setSetting)
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  // The store suppresses repeat reports until a write succeeds, and that flag is module state.
  // A successful persist is the only honest way to clear it between tests.
  beforeEach(async () => {
    setSettingMock.mockResolvedValue(undefined)
    useWorkspaceStore.getState().openTab('json-tools')
    await flush()
    resetStore()
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('raises a toast when the workspace cannot be saved', async () => {
    setSettingMock.mockRejectedValue(new Error('disk full'))

    useWorkspaceStore.getState().openTab('json-tools')
    await flush()

    const toasts = useUiStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]!.type).toBe('error')
    expect(toasts[0]!.message).toContain('disk full')
  })

  it('reports a sustained outage once, not once per tab click', async () => {
    setSettingMock.mockRejectedValue(new Error('disk full'))

    useWorkspaceStore.getState().openTab('json-tools')
    await flush()
    useWorkspaceStore.getState().openTab('diff-viewer')
    await flush()
    useWorkspaceStore.getState().openTab('base64')
    await flush()

    expect(useUiStore.getState().toasts).toHaveLength(1)
  })

  it('reports again after a recovery, since that is a new outage', async () => {
    setSettingMock.mockRejectedValue(new Error('disk full'))
    useWorkspaceStore.getState().openTab('json-tools')
    await flush()

    setSettingMock.mockResolvedValue(undefined)
    useWorkspaceStore.getState().openTab('diff-viewer')
    await flush()

    setSettingMock.mockRejectedValue(new Error('disk full again'))
    useWorkspaceStore.getState().openTab('base64')
    await flush()

    expect(useUiStore.getState().toasts).toHaveLength(2)
  })

  it('stays quiet while saving works', async () => {
    useWorkspaceStore.getState().openTab('json-tools')
    await flush()

    expect(useUiStore.getState().toasts).toHaveLength(0)
  })
})
