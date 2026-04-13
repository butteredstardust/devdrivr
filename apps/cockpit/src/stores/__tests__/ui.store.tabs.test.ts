import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useUiStore } from '../ui.store'
import { setSetting } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

function resetStore() {
  useUiStore.setState({
    tabs: [],
    activeTabId: null,
    activeTool: '',
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
    expect(state.tabs).toEqual(tabs)
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
