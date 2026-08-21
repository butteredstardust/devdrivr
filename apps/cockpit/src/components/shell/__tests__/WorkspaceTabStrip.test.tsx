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

// Several tests below swap a store action for a spy. `setState` merges, so those
// spies survive into every later test unless they are put back — which is how a
// behavioural assertion further down ends up watching a mock close nothing.
const realTabActions = {
  closeTab: useUiStore.getState().closeTab,
  closeOtherTabs: useUiStore.getState().closeOtherTabs,
  closeTabsToRight: useUiStore.getState().closeTabsToRight,
}

beforeEach(() => {
  cleanup()
  useUiStore.setState({
    ...realTabActions,
    tabs: [],
    activeTabId: null,
    activeTool: '',
    tabMru: [],
    dirtyTabIds: [],
  })
  vi.clearAllMocks()
})

/**
 * Reordering runs on pointer events, not HTML5 drag-and-drop — Tauri's native
 * drag-drop handler (which `useFileDropZone` needs) swallows in-page
 * dragover/drop on macOS, so a `draggable` tab never moved in the real window.
 *
 * jsdom has no layout, so every tab reports a zero-width rect at x=0. The
 * strip hit-tests `clientX` against each tab's midpoint, and against a zero
 * rect any positive x reads as "after" and any negative x as "before" — which
 * is enough to drive both directions deterministically.
 */
function layOutTabs(widths: number[]) {
  const nodes = [...document.querySelectorAll<HTMLElement>('[data-tab-id]')]
  let left = 0
  for (const [index, node] of nodes.entries()) {
    const width = widths[index] ?? 100
    const rect = { left, right: left + width, width, top: 0, bottom: 30, height: 30, x: left, y: 0 }
    node.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect
    left += width
  }
}

function dragTab(tabId: string, toClientX: number) {
  const node = document.querySelector(`[data-tab-id="${tabId}"]`)!
  fireEvent.pointerDown(node, { button: 0, clientX: 0 })
  fireEvent.pointerMove(window, { clientX: toClientX })
  fireEvent.pointerUp(window, { clientX: toClientX })
}

describe('WorkspaceTabStrip — drag reordering', () => {
  it('moves a dragged tab past the last tab', () => {
    const [first, second, third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    render(<WorkspaceTabStrip />)
    layOutTabs([100, 100, 100])

    dragTab(first!.id, 290)

    expect(useUiStore.getState().tabs.map((tab) => tab.id)).toEqual([
      second!.id,
      third!.id,
      first!.id,
    ])
  })

  it('moves a dragged tab to the head of the strip', () => {
    const [first, second, third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    render(<WorkspaceTabStrip />)
    layOutTabs([100, 100, 100])

    dragTab(third!.id, 10)

    expect(useUiStore.getState().tabs.map((tab) => tab.id)).toEqual([
      third!.id,
      first!.id,
      second!.id,
    ])
  })

  it('leaves the order alone when the pointer never passes the threshold', () => {
    const [first, second, third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    render(<WorkspaceTabStrip />)
    layOutTabs([100, 100, 100])
    const node = document.querySelector(`[data-tab-id="${first!.id}"]`)!

    // 2px of jitter is a click, not a drag.
    fireEvent.pointerDown(node, { button: 0, clientX: 0 })
    fireEvent.pointerMove(window, { clientX: 2 })
    fireEvent.pointerUp(window, { clientX: 2 })

    expect(useUiStore.getState().tabs.map((tab) => tab.id)).toEqual([
      first!.id,
      second!.id,
      third!.id,
    ])
  })

  it('selects the tab on a click, but not at the end of a drag', () => {
    const [first, , third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    render(<WorkspaceTabStrip />)
    layOutTabs([100, 100, 100])
    const thirdNode = document.querySelector(`[data-tab-id="${third!.id}"]`)!

    // A plain click selects.
    fireEvent.pointerDown(thirdNode, { button: 0, clientX: 0 })
    fireEvent.pointerUp(window, { clientX: 0 })
    fireEvent.click(thirdNode)
    expect(useUiStore.getState().activeTabId).toBe(third!.id)

    // A drag of the first tab must not also make it active — one gesture, one
    // change, and the reorder is the change that was asked for.
    dragTab(first!.id, 290)
    fireEvent.click(document.querySelector(`[data-tab-id="${first!.id}"]`)!)
    expect(useUiStore.getState().activeTabId).toBe(third!.id)
  })

  it('lets the next click through when the drag produced no click of its own', async () => {
    const [first, second, third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    useUiStore.setState({ activeTabId: first!.id })
    render(<WorkspaceTabStrip />)
    layOutTabs([100, 100, 100])

    dragTab(first!.id, 290)

    // Measured in Chromium: a drag that releases over a different element emits
    // no click at all. Suppression armed at pointerup and left waiting for one
    // therefore stayed armed, and the user's next click — an ordinary click on
    // an ordinary tab — was the one that got eaten. It has to expire instead.
    await new Promise((resolve) => setTimeout(resolve, 0))

    const secondNode = document.querySelector(`[data-tab-id="${second!.id}"]`)!
    fireEvent.pointerDown(secondNode, { button: 0, clientX: 0 })
    fireEvent.pointerUp(window, { clientX: 0 })
    fireEvent.click(secondNode)

    expect(useUiStore.getState().activeTabId).toBe(second!.id)
    expect(useUiStore.getState().tabs.map((tab) => tab.id)).toEqual([
      second!.id,
      third!.id,
      first!.id,
    ])
  })

  it('still swallows the click when the drag ended over the tab it started on', () => {
    const [first, , third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    useUiStore.setState({ activeTabId: third!.id })
    render(<WorkspaceTabStrip />)
    layOutTabs([100, 100, 100])

    // Short drag: past the 4px threshold, but the release is still inside the
    // first tab, so the browser does emit a click on it. Activating the tab off
    // the back of a reorder would be a second change from one gesture.
    const node = document.querySelector(`[data-tab-id="${first!.id}"]`)!
    fireEvent.pointerDown(node, { button: 0, clientX: 0 })
    fireEvent.pointerMove(window, { clientX: 60 })
    fireEvent.pointerUp(window, { clientX: 60 })
    fireEvent.click(node)

    expect(useUiStore.getState().activeTabId).toBe(third!.id)
  })

  it('abandons the drag when the window loses focus mid-gesture', () => {
    const [first, second, third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    render(<WorkspaceTabStrip />)
    layOutTabs([100, 100, 100])

    // Holding the button and switching away: the release happens somewhere this
    // window never hears about, so no pointerup or pointercancel arrives.
    fireEvent.pointerDown(document.querySelector(`[data-tab-id="${first!.id}"]`)!, {
      button: 0,
      clientX: 0,
    })
    fireEvent.pointerMove(window, { clientX: 150 })
    fireEvent.blur(window)

    // A later plain click must be read as a click, not as the tail of the drag
    // that was left in flight — otherwise it moves a tab nobody touched.
    const secondNode = document.querySelector(`[data-tab-id="${second!.id}"]`)!
    fireEvent.pointerDown(secondNode, { button: 0, clientX: 0 })
    fireEvent.pointerUp(window, { clientX: 0 })
    fireEvent.click(secondNode)

    expect(useUiStore.getState().tabs.map((tab) => tab.id)).toEqual([
      first!.id,
      second!.id,
      third!.id,
    ])
    expect(useUiStore.getState().activeTabId).toBe(second!.id)
  })

  it('ignores a right-button press, which belongs to the context menu', () => {
    const [first, second, third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    render(<WorkspaceTabStrip />)
    layOutTabs([100, 100, 100])
    const node = document.querySelector(`[data-tab-id="${first!.id}"]`)!

    fireEvent.pointerDown(node, { button: 2, clientX: 0 })
    fireEvent.pointerMove(window, { clientX: 290 })
    fireEvent.pointerUp(window, { clientX: 290 })

    expect(useUiStore.getState().tabs.map((tab) => tab.id)).toEqual([
      first!.id,
      second!.id,
      third!.id,
    ])
  })

  it('abandons the drag when the pointer is cancelled', () => {
    const [first, second, third] = seedTabs(['json-tools', 'base64', 'hash-generator'])
    render(<WorkspaceTabStrip />)
    layOutTabs([100, 100, 100])
    const node = document.querySelector(`[data-tab-id="${first!.id}"]`)!

    fireEvent.pointerDown(node, { button: 0, clientX: 0 })
    fireEvent.pointerMove(window, { clientX: 290 })
    fireEvent.pointerCancel(window)
    fireEvent.pointerUp(window, { clientX: 290 })

    expect(useUiStore.getState().tabs.map((tab) => tab.id)).toEqual([
      first!.id,
      second!.id,
      third!.id,
    ])
  })

  it('will not drag an unpinned tab into the pinned block', () => {
    const tabs = seedTabs(['json-tools', 'base64', 'hash-generator'])
    act(() => useUiStore.getState().toggleTabPinned(tabs[0]!.id))
    render(<WorkspaceTabStrip />)
    layOutTabs([36, 100, 100])
    const order = useUiStore.getState().tabs.map((tab) => tab.id)

    // Aim the last tab at the very start of the strip, ahead of the pin.
    dragTab(tabs[2]!.id, 2)

    expect(useUiStore.getState().tabs.map((tab) => tab.id)).toEqual(order)
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

/**
 * This Testing Library build has no `fireEvent.auxClick`, so the auxclick
 * event is constructed directly. `button: 1` is the part under test — the
 * handler ignores every other button.
 *
 * `MouseEvent` is taken off the element's own window rather than the global:
 * this environment exposes the DOM constructors on `window` but does not hoist
 * them, so the bare identifier is undefined.
 */
function middleClick(element: HTMLElement) {
  const view = element.ownerDocument.defaultView!
  fireEvent(
    element,
    new view.MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true })
  )
}

describe('WorkspaceTabStrip — pinned tabs', () => {
  it('drops the label and the close button, leaving the icon to identify the tab', () => {
    const tabs = seedTabs(['json-tools', 'diff-viewer'])
    act(() => useUiStore.getState().toggleTabPinned(tabs[1]!.id))
    render(<WorkspaceTabStrip />)

    const pinned = screen.getByRole('tab', { name: 'diff-viewer (pinned)' })
    expect(pinned.textContent).toBe('')
    expect(screen.getByTestId('icon-diff-viewer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Close diff-viewer/ })).not.toBeInTheDocument()
  })

  it('names the pinned tab for assistive technology, which cannot see the icon', () => {
    const tabs = seedTabs(['json-tools'])
    act(() => useUiStore.getState().toggleTabPinned(tabs[0]!.id))
    render(<WorkspaceTabStrip />)

    expect(screen.getByRole('tab', { name: 'json-tools (pinned)' })).toBeInTheDocument()
  })

  it('ignores middle-click, so the pin actually protects the tab', () => {
    const tabs = seedTabs(['json-tools', 'diff-viewer'])
    act(() => useUiStore.getState().toggleTabPinned(tabs[1]!.id))
    render(<WorkspaceTabStrip />)

    middleClick(screen.getByRole('tab', { name: 'diff-viewer (pinned)' }))

    expect(useUiStore.getState().tabs).toHaveLength(2)
  })

  it('closes an unpinned tab on middle-click, as before', () => {
    seedTabs(['json-tools', 'diff-viewer'])
    render(<WorkspaceTabStrip />)

    middleClick(screen.getByRole('tab', { name: 'diff-viewer' }))

    expect(useUiStore.getState().tabs).toHaveLength(1)
  })

  it('pins on double-click', () => {
    const tabs = seedTabs(['json-tools', 'diff-viewer'])
    render(<WorkspaceTabStrip />)

    fireEvent.doubleClick(screen.getByRole('tab', { name: 'diff-viewer' }))

    expect(useUiStore.getState().tabs.find((t) => t.id === tabs[1]!.id)?.pinned).toBe(true)
  })

  it('offers Pin in the context menu and Unpin once pinned', () => {
    const tabs = seedTabs(['json-tools'])
    const { rerender } = render(<WorkspaceTabStrip />)

    fireEvent.contextMenu(screen.getByRole('tab', { name: 'json-tools' }))
    expect(screen.getByText('Pin Tab')).toBeInTheDocument()

    act(() => useUiStore.getState().toggleTabPinned(tabs[0]!.id))
    rerender(<WorkspaceTabStrip />)
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'json-tools (pinned)' }))
    expect(screen.getByText('Unpin Tab')).toBeInTheDocument()
  })

  it('rules off the end of the pinned block', () => {
    const tabs = seedTabs(['json-tools', 'diff-viewer'])
    act(() => useUiStore.getState().toggleTabPinned(tabs[1]!.id))
    render(<WorkspaceTabStrip />)

    expect(screen.getByTestId('tab-pinned-divider')).toBeInTheDocument()
  })

  it('disables Close Others when only pinned tabs would survive anyway', () => {
    const tabs = seedTabs(['json-tools', 'diff-viewer'])
    act(() => useUiStore.getState().toggleTabPinned(tabs[1]!.id))
    render(<WorkspaceTabStrip />)

    // Right-click the one unpinned tab: everything else is pinned, so the
    // command would close nothing.
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'json-tools' }))

    expect(screen.getByText('Close Others')).toBeDisabled()
  })
})

/**
 * The overflow control only exists when the strip is actually overflowing, and
 * jsdom has no layout: every element reports 0 for both widths, so the strip
 * always believes it fits. These stubs are the whole difference.
 */
function withOverflowingStrip(run: () => void) {
  const scrollWidth = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'scrollWidth')
  const clientWidth = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'clientWidth')
  Object.defineProperty(window.HTMLElement.prototype, 'scrollWidth', {
    value: 900,
    configurable: true,
  })
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
    value: 300,
    configurable: true,
  })
  try {
    run()
  } finally {
    if (scrollWidth) Object.defineProperty(window.HTMLElement.prototype, 'scrollWidth', scrollWidth)
    if (clientWidth) Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', clientWidth)
  }
}

describe('WorkspaceTabStrip — overflow menu', () => {
  it('stays out of the way while every tab is visible', () => {
    seedTabs(['json-tools', 'diff-viewer'])
    render(<WorkspaceTabStrip />)

    expect(screen.queryByRole('button', { name: 'Show all open tools' })).not.toBeInTheDocument()
  })

  it('appears once tabs are scrolled out of view', () => {
    withOverflowingStrip(() => {
      seedTabs(['json-tools', 'diff-viewer', 'base64'])
      render(<WorkspaceTabStrip />)

      expect(screen.getByRole('button', { name: 'Show all open tools' })).toBeInTheDocument()
    })
  })

  it('lists every open tab, including the ones off screen', () => {
    withOverflowingStrip(() => {
      seedTabs(['json-tools', 'diff-viewer', 'base64'])
      render(<WorkspaceTabStrip />)

      fireEvent.click(screen.getByRole('button', { name: 'Show all open tools' }))

      const items = screen.getAllByRole('menuitem')
      expect(items.map((item) => item.textContent)).toEqual(['json-tools', 'diff-viewer', 'base64'])
    })
  })

  it('numbers duplicate tools so the entries stay distinguishable', () => {
    withOverflowingStrip(() => {
      seedTabs(['json-tools', 'json-tools', 'base64'])
      render(<WorkspaceTabStrip />)

      fireEvent.click(screen.getByRole('button', { name: 'Show all open tools' }))

      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'json-tools 1',
        'json-tools 2',
        'base64',
      ])
    })
  })

  it('activates the chosen tab and closes itself', () => {
    withOverflowingStrip(() => {
      const tabs = seedTabs(['json-tools', 'diff-viewer', 'base64'])
      render(<WorkspaceTabStrip />)

      fireEvent.click(screen.getByRole('button', { name: 'Show all open tools' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'base64' }))

      expect(useUiStore.getState().activeTabId).toBe(tabs[2]!.id)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('closes on an outside mousedown', () => {
    withOverflowingStrip(() => {
      seedTabs(['json-tools', 'diff-viewer', 'base64'])
      render(<WorkspaceTabStrip />)

      fireEvent.click(screen.getByRole('button', { name: 'Show all open tools' }))
      expect(screen.getByRole('menu')).toBeInTheDocument()

      fireEvent.mouseDown(document.body)

      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('reports its expanded state to assistive technology', () => {
    withOverflowingStrip(() => {
      seedTabs(['json-tools', 'diff-viewer', 'base64'])
      render(<WorkspaceTabStrip />)
      const trigger = screen.getByRole('button', { name: 'Show all open tools' })

      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(trigger)
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })
})

// ── Keeping the active tab in view ─────────────────────────────────
//
// The reveal effect used to key only on `[activeTabId, tabs]`, so it fired when
// you *selected* a tab and never again. Everything else that can push the active
// tab out of view — opening the notes drawer, collapsing or dragging the sidebar,
// resizing the window — changes the strip's width without touching either
// dependency, and left you looking at a strip with no visible active tab.
//
// jsdom has neither layout nor `ResizeObserver`, so both are stubbed here. That
// makes this a test of the *wiring* (does a resize reach `scrollIntoView`, and
// with which behaviour) rather than of the scrolling itself, which is the part
// that was actually missing.
describe('WorkspaceTabStrip — reveal on resize', () => {
  function withResizeObserver(run: (trigger: () => void) => void) {
    const callbacks: (() => void)[] = []
    class StubResizeObserver {
      constructor(cb: () => void) {
        callbacks.push(cb)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    const original = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
    Object.defineProperty(globalThis, 'ResizeObserver', {
      value: StubResizeObserver,
      configurable: true,
      writable: true,
    })
    const scrollIntoView = vi.fn()
    window.Element.prototype.scrollIntoView = scrollIntoView
    try {
      run(() => callbacks.forEach((cb) => cb()))
    } finally {
      if (original) Object.defineProperty(globalThis, 'ResizeObserver', original)
      else delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
      delete (window.Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  }

  it('scrolls the active tab back into view when the strip is resized', () => {
    withResizeObserver((resize) => {
      seedTabs(['json-tools', 'diff-viewer', 'base64'])
      render(<WorkspaceTabStrip />)

      const scrollIntoView = window.Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>
      scrollIntoView.mockClear()

      act(() => resize())

      expect(scrollIntoView).toHaveBeenCalled()
      // `auto`, not `smooth`: a sidebar resize-drag fires this on every frame,
      // and nine overlapping smooth scrolls fight each other.
      expect(scrollIntoView).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }))
    })
  })

  it('does nothing when there is no active tab to reveal', () => {
    withResizeObserver((resize) => {
      useUiStore.setState({ tabs: [], activeTabId: null, activeTool: '', tabMru: [] })
      render(<WorkspaceTabStrip />)

      const scrollIntoView = window.Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>
      scrollIntoView.mockClear()

      act(() => resize())

      expect(scrollIntoView).not.toHaveBeenCalled()
    })
  })
})
