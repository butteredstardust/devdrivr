/**
 * Tests for WorkspaceTabStrip UX improvements:
 * 1. Top pill indicator on the active tab
 * 2. Separators between adjacent inactive tabs
 * 3. Unsaved-work indicator
 * 4. Drag reordering
 * 5. Right-click context menu: Close / Duplicate / Close Others / Close to Right
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useUiStore } from '@/stores/ui.store'
import { WorkspaceTabStrip } from '@/components/shell/WorkspaceTabStrip'

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

vi.mock('@/app/tool-registry', () => ({
  getToolById: (id: string) => ({
    id,
    name: id,
    toolId: id,
    icon: <svg data-testid={`icon-${id}`} />,
    description: '',
  }),
  TOOLS: [],
}))

// ── Helpers ────────────────────────────────────────────────────────

function seedTabs(toolIds: string[]) {
  const tabs = toolIds.map((toolId) => ({ id: crypto.randomUUID(), toolId }))
  const activeTabId = tabs[0]?.id ?? null
  useUiStore.setState({
    tabs,
    activeTabId,
    activeTool: tabs[0]?.toolId ?? '',
    tabMru: activeTabId ? [activeTabId] : [],
  })
  return tabs
}

beforeEach(() => {
  cleanup()
  useUiStore.setState({
    tabs: [],
    activeTabId: null,
    activeTool: '',
    tabMru: [],
    dirtyTabIds: [],
  })
  vi.clearAllMocks()
})

describe('WorkspaceTabStrip — drag reordering', () => {
  it('moves a dragged tab to the indicated edge of another tab', () => {
    const [first, second, third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    render(<WorkspaceTabStrip />)
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
    }
    const firstElement = document.querySelector(`[data-tab-id="${first!.id}"]`)!
    const thirdElement = document.querySelector(`[data-tab-id="${third!.id}"]`)!

    fireEvent.dragStart(firstElement, { dataTransfer })
    fireEvent.dragOver(thirdElement, { clientX: 1, dataTransfer })
    fireEvent.drop(thirdElement, { clientX: 1, dataTransfer })

    expect(useUiStore.getState().tabs.map((tab) => tab.id)).toEqual([
      second!.id,
      third!.id,
      first!.id,
    ])
  })
})

// ── Pill indicator ─────────────────────────────────────────────────

describe('WorkspaceTabStrip — active tab pill indicator', () => {
  it('renders a pill span inside the active tab', () => {
    const [activeTab] = seedTabs(['json-tools', 'base64'])
    render(<WorkspaceTabStrip />)

    const pill = document
      .querySelector(`[data-tab-id="${activeTab!.id}"]`)
      ?.querySelector('[data-testid="tab-pill"]')

    // Top edge, not bottom: the strip sits above the panel, so the active tab
    // should read as continuous with the content below it. A bottom pill drew
    // a bright line across precisely the seam that wants to disappear.
    expect(pill).not.toBeNull()
    expect(pill!.className).toContain('top-0')
    expect(pill!.className).toContain('rounded-b-full')
  })

  it('does not render a pill on inactive tabs', () => {
    const [, inactiveTab] = seedTabs(['json-tools', 'base64'])
    render(<WorkspaceTabStrip />)

    const pill = document
      .querySelector(`[data-tab-id="${inactiveTab!.id}"]`)
      ?.querySelector('[data-testid="tab-pill"]')

    expect(pill).toBeNull()
  })

  it('moves the pill to the newly activated tab', () => {
    const [firstTab, secondTab] = seedTabs(['json-tools', 'base64'])
    render(<WorkspaceTabStrip />)

    // Activate the second tab
    fireEvent.click(document.querySelector(`[data-tab-id="${secondTab!.id}"]`)!)

    const pillOnFirst = document
      .querySelector(`[data-tab-id="${firstTab!.id}"]`)
      ?.querySelector('[data-testid="tab-pill"]')
    const pillOnSecond = document
      .querySelector(`[data-tab-id="${secondTab!.id}"]`)
      ?.querySelector('[data-testid="tab-pill"]')

    expect(pillOnFirst).toBeNull()
    expect(pillOnSecond).not.toBeNull()
  })
})

// ── Separators ─────────────────────────────────────────────────────

describe('WorkspaceTabStrip — separators', () => {
  const separatorIn = (tabId: string) =>
    document
      .querySelector(`[data-tab-id="${tabId}"]`)
      ?.querySelector('[data-testid="tab-separator"]')

  it('separates adjacent inactive tabs', () => {
    // Active is first, so second/third are adjacent inactives.
    const [, second] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    render(<WorkspaceTabStrip />)
    expect(separatorIn(second!.id)).not.toBeNull()
  })

  it('omits the separator next to the active tab, whose fill is its own edge', () => {
    const [first, second, third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    useUiStore.setState({ activeTabId: third!.id })
    render(<WorkspaceTabStrip />)

    // second precedes the active tab → suppressed; first precedes second → kept.
    expect(separatorIn(second!.id)).toBeNull()
    expect(separatorIn(first!.id)).not.toBeNull()
  })

  it('omits the separator on the last tab', () => {
    const [, , third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    render(<WorkspaceTabStrip />)
    expect(separatorIn(third!.id)).toBeNull()
  })
})

// ── Dirty indicator ────────────────────────────────────────────────

describe('WorkspaceTabStrip — unsaved-work indicator', () => {
  it('marks a tab reported dirty and leaves the others alone', () => {
    const [first, second] = seedTabs(['markdown-editor', 'base64'])
    useUiStore.setState({ dirtyTabIds: [first!.id] })
    render(<WorkspaceTabStrip />)

    const dotIn = (tabId: string) =>
      document
        .querySelector(`[data-tab-id="${tabId}"]`)
        ?.querySelector('[data-testid="tab-dirty-dot"]')

    expect(dotIn(first!.id)).not.toBeNull()
    expect(dotIn(second!.id)).toBeNull()
  })

  it('says so in the close button label, which is the accessible surface', () => {
    const [first] = seedTabs(['markdown-editor'])
    useUiStore.setState({ dirtyTabIds: [first!.id] })
    render(<WorkspaceTabStrip />)

    // The dot itself is aria-hidden decoration; the label carries the meaning.
    expect(
      screen.getByRole('button', { name: 'Close markdown-editor (unsaved changes)' })
    ).toBeInTheDocument()
  })

  it('drops the mark once the tool reports itself saved', () => {
    const [first] = seedTabs(['markdown-editor'])
    useUiStore.setState({ dirtyTabIds: [first!.id] })
    render(<WorkspaceTabStrip />)

    act(() => useUiStore.getState().setTabDirty(first!.id, false))

    expect(
      document
        .querySelector(`[data-tab-id="${first!.id}"]`)
        ?.querySelector('[data-testid="tab-dirty-dot"]')
    ).toBeNull()
  })
})

// ── Context menu ───────────────────────────────────────────────────

describe('WorkspaceTabStrip — context menu', () => {
  it('shows the context menu on right-click', () => {
    const [tab] = seedTabs(['json-tools'])
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tab!.id}"]`)!)
    expect(screen.getByText('Close')).toBeInTheDocument()
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
    expect(screen.getByText('Close Others')).toBeInTheDocument()
    expect(screen.getByText('Close to Right')).toBeInTheDocument()
  })

  it('hides the context menu after clicking Close', () => {
    const [tab] = seedTabs(['json-tools', 'base64'])
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tab!.id}"]`)!)
    fireEvent.click(screen.getByText('Close'))
    expect(screen.queryByText('Close Others')).toBeNull()
  })

  it('Close calls closeTab with the right tabId', () => {
    const closeTab = vi.fn()
    useUiStore.setState({ closeTab } as never)
    const [tab] = seedTabs(['json-tools', 'base64'])
    // Re-inject closeTab after seedTabs overwrites state
    useUiStore.setState({ closeTab } as never)
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tab!.id}"]`)!)
    fireEvent.click(screen.getByText('Close'))
    expect(closeTab).toHaveBeenCalledWith(tab!.id)
  })

  it('Duplicate opens another instance of the selected tool', () => {
    const openTabInstance = vi.fn()
    const [tab] = seedTabs(['json-tools'])
    useUiStore.setState({ openTabInstance } as never)
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tab!.id}"]`)!)
    fireEvent.click(screen.getByText('Duplicate'))

    expect(openTabInstance).toHaveBeenCalledWith('json-tools')
  })

  it('Close Others calls closeOtherTabs with the right tabId', () => {
    const closeOtherTabs = vi.fn()
    const [tab] = seedTabs(['json-tools', 'base64'])
    useUiStore.setState({ closeOtherTabs } as never)
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tab!.id}"]`)!)
    fireEvent.click(screen.getByText('Close Others'))
    expect(closeOtherTabs).toHaveBeenCalledWith(tab!.id)
  })

  it('Close to Right calls closeTabsToRight with the right tabId', () => {
    const closeTabsToRight = vi.fn()
    const [tab] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    useUiStore.setState({ closeTabsToRight } as never)
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tab!.id}"]`)!)
    fireEvent.click(screen.getByText('Close to Right'))
    expect(closeTabsToRight).toHaveBeenCalledWith(tab!.id)
  })

  it('Close Others is disabled when only one tab is open', () => {
    const [tab] = seedTabs(['json-tools'])
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tab!.id}"]`)!)
    expect(screen.getByText('Close Others')).toBeDisabled()
  })

  it('Close to Right is disabled when the tab is the last one', () => {
    const tabs = seedTabs(['json-tools', 'base64'])
    const lastTab = tabs[tabs.length - 1]!
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${lastTab.id}"]`)!)
    expect(screen.getByText('Close to Right')).toBeDisabled()
  })

  it('Close to Right is enabled when there are tabs to the right', () => {
    const [firstTab] = seedTabs(['json-tools', 'base64'])
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${firstTab!.id}"]`)!)
    expect(screen.getByText('Close to Right')).not.toBeDisabled()
  })

  it('closes the context menu on Escape', () => {
    const [tab] = seedTabs(['json-tools'])
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tab!.id}"]`)!)
    expect(screen.getByText('Close')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Close')).toBeNull()
  })

  it('closes the context menu on outside mousedown', () => {
    const [tab] = seedTabs(['json-tools'])
    render(
      <div>
        <button data-testid="outside">outside</button>
        <WorkspaceTabStrip />
      </div>
    )

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tab!.id}"]`)!)
    expect(screen.getByText('Close')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Close')).toBeNull()
  })
})

// ── Tool icons ─────────────────────────────────────────────────────

describe('WorkspaceTabStrip — tool icons', () => {
  it("renders each tab's registry icon before its label", () => {
    seedTabs(['json-tools', 'base64'])
    render(<WorkspaceTabStrip />)

    expect(screen.getByTestId('icon-json-tools')).toBeInTheDocument()
    expect(screen.getByTestId('icon-base64')).toBeInTheDocument()
  })

  it('marks the icon as decorative so it is excluded from the accessible name', () => {
    seedTabs(['json-tools'])
    render(<WorkspaceTabStrip />)

    const icon = screen.getByTestId('icon-json-tools')
    const wrapper = icon.closest('[aria-hidden="true"]')
    expect(wrapper).not.toBeNull()

    const tab = screen.getByRole('tab')
    expect(tab).toHaveAccessibleName('json-tools')
  })

  it('still renders and truncates all tabs with icons when six or more are open', () => {
    const toolIds = ['json-tools', 'base64', 'hash-generator', 'url-codec', 'jwt-decoder', 'nord']
    seedTabs(toolIds)
    render(<WorkspaceTabStrip />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(6)
    for (const id of toolIds) {
      expect(screen.getByTestId(`icon-${id}`)).toBeInTheDocument()
    }
  })
})
