import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useUiStore } from '../ui.store'
import { setSetting, deleteToolState } from '@/lib/db'
import { useToolStateCache } from '@/stores/tool-state.store'

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
  deleteToolState: vi.fn().mockResolvedValue(undefined),
}))

function resetStore() {
  useUiStore.setState({
    tabs: [],
    activeTabId: null,
    activeTool: '',
    tabMru: [],
    dirtyTabIds: [],
    recentToolIds: [],
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
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTabInstance('json-tools')
    const duplicate = useUiStore.getState().tabs[1]!
    useToolStateCache.getState().set(duplicate.stateKey!, { input: 'scratch' })

    useUiStore.getState().closeTab(duplicate.id)

    expect(deleteToolState).toHaveBeenCalledWith(duplicate.stateKey)
    expect(useToolStateCache.getState().get(duplicate.stateKey!)).toBeUndefined()
    // The pane unmounts after this and would save the row straight back.
    expect(useToolStateCache.getState().isDiscarded(duplicate.stateKey!)).toBe(true)
  })

  it('keeps the row behind a bare key, which is how work comes back', () => {
    useUiStore.getState().openTab('json-tools')
    const only = useUiStore.getState().tabs[0]!

    useUiStore.getState().closeTab(only.id)

    expect(deleteToolState).not.toHaveBeenCalled()
    expect(useToolStateCache.getState().isDiscarded('json-tools')).toBe(false)
  })

  it('sweeps duplicates closed in bulk', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTabInstance('json-tools')
    useUiStore.getState().openTabInstance('json-tools')
    const [first, second, third] = useUiStore.getState().tabs

    useUiStore.getState().closeOtherTabs(first!.id)

    expect(deleteToolState).toHaveBeenCalledWith(second!.stateKey)
    expect(deleteToolState).toHaveBeenCalledWith(third!.stateKey)
    expect(deleteToolState).toHaveBeenCalledTimes(2)
  })

  it('sweeps duplicates closed to the right', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTabInstance('json-tools')
    const second = useUiStore.getState().tabs[1]!

    useUiStore.getState().closeTabsToRight(useUiStore.getState().tabs[0]!.id)

    expect(deleteToolState).toHaveBeenCalledWith(second.stateKey)
  })
})

describe('openTab', () => {
  it('creates a new tab when no tab with that toolId exists', () => {
    useUiStore.getState().openTab('json-tools')
    const { tabs, activeTabId, activeTool } = useUiStore.getState()
    expect(tabs).toHaveLength(1)
    expect(tabs[0]!.toolId).toBe('json-tools')
    expect(activeTabId).toBe(tabs[0]!.id)
    expect(activeTool).toBe('json-tools')
  })

  it('focuses the existing tab instead of creating a duplicate', () => {
    useUiStore.getState().openTab('json-tools')
    const firstId = useUiStore.getState().tabs[0]!.id

    useUiStore.getState().openTab('code-formatter')
    useUiStore.getState().openTab('json-tools') // re-open

    const { tabs, activeTabId } = useUiStore.getState()
    expect(tabs).toHaveLength(2)
    expect(activeTabId).toBe(firstId)
  })

  it('focuses the most recently used duplicate instead of the leftmost one', () => {
    useUiStore.getState().openTab('json-tools')
    const firstId = useUiStore.getState().activeTabId
    useUiStore.getState().openTabInstance('json-tools')
    const secondId = useUiStore.getState().activeTabId
    useUiStore.getState().openTab('base64')

    useUiStore.getState().openTab('json-tools')

    expect(firstId).not.toBe(secondId)
    expect(useUiStore.getState().activeTabId).toBe(secondId)
    expect(useUiStore.getState().tabs).toHaveLength(3)
  })

  it('adds toolId to recentToolIds', () => {
    useUiStore.getState().openTab('regex-tester')
    expect(useUiStore.getState().recentToolIds[0]).toBe('regex-tester')
  })
})

describe('closeTab', () => {
  it('removes the tab from the list', () => {
    useUiStore.getState().openTab('json-tools')
    const tabId = useUiStore.getState().tabs[0]!.id
    useUiStore.getState().closeTab(tabId)
    expect(useUiStore.getState().tabs).toHaveLength(0)
  })

  it('activates the tab before the closed one when closing the active tab', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('code-formatter')
    const firstTabId = useUiStore.getState().tabs[0]!.id
    const secondTabId = useUiStore.getState().tabs[1]!.id

    // second tab is active — close it
    useUiStore.getState().closeTab(secondTabId)

    const { activeTabId, activeTool } = useUiStore.getState()
    expect(activeTabId).toBe(firstTabId)
    expect(activeTool).toBe('json-tools')
  })

  it('activates the next tab when closing the first tab', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('code-formatter')
    const firstTabId = useUiStore.getState().tabs[0]!.id
    const secondTabId = useUiStore.getState().tabs[1]!.id

    // activate first then close it
    useUiStore.getState().setActiveTab(firstTabId)
    useUiStore.getState().closeTab(firstTabId)

    const { activeTabId } = useUiStore.getState()
    expect(activeTabId).toBe(secondTabId)
  })

  it('sets activeTool to empty string when the last tab is closed', () => {
    useUiStore.getState().openTab('json-tools')
    const tabId = useUiStore.getState().tabs[0]!.id
    useUiStore.getState().closeTab(tabId)
    expect(useUiStore.getState().activeTool).toBe('')
    expect(useUiStore.getState().activeTabId).toBeNull()
  })

  it('is a no-op for an unknown tabId', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().closeTab('not-a-real-id')
    expect(useUiStore.getState().tabs).toHaveLength(1)
  })
})

describe('setActiveTab', () => {
  it('changes activeTabId and syncs activeTool', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('code-formatter')
    const firstTabId = useUiStore.getState().tabs[0]!.id

    useUiStore.getState().setActiveTab(firstTabId)

    expect(useUiStore.getState().activeTabId).toBe(firstTabId)
    expect(useUiStore.getState().activeTool).toBe('json-tools')
  })

  it('is a no-op when tabId does not exist', () => {
    useUiStore.getState().openTab('json-tools')
    const originalActiveTabId = useUiStore.getState().activeTabId

    useUiStore.getState().setActiveTab('ghost-id')

    expect(useUiStore.getState().activeTabId).toBe(originalActiveTabId)
  })
})

describe('restoreTabs', () => {
  it('restores tabs and activeTabId without calling setSetting', () => {
    vi.clearAllMocks() // clear any calls from beforeEach setup
    const tabs = [
      { id: 'tab-a', toolId: 'json-tools' },
      { id: 'tab-b', toolId: 'code-formatter' },
    ]
    useUiStore.getState().restoreTabs(tabs, 'tab-b')

    const state = useUiStore.getState()
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
    useUiStore.getState().setActiveTool('base64')
    const { tabs, activeTool } = useUiStore.getState()
    expect(tabs).toHaveLength(1)
    expect(activeTool).toBe('base64')
  })
})

describe('restoreActiveTool (backward compat)', () => {
  it('restores a single tab without calling setSetting', () => {
    vi.clearAllMocks()
    useUiStore.getState().restoreActiveTool('base64')
    const state = useUiStore.getState()
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTool).toBe('base64')
    expect(setSetting).not.toHaveBeenCalled()
  })
})

describe('closeOtherTabs', () => {
  it('keeps only the given tab and closes all others', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('code-formatter')
    useUiStore.getState().openTab('base64')
    const midId = useUiStore.getState().tabs[1]!.id

    useUiStore.getState().closeOtherTabs(midId)

    const { tabs, activeTabId } = useUiStore.getState()
    expect(tabs).toHaveLength(1)
    expect(tabs[0]!.id).toBe(midId)
    expect(activeTabId).toBe(midId)
  })

  it('is a no-op when there is only one tab', () => {
    useUiStore.getState().openTab('json-tools')
    const tabId = useUiStore.getState().tabs[0]!.id
    const callsBefore = (setSetting as ReturnType<typeof vi.fn>).mock.calls.length

    useUiStore.getState().closeOtherTabs(tabId)

    expect(useUiStore.getState().tabs).toHaveLength(1)
    expect((setSetting as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it('is a no-op when tabId is unknown', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().closeOtherTabs('does-not-exist')
    expect(useUiStore.getState().tabs).toHaveLength(1)
  })

  it('activates the kept tab even if a different tab was active', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('code-formatter')
    useUiStore.getState().openTab('base64')
    const firstId = useUiStore.getState().tabs[0]!.id
    // active tab is currently 'base64' (last opened)

    useUiStore.getState().closeOtherTabs(firstId)

    expect(useUiStore.getState().activeTabId).toBe(firstId)
    expect(useUiStore.getState().activeTool).toBe('json-tools')
  })
})

describe('closeTabsToRight', () => {
  it('removes all tabs after the given one', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('code-formatter')
    useUiStore.getState().openTab('base64')
    const firstId = useUiStore.getState().tabs[0]!.id

    useUiStore.getState().closeTabsToRight(firstId)

    const { tabs } = useUiStore.getState()
    expect(tabs).toHaveLength(1)
    expect(tabs[0]!.toolId).toBe('json-tools')
  })

  it('is a no-op when the tab is the last one', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('code-formatter')
    const lastId = useUiStore.getState().tabs[1]!.id
    const callsBefore = (setSetting as ReturnType<typeof vi.fn>).mock.calls.length

    useUiStore.getState().closeTabsToRight(lastId)

    expect(useUiStore.getState().tabs).toHaveLength(2)
    expect((setSetting as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it('preserves the active tab when it is in the kept range', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('code-formatter')
    useUiStore.getState().openTab('base64')
    const firstId = useUiStore.getState().tabs[0]!.id
    useUiStore.getState().setActiveTab(firstId)

    useUiStore.getState().closeTabsToRight(firstId)

    expect(useUiStore.getState().activeTabId).toBe(firstId)
  })

  it('activates the anchor tab when the active tab is in the closed range', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('code-formatter')
    useUiStore.getState().openTab('base64')
    const firstId = useUiStore.getState().tabs[0]!.id
    // active is 'base64' (last opened), which is to the right of firstId

    useUiStore.getState().closeTabsToRight(firstId)

    expect(useUiStore.getState().activeTabId).toBe(firstId)
    expect(useUiStore.getState().activeTool).toBe('json-tools')
  })
})

describe('state keys', () => {
  it('gives the first tab of a tool the bare tool id', () => {
    useUiStore.getState().openTab('json-tools')
    expect(useUiStore.getState().tabs[0]!.stateKey).toBe('json-tools')
  })

  it('scopes a second tab of the same tool to its own key', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTabInstance('json-tools')

    const [first, second] = useUiStore.getState().tabs
    expect(first!.stateKey).toBe('json-tools')
    expect(second!.stateKey).toBe(`json-tools#${second!.id}`)
    expect(second!.stateKey).not.toBe(first!.stateKey)
  })

  it('hands the bare key to a later tab once the tab holding it has closed', () => {
    useUiStore.getState().openTab('json-tools')
    const firstId = useUiStore.getState().tabs[0]!.id
    useUiStore.getState().closeTab(firstId)

    useUiStore.getState().openTab('json-tools')
    // Reopening a closed tool has always given you your work back, and the
    // bare key is where that work is.
    expect(useUiStore.getState().tabs[0]!.stateKey).toBe('json-tools')
  })

  it("leaves a surviving tab's key alone when a sibling closes", () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTabInstance('json-tools')
    const [first, second] = useUiStore.getState().tabs
    const secondKey = second!.stateKey

    useUiStore.getState().closeTab(first!.id)

    // Re-keying the survivor would swap the state out from under a live tab.
    expect(useUiStore.getState().tabs[0]!.stateKey).toBe(secondKey)
  })
})

describe('openTabInstance', () => {
  it('always opens another tab, unlike openTab', () => {
    useUiStore.getState().openTab('base64')
    useUiStore.getState().openTab('base64')
    expect(useUiStore.getState().tabs).toHaveLength(1)

    useUiStore.getState().openTabInstance('base64')
    expect(useUiStore.getState().tabs).toHaveLength(2)
    expect(useUiStore.getState().activeTabId).toBe(useUiStore.getState().tabs[1]!.id)
  })
})

describe('tabMru', () => {
  it('lists the most recently active tab first', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('base64')
    const [a, b] = useUiStore.getState().tabs

    expect(useUiStore.getState().tabMru).toEqual([b!.id, a!.id])

    useUiStore.getState().setActiveTab(a!.id)
    expect(useUiStore.getState().tabMru).toEqual([a!.id, b!.id])
  })

  it('drops closed tabs so they cannot hold a keep-alive slot', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('base64')
    const [a, b] = useUiStore.getState().tabs

    useUiStore.getState().closeTab(b!.id)

    expect(useUiStore.getState().tabMru).toEqual([a!.id])
  })
})

describe('reorderTab', () => {
  it('moves a tab and persists the new order', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('base64')
    useUiStore.getState().openTab('code-formatter')
    const ids = useUiStore.getState().tabs.map((t) => t.id)
    vi.clearAllMocks()

    useUiStore.getState().reorderTab(ids[2]!, 0)

    expect(useUiStore.getState().tabs.map((t) => t.id)).toEqual([ids[2], ids[0], ids[1]])
    expect(setSetting).toHaveBeenCalledWith('openTabs', useUiStore.getState().tabs)
  })

  it('clamps an out-of-range index instead of losing the tab', () => {
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTab('base64')
    const ids = useUiStore.getState().tabs.map((t) => t.id)

    useUiStore.getState().reorderTab(ids[0]!, 99)

    expect(useUiStore.getState().tabs.map((t) => t.id)).toEqual([ids[1], ids[0]])
  })

  it('ignores a tab id it does not know', () => {
    useUiStore.getState().openTab('json-tools')
    const before = useUiStore.getState().tabs

    useUiStore.getState().reorderTab('nope', 0)

    expect(useUiStore.getState().tabs).toBe(before)
  })
})

describe('setTabDirty', () => {
  it('marks and unmarks a tab', () => {
    useUiStore.getState().openTab('markdown-editor')
    const [tab] = useUiStore.getState().tabs

    useUiStore.getState().setTabDirty(tab!.id, true)
    expect(useUiStore.getState().dirtyTabIds).toEqual([tab!.id])

    useUiStore.getState().setTabDirty(tab!.id, false)
    expect(useUiStore.getState().dirtyTabIds).toEqual([])
  })

  it('does not record the same tab twice', () => {
    useUiStore.getState().openTab('markdown-editor')
    const [tab] = useUiStore.getState().tabs

    useUiStore.getState().setTabDirty(tab!.id, true)
    const after = useUiStore.getState().dirtyTabIds
    useUiStore.getState().setTabDirty(tab!.id, true)

    // Same array identity — a no-op must not re-render every subscriber.
    expect(useUiStore.getState().dirtyTabIds).toBe(after)
  })

  it('ignores an unknown tab id', () => {
    // A tool unmounting after its tab closed must not resurrect the flag that
    // closing the tab just pruned.
    useUiStore.getState().setTabDirty('nope', true)
    expect(useUiStore.getState().dirtyTabIds).toEqual([])
  })

  it('forgets the flag when the tab is closed', () => {
    useUiStore.getState().openTab('markdown-editor')
    useUiStore.getState().openTab('base64')
    const [first, second] = useUiStore.getState().tabs
    useUiStore.getState().setTabDirty(first!.id, true)
    useUiStore.getState().setTabDirty(second!.id, true)

    useUiStore.getState().closeTab(first!.id)

    expect(useUiStore.getState().dirtyTabIds).toEqual([second!.id])
  })

  it('forgets the flags of every tab closed by Close Others', () => {
    useUiStore.getState().openTab('markdown-editor')
    useUiStore.getState().openTab('base64')
    useUiStore.getState().openTab('html-validator')
    const tabs = useUiStore.getState().tabs
    for (const tab of tabs) useUiStore.getState().setTabDirty(tab.id, true)

    useUiStore.getState().closeOtherTabs(tabs[1]!.id)

    expect(useUiStore.getState().dirtyTabIds).toEqual([tabs[1]!.id])
  })

  it('forgets the flags of tabs closed to the right', () => {
    useUiStore.getState().openTab('markdown-editor')
    useUiStore.getState().openTab('base64')
    useUiStore.getState().openTab('html-validator')
    const tabs = useUiStore.getState().tabs
    for (const tab of tabs) useUiStore.getState().setTabDirty(tab.id, true)

    useUiStore.getState().closeTabsToRight(tabs[0]!.id)

    expect(useUiStore.getState().dirtyTabIds).toEqual([tabs[0]!.id])
  })
})
