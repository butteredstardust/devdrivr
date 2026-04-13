/**
 * Tests for WorkspaceTabStrip UX improvements:
 * 1. Bottom pill indicator on the active tab
 * 2. Right-click context menu: Close / Close Others / Close to Right
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useUiStore } from '@/stores/ui.store'
import { WorkspaceTabStrip } from '@/components/shell/WorkspaceTabStrip'

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

vi.mock('@/app/tool-registry', () => ({
  getToolById: (id: string) => ({ id, name: id, toolId: id, icon: '•', description: '' }),
  TOOLS: [],
}))

// ── Helpers ────────────────────────────────────────────────────────

function seedTabs(toolIds: string[]) {
  const tabs = toolIds.map((toolId) => ({ id: crypto.randomUUID(), toolId }))
  const activeTabId = tabs[0]?.id ?? null
  useUiStore.setState({ tabs, activeTabId, activeTool: tabs[0]?.toolId ?? '' })
  return tabs
}

beforeEach(() => {
  cleanup()
  useUiStore.setState({ tabs: [], activeTabId: null, activeTool: '' })
  vi.clearAllMocks()
})

// ── Pill indicator ─────────────────────────────────────────────────

describe('WorkspaceTabStrip — active tab pill indicator', () => {
  it('renders a pill span inside the active tab', () => {
    const [activeTab] = seedTabs(['json-tools', 'base64'])
    render(<WorkspaceTabStrip />)

    // The active tab div contains a span with the bottom pill classes
    const pill = document
      .querySelector(`[data-tab-id="${activeTab!.id}"]`)
      ?.querySelector('[aria-hidden="true"]')

    expect(pill).not.toBeNull()
    expect(pill!.className).toContain('bottom-0')
    expect(pill!.className).toContain('rounded-t-full')
  })

  it('does not render a pill on inactive tabs', () => {
    const [, inactiveTab] = seedTabs(['json-tools', 'base64'])
    render(<WorkspaceTabStrip />)

    const pill = document
      .querySelector(`[data-tab-id="${inactiveTab!.id}"]`)
      ?.querySelector('[aria-hidden="true"]')

    expect(pill).toBeNull()
  })

  it('moves the pill to the newly activated tab', () => {
    const [firstTab, secondTab] = seedTabs(['json-tools', 'base64'])
    render(<WorkspaceTabStrip />)

    // Activate the second tab
    fireEvent.click(document.querySelector(`[data-tab-id="${secondTab!.id}"]`)!)

    const pillOnFirst = document
      .querySelector(`[data-tab-id="${firstTab!.id}"]`)
      ?.querySelector('[aria-hidden="true"]')
    const pillOnSecond = document
      .querySelector(`[data-tab-id="${secondTab!.id}"]`)
      ?.querySelector('[aria-hidden="true"]')

    expect(pillOnFirst).toBeNull()
    expect(pillOnSecond).not.toBeNull()
  })
})

// ── Context menu ───────────────────────────────────────────────────

describe('WorkspaceTabStrip — context menu', () => {
  it('shows the context menu on right-click', () => {
    const [tab] = seedTabs(['json-tools'])
    render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tab!.id}"]`)!)
    expect(screen.getByText('Close')).toBeInTheDocument()
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
