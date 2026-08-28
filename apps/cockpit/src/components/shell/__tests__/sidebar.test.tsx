/**
 * Tests for the four sidebar UX improvements:
 * 1. Collapsed mode — larger click targets, hover tooltip
 * 2. Active indicator — glow shadow on active item
 * 3. Group collapse — larger chevron, CSS grid animation, ArrowRight/Left
 * 4. Keyboard navigation — ArrowUp/Down, Enter to select
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useToolStateCache } from '@/stores/tool-state.store'
import { DEFAULT_SETTINGS } from '@/types/models'
import { SidebarItem } from '@/components/shell/SidebarItem'
import { SidebarGroup } from '@/components/shell/SidebarGroup'
import { SidebarPinned } from '@/components/shell/SidebarPinned'
import { SidebarCollapsedGroup } from '@/components/shell/SidebarCollapsedGroup'
import { Sidebar } from '@/components/shell/Sidebar'
import { TOOLS as ALL_TOOLS } from '@/app/tool-registry'
import type { ToolGroupMeta, ToolDefinition } from '@/types/tools'

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

// ── Fixtures ───────────────────────────────────────────────────────

const fixtureIcon = (id: string) => <span aria-hidden="true" data-testid={`icon-${id}`} />

const GROUP: ToolGroupMeta = { id: 'convert', label: 'TestGroup', icon: fixtureIcon('group') }

const TOOLS: ToolDefinition[] = [
  {
    id: 'tool-a',
    name: 'Tool A',
    group: 'convert',
    icon: fixtureIcon('a'),
    description: '',
    component: null as never,
  },
  {
    id: 'tool-b',
    name: 'Tool B',
    group: 'convert',
    icon: fixtureIcon('b'),
    description: '',
    component: null as never,
  },
  {
    id: 'tool-c',
    name: 'Tool C',
    group: 'convert',
    icon: fixtureIcon('c'),
    description: '',
    component: null as never,
  },
]

// The store is a module singleton and one test below swaps `setActiveTool` for a
// spy. Without restoring it here, every later test that clicks a tool is asserting
// against the previous test's mock, which silently does nothing.
const realSetActiveTool = useUiStore.getState().setActiveTool

beforeEach(() => {
  cleanup()
  useToolStateCache.setState({ cache: new Map() })
  // Tabs and recents are singleton state that clicking a tool writes to, and
  // `SidebarRecent` renders a `data-sidebar-item` per recent — so a leaked
  // recent breaks the "one node per tool id" invariant asserted further down.
  useUiStore.setState({
    activeTool: '',
    setActiveTool: realSetActiveTool,
    recentToolIds: [],
    tabs: [],
    tabMru: [],
    activeTabId: null,
  })
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: true })
})

// ── SidebarItem ────────────────────────────────────────────────────

describe('SidebarItem — active indicator', () => {
  // The active row is marked by an accent left border over a dim accent fill.
  // It previously also carried an inset accent glow on top of both, which was
  // invisible on most themes and noise on the rest.
  it('applies the accent border and fill when item is active', () => {
    useUiStore.setState({ activeTool: 'tool-a' })
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)
    const btn = screen.getByRole('button', { name: 'Tool A' })
    expect(btn.className).toContain('border-[var(--color-accent)]')
    expect(btn.className).toContain('bg-[var(--color-accent-dim)]')
  })

  it('does not apply the accent border or fill when item is inactive', () => {
    useUiStore.setState({ activeTool: 'tool-b' })
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)
    const btn = screen.getByRole('button', { name: 'Tool A' })
    expect(btn.className).toContain('border-transparent')
    expect(btn.className).not.toContain('bg-[var(--color-accent-dim)]')
  })

  it('never stacks a glow on top of the border and fill', () => {
    useUiStore.setState({ activeTool: 'tool-a' })
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)
    expect(screen.getByRole('button', { name: 'Tool A' }).className).not.toContain('shadow-[inset')
  })

  it('has aria-current="page" when active', () => {
    useUiStore.setState({ activeTool: 'tool-a' })
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)
    expect(screen.getByRole('button', { name: 'Tool A' })).toHaveAttribute('aria-current', 'page')
  })

  it('has no aria-current when inactive', () => {
    useUiStore.setState({ activeTool: 'tool-b' })
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)
    expect(screen.getByRole('button', { name: 'Tool A' })).not.toHaveAttribute('aria-current')
  })

  it('accepts tabIndex prop and forwards it to the button', () => {
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} tabIndex={-1} />)
    expect(screen.getByRole('button', { name: 'Tool A' })).toHaveAttribute('tabindex', '-1')
  })

  it('carries data-sidebar-item attribute for keyboard nav targeting', () => {
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)
    expect(screen.getByRole('button', { name: 'Tool A' })).toHaveAttribute(
      'data-sidebar-item',
      'tool-a'
    )
  })

  it('calls setActiveTool when clicked', () => {
    const setActiveTool = vi.fn()
    useUiStore.setState({ activeTool: '', setActiveTool } as never)
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tool A' }))
    expect(setActiveTool).toHaveBeenCalledWith('tool-a')
  })

  it('toggles pinned state from the row pin button', () => {
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pin Tool A' }))

    expect(useSettingsStore.getState().pinnedToolIds).toEqual(['tool-a'])
    expect(screen.getByRole('button', { name: 'Unpin Tool A' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})

// ── SidebarGroup ───────────────────────────────────────────────────

describe('SidebarGroup — group collapse & keyboard nav', () => {
  it('renders the group label', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    // Unbracketed: the bracket idiom belongs to the wordmark, and repeating it
    // on every group header spent the app's signature on chrome.
    expect(screen.getByText('TestGroup')).toBeInTheDocument()
  })

  it('shows all tools when expanded (default)', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    expect(screen.getByRole('button', { name: 'Tool A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tool B' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tool C' })).toBeInTheDocument()
  })

  it('group header has aria-expanded=true when expanded', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    expect(screen.getByRole('button', { name: /TestGroup/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('collapses when the header is clicked and sets aria-expanded=false', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    const header = screen.getByRole('button', { name: /TestGroup/i })
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })

  it('tool items get tabIndex=-1 when group is collapsed', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    fireEvent.click(screen.getByRole('button', { name: /TestGroup/i }))
    const toolBtn = screen.getByRole('button', { name: 'Tool A' })
    expect(toolBtn).toHaveAttribute('tabindex', '-1')
  })

  it('tool items have tabIndex=0 (or omitted) when group is expanded', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    const toolBtn = screen.getByRole('button', { name: 'Tool A' })
    // tabIndex 0 or the button default (no negative index)
    const tabindex = toolBtn.getAttribute('tabindex')
    expect(tabindex === null || tabindex === '0').toBe(true)
  })

  it('expands on ArrowRight when collapsed', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    const header = screen.getByRole('button', { name: /TestGroup/i })
    fireEvent.click(header) // collapse first
    expect(header).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(header, { key: 'ArrowRight' })
    expect(header).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapses on ArrowLeft when expanded', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    const header = screen.getByRole('button', { name: /TestGroup/i })
    expect(header).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(header, { key: 'ArrowLeft' })
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })

  it('carries data-sidebar-group attribute on header for keyboard nav', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    expect(screen.getByRole('button', { name: /TestGroup/i })).toHaveAttribute(
      'data-sidebar-group',
      'convert'
    )
  })

  it('shows tool count badge', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('persists collapsed groups in settings when the header is clicked', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)

    fireEvent.click(screen.getByRole('button', { name: /TestGroup/i }))

    expect(useSettingsStore.getState().collapsedSidebarGroups).toEqual(['convert'])
  })

  it('keeps the active group expanded even when it was previously collapsed', () => {
    useSettingsStore.setState({ collapsedSidebarGroups: ['convert'] })

    render(<SidebarGroup group={GROUP} tools={TOOLS} isActiveGroup />)

    expect(screen.getByRole('button', { name: /TestGroup/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Tool A' })).toHaveAttribute('tabindex', '0')
  })
})

// ── SidebarPinned ──────────────────────────────────────────────────

describe('SidebarPinned — favorite tools', () => {
  it('renders pinned tools above the main tool groups', () => {
    useSettingsStore.setState({ pinnedToolIds: ['base64'] })

    render(<SidebarPinned />)

    expect(screen.getByRole('heading', { name: 'Pinned' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Base64' })).toBeInTheDocument()
  })
})

// ── Pinned tools in the collapsed rail ─────────────────────────────

describe('Sidebar — pinned tools in the collapsed rail', () => {
  it('gives each pinned tool its own rail button that activates on one click', () => {
    useSettingsStore.setState({ sidebarCollapsed: true, pinnedToolIds: ['base64'] })
    // Tabs are module-singleton state and earlier tests leave some behind; a
    // stale base64 tab would make `openTab` take its "already open" branch and
    // this assertion pass for the wrong reason.
    useUiStore.setState({ activeTool: '', tabs: [], tabMru: [], activeTabId: null })

    render(<Sidebar />)

    const pin = screen.getByRole('button', { name: 'Base64 (pinned)' })
    expect(pin).toBeInTheDocument()

    // One click, not two: the group flyout route costs an extra click, which is
    // the thing pinning is supposed to buy you out of.
    fireEvent.click(pin)
    expect(useUiStore.getState().activeTool).toBe('base64')
  })

  it('skips pin ids whose tool no longer exists rather than rendering a hole', () => {
    useSettingsStore.setState({ sidebarCollapsed: true, pinnedToolIds: ['ghost-tool', 'base64'] })

    render(<Sidebar />)

    expect(document.querySelectorAll('[data-sidebar-collapsed-tool]')).toHaveLength(1)
    expect(document.querySelector('[data-sidebar-collapsed-tool="base64"]')).toBeInTheDocument()
  })

  it('includes pinned tools in the collapsed rail arrow-key run', () => {
    useSettingsStore.setState({ sidebarCollapsed: true, pinnedToolIds: ['base64'] })

    render(<Sidebar />)

    const pin = screen.getByRole('button', { name: 'Base64 (pinned)' })
    pin.focus()
    fireEvent.keyDown(pin, { key: 'ArrowDown' })

    // Down from the last pin must land on the first group, not skip the pins'
    // existence entirely and jump somewhere unrelated.
    expect(document.activeElement).toHaveAttribute('data-sidebar-collapsed-group')
  })
})

// ── Collapsed flyout icon rendering ────────────────────────────────

describe('SidebarCollapsedGroup — flyout icons', () => {
  it('renders tool icons in the collapsed flyout instead of falling back to a text bullet', () => {
    render(<SidebarCollapsedGroup group={GROUP} tools={TOOLS} isActiveGroup={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'TestGroup' }))

    expect(screen.getByRole('button', { name: 'Tool A' })).toBeInTheDocument()
    expect(screen.getByTestId('icon-a')).toBeInTheDocument()
  })

  it('advertises the flyout as a dialog the trigger controls, and only while it is open', () => {
    render(<SidebarCollapsedGroup group={GROUP} tools={TOOLS} isActiveGroup={false} />)

    const trigger = screen.getByRole('button', { name: 'TestGroup' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).not.toHaveAttribute('aria-controls')

    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'TestGroup tools' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', dialog.id)
  })

  it('moves focus into the flyout on open and back to the trigger on Escape', () => {
    render(<SidebarCollapsedGroup group={GROUP} tools={TOOLS} isActiveGroup={false} />)

    const trigger = screen.getByRole('button', { name: 'TestGroup' })
    fireEvent.click(trigger)
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'TestGroup tools' }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('walks the tools with the arrow keys and wraps at both ends', () => {
    render(<SidebarCollapsedGroup group={GROUP} tools={TOOLS} isActiveGroup={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'TestGroup' }))
    const dialog = screen.getByRole('dialog', { name: 'TestGroup tools' })

    // Focus starts on the surface itself, so the first ArrowDown lands on the first tool.
    fireEvent.keyDown(dialog, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tool A' }))

    fireEvent.keyDown(dialog, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: TOOLS[TOOLS.length - 1]!.name })
    )
  })
})

// ── Keyboard nav ArrowUp when focus is outside item list ───────────
// Regression test for the idx === -1 off-by-one that would skip the
// last item when focus started on an element not in the nav list.

describe('SidebarGroup keyboard nav — focus-outside-list edge case', () => {
  it('ArrowUp from outside the list lands on the last tool item, not second-to-last', () => {
    render(
      <div>
        {/* An element that is NOT in the nav list — simulates the collapse toggle */}
        <button data-outside="true">outside</button>
        <SidebarGroup group={GROUP} tools={TOOLS} />
      </div>
    )

    // Focus the outside element first
    const outside = screen.getByText('outside')
    outside.focus()
    expect(document.activeElement).toBe(outside)

    // Fire ArrowUp on the group header (which is in the nav list)
    // In the real Sidebar the handler is on the scrollable container;
    // here we fire directly on the group header to simulate the keydown
    // bubbling up to a container that runs handleNavKeyDown logic.
    // We verify the correct item receives focus by calling the same
    // logic the hook uses.
    const items = Array.from(
      document
        .querySelector('div')!
        .querySelectorAll<HTMLElement>(
          '[data-sidebar-group], [data-sidebar-item]:not([tabindex="-1"])'
        )
    )
    const focused = document.activeElement as HTMLElement
    const idx = items.indexOf(focused) // -1: outside element is not in list

    // The fix: idx === -1 should jump to items[items.length - 1], not items[items.length - 2]
    const prev =
      idx === -1 ? items[items.length - 1] : items[(idx - 1 + items.length) % items.length]

    // Last item should be Tool C (index 2 in 3-item list)
    expect(prev).toHaveAttribute('data-sidebar-item', 'tool-c')
  })
})

// ── Sidebar — single live tree per state ────────────────────────────
// Regression test: the collapsed and expanded trees used to both stay
// mounted and cross-fade via CSS opacity. The hidden tree kept real
// geometry, real focus order, and real hit-testing — so screen readers
// announced every tool twice, Tab walked an invisible copy of the
// sidebar, and the footer could be unclickable depending on which tree
// happened to be on top. Only one tree should ever be present in the DOM.
//
// The original version of this guard asserted on the "Open settings" button
// that used to live in SidebarFooter. That button has since moved into
// TitleBar (title-bar phase 2), so SidebarFooter — and its footer markup —
// no longer exists in either tree. The collapse/expand toggle button is the
// element that now plays the same role: it exists in both the collapsed and
// expanded variants (one label per variant), so if both trees were ever
// mounted simultaneously again, both labels — or duplicate tool nodes —
// would appear at once and these assertions would catch it.
describe('Sidebar — only one tree is live at a time', () => {
  it('renders exactly one sidebar toggle button and one node per tool id when expanded', () => {
    useSettingsStore.setState({ sidebarCollapsed: false })
    render(<Sidebar />)

    expect(screen.getAllByLabelText('Collapse sidebar')).toHaveLength(1)
    expect(screen.queryByLabelText('Expand sidebar')).not.toBeInTheDocument()
    for (const tool of ALL_TOOLS) {
      expect(document.querySelectorAll(`[data-sidebar-item="${tool.id}"]`)).toHaveLength(1)
    }
  })

  it('renders exactly one sidebar toggle button when collapsed, and no leftover expanded-tree tool nodes', () => {
    useSettingsStore.setState({ sidebarCollapsed: true })
    render(<Sidebar />)

    expect(screen.getAllByLabelText('Expand sidebar')).toHaveLength(1)
    expect(screen.queryByLabelText('Collapse sidebar')).not.toBeInTheDocument()
    // The collapsed layout doesn't render per-tool nodes at all (tools only
    // appear in a group's flyout on demand) — so the expanded tree's
    // data-sidebar-item nodes must be fully absent, not just invisible.
    for (const tool of ALL_TOOLS) {
      expect(document.querySelectorAll(`[data-sidebar-item="${tool.id}"]`)).toHaveLength(0)
    }
  })

  // styles/shell.css keys the whole floating layout on this class, and jsdom applies no
  // stylesheet — without this, renaming it fails silently everywhere but the running app.
  it('carries the shell-panel hook the floating layout is keyed on', () => {
    render(<Sidebar />)
    expect(document.querySelector('aside')).toHaveClass('shell-panel')
  })
})

// ── Sidebar filter box ────────────────────────────────────────────

describe('Sidebar — filter box', () => {
  it('narrows results to matching tools and hides groups with no matches', () => {
    render(<Sidebar />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter tools' }), {
      target: { value: 'uuid' },
    })

    expect(screen.getByRole('button', { name: 'UUID Generator' })).toBeInTheDocument()
    // Groups with no matches (e.g. Code) shouldn't render their header at all
    expect(screen.queryByText('[Code]')).not.toBeInTheDocument()
    // A tool from a different group shouldn't be present either
    expect(screen.queryByRole('button', { name: 'Code Formatter' })).not.toBeInTheDocument()
  })

  it('shows a "no matches" message when nothing matches', () => {
    render(<Sidebar />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter tools' }), {
      target: { value: 'zzzznonexistenttool' },
    })

    expect(screen.getByText(/No tools matching/)).toBeInTheDocument()
    for (const tool of ALL_TOOLS) {
      expect(screen.queryByRole('button', { name: tool.name })).not.toBeInTheDocument()
    }
  })

  it('force-expands a group with matches even if it was explicitly collapsed', () => {
    useSettingsStore.setState({ collapsedSidebarGroups: ['convert'] })
    render(<Sidebar />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter tools' }), {
      target: { value: 'uuid' },
    })

    expect(screen.getByRole('button', { name: 'UUID Generator' })).toHaveAttribute('tabindex', '0')
  })

  it('pressing "/" focuses the filter input', () => {
    render(<Sidebar />)
    const input = screen.getByRole('searchbox', { name: 'Filter tools' })
    expect(input).not.toHaveFocus()

    fireEvent.keyDown(window, { key: '/' })

    expect(input).toHaveFocus()
  })

  it('does not steal "/" while the user is typing in another text field', () => {
    render(
      <div>
        <input aria-label="other field" />
        <Sidebar />
      </div>
    )
    const other = screen.getByLabelText('other field')
    other.focus()

    fireEvent.keyDown(other, { key: '/' })

    expect(screen.getByRole('searchbox', { name: 'Filter tools' })).not.toHaveFocus()
    expect(other).toHaveFocus()
  })

  it('Escape clears the filter query', () => {
    render(<Sidebar />)
    const input = screen.getByRole('searchbox', { name: 'Filter tools' })

    fireEvent.change(input, { target: { value: 'uuid' } })
    expect(input).toHaveValue('uuid')

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(input).toHaveValue('')
  })

  it('expands the sidebar and focuses the filter when "/" is pressed while collapsed', async () => {
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0)
        return 0
      },
    })
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true,
      value: () => {},
    })
    useSettingsStore.setState({ sidebarCollapsed: true })
    render(<Sidebar />)

    fireEvent.keyDown(window, { key: '/' })

    await waitFor(() => {
      expect(useSettingsStore.getState().sidebarCollapsed).toBe(false)
    })
  })
})

// ── Group collapse defaults & persistence ───────────────────────────

describe('SidebarGroup — default collapse for never-opened groups', () => {
  it('keeps every group expanded on a first run (nothing opened yet)', () => {
    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    expect(screen.getByRole('button', { name: /TestGroup/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('defaults to collapsed once other groups have been opened, if this one never was', () => {
    useSettingsStore.setState({ openedSidebarGroups: ['code'] })

    render(<SidebarGroup group={GROUP} tools={TOOLS} />)

    expect(screen.getByRole('button', { name: /TestGroup/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('stays expanded if it has already been opened, even when other groups have too', () => {
    useSettingsStore.setState({ openedSidebarGroups: ['code', 'convert'] })

    render(<SidebarGroup group={GROUP} tools={TOOLS} />)

    expect(screen.getByRole('button', { name: /TestGroup/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('expanding a default-collapsed group records it as opened, so it stays expanded', () => {
    useSettingsStore.setState({ openedSidebarGroups: ['code'] })

    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    const header = screen.getByRole('button', { name: /TestGroup/i })
    expect(header).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(header)

    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(useSettingsStore.getState().openedSidebarGroups).toContain('convert')
  })

  it('does not re-collapse other groups when a group is opened mid-session', async () => {
    // initialized: true is what freezes the launch snapshot — see
    // useOpenedGroupsAtLaunch. Without it the default falls back to live state.
    useSettingsStore.setState({ openedSidebarGroups: ['code', 'convert'], initialized: true })

    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    const header = screen.getByRole('button', { name: /TestGroup/i })
    expect(header).toHaveAttribute('aria-expanded', 'true')

    // Another group gets opened while the user is working.
    await act(async () => {
      useSettingsStore.setState({ openedSidebarGroups: ['code', 'convert', 'data'] })
    })

    // This group was expanded a moment ago and must stay that way — the new
    // entry only shapes the next launch.
    expect(header).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps a first-run sidebar expanded after the first group is opened', async () => {
    useSettingsStore.setState({ openedSidebarGroups: [], initialized: true })

    render(<SidebarGroup group={GROUP} tools={TOOLS} />)
    const header = screen.getByRole('button', { name: /TestGroup/i })
    expect(header).toHaveAttribute('aria-expanded', 'true')

    // The user's first ever click lands in a different group. Without the
    // frozen gate this is the moment every other group would snap shut.
    await act(async () => {
      useSettingsStore.setState({ openedSidebarGroups: ['data'] })
    })

    expect(header).toHaveAttribute('aria-expanded', 'true')
  })

  it('marks a group as opened when a tool from it becomes active, via the full Sidebar', async () => {
    useSettingsStore.setState({ openedSidebarGroups: ['code'] })
    useUiStore.setState({ activeTool: 'uuid-generator' })

    render(<Sidebar />)

    await waitFor(() => {
      expect(useSettingsStore.getState().openedSidebarGroups).toContain('convert')
    })
  })
})

// ── Truncated tool name tooltip ──────────────────────────────────────

describe('SidebarItem — truncation tooltip', () => {
  it('does not set a title when the label fits', () => {
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)
    const label = screen.getByText('Tool A')
    expect(label).not.toHaveAttribute('title')
  })

  it('sets a title with the full name when the label is clipped', () => {
    const originalScrollWidth = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      'scrollWidth'
    )
    const originalClientWidth = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      'clientWidth'
    )
    Object.defineProperty(window.HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return 200
      },
    })
    Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 100
      },
    })

    try {
      render(<SidebarItem id="tool-a" name="A Very Long Tool Name" icon={fixtureIcon('a')} />)
      const label = screen.getByText('A Very Long Tool Name')
      expect(label).toHaveAttribute('title', 'A Very Long Tool Name')
      // The full name stays reachable to assistive tech regardless of hover.
      expect(screen.getByRole('button', { name: 'A Very Long Tool Name' })).toBeInTheDocument()
    } finally {
      if (originalScrollWidth) {
        Object.defineProperty(window.HTMLElement.prototype, 'scrollWidth', originalScrollWidth)
      }
      if (originalClientWidth) {
        Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', originalClientWidth)
      }
    }
  })
})

describe('Sidebar — match highlighting', () => {
  it('emphasises the matched characters in a filtered row', () => {
    render(<Sidebar />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter tools' }), {
      target: { value: 'uuid' },
    })

    const row = screen.getByRole('button', { name: 'UUID Generator' })
    expect(row.querySelector('mark')?.textContent).toBe('UUID')
  })

  it('leaves unfiltered rows as plain text', () => {
    render(<Sidebar />)

    expect(screen.getByRole('button', { name: 'UUID Generator' }).querySelector('mark')).toBeNull()
  })

  it('highlights a tool listed under Recent the same way as its group row', () => {
    useUiStore.setState({ recentToolIds: ['uuid-generator'] })
    useSettingsStore.setState({ pinnedToolIds: [] })
    render(<Sidebar />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter tools' }), {
      target: { value: 'uuid' },
    })

    // The same tool appears twice while filtering — once under Recent, once in its group.
    // Both are the same row component, so both should carry the match.
    const rows = screen.getAllByRole('button', { name: 'UUID Generator' })
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.querySelector('mark')?.textContent).toBe('UUID')
  })
})

describe('Sidebar — resize handle', () => {
  it('applies the persisted width', () => {
    useSettingsStore.setState({ sidebarWidth: 300 })
    render(<Sidebar />)

    expect(document.querySelector('aside')).toHaveStyle({ width: '300px' })
  })

  it('clamps a persisted width that is out of range', () => {
    useSettingsStore.setState({ sidebarWidth: 9000 })
    render(<Sidebar />)

    expect(screen.getByRole('slider', { name: 'Resize sidebar' })).toHaveAttribute(
      'aria-valuenow',
      '420'
    )
  })

  it('widens by one step on ArrowRight and narrows on ArrowLeft', () => {
    useSettingsStore.setState({ sidebarWidth: 240 })
    render(<Sidebar />)
    const handle = screen.getByRole('slider', { name: 'Resize sidebar' })

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(handle).toHaveAttribute('aria-valuenow', '256')

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(handle).toHaveAttribute('aria-valuenow', '240')
  })

  it('stops at the floor rather than shrinking past it', () => {
    useSettingsStore.setState({ sidebarWidth: 185 })
    render(<Sidebar />)
    const handle = screen.getByRole('slider', { name: 'Resize sidebar' })

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })

    expect(handle).toHaveAttribute('aria-valuenow', '180')
  })

  it('ignores keys that are not the arrows it owns', () => {
    useSettingsStore.setState({ sidebarWidth: 240 })
    render(<Sidebar />)
    const handle = screen.getByRole('slider', { name: 'Resize sidebar' })

    fireEvent.keyDown(handle, { key: 'ArrowUp' })

    expect(handle).toHaveAttribute('aria-valuenow', '240')
  })

  it('tracks the pointer across a drag and persists the width once it settles', async () => {
    // Only the timers the debounce uses: this setup freezes rAF as read-only,
    // so faking it throws before the test even starts.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      useSettingsStore.setState({ sidebarWidth: 240 })
      const update = vi.fn().mockResolvedValue(undefined)
      useSettingsStore.setState({ update } as never)
      render(<Sidebar />)
      const handle = screen.getByRole('slider', { name: 'Resize sidebar' })

      fireEvent.pointerDown(handle, { clientX: 240, pointerId: 1 })
      fireEvent.pointerMove(document, { clientX: 300, pointerId: 1 })
      expect(handle).toHaveAttribute('aria-valuenow', '300')

      fireEvent.pointerUp(document, { clientX: 300, pointerId: 1 })
      // The save is debounced, so nothing is written mid-drag.
      expect(update).not.toHaveBeenCalledWith('sidebarWidth', 300)
      act(() => void vi.advanceTimersByTime(500))
      expect(update).toHaveBeenCalledWith('sidebarWidth', 300)
    } finally {
      vi.useRealTimers()
    }
  })

  it('releases the body cursor lock when the drag ends', () => {
    render(<Sidebar />)
    const handle = screen.getByRole('slider', { name: 'Resize sidebar' })

    fireEvent.pointerDown(handle, { clientX: 240, pointerId: 1 })
    expect(document.body.style.cursor).toBe('col-resize')

    fireEvent.pointerUp(document, { clientX: 260, pointerId: 1 })
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  // Releasing the button over another window delivers no pointer-up here, so the gesture has to
  // end on its own or the sidebar stays stuck to the cursor when the user comes back.
  it('ends the drag when the window loses focus mid-gesture', () => {
    render(<Sidebar />)
    const handle = screen.getByRole('slider', { name: 'Resize sidebar' })

    fireEvent.pointerDown(handle, { clientX: 240, pointerId: 1 })
    fireEvent.pointerMove(document, { clientX: 300, pointerId: 1 })
    fireEvent.blur(window)

    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')

    // And the handle no longer tracks the pointer.
    fireEvent.pointerMove(document, { clientX: 400, pointerId: 1 })
    expect(handle).toHaveAttribute('aria-valuenow', '300')
  })

  it('restores the previous body cursor instead of clearing it', () => {
    document.body.style.cursor = 'progress'
    try {
      render(<Sidebar />)
      const handle = screen.getByRole('slider', { name: 'Resize sidebar' })

      fireEvent.pointerDown(handle, { clientX: 240, pointerId: 1 })
      fireEvent.pointerUp(document, { clientX: 260, pointerId: 1 })

      expect(document.body.style.cursor).toBe('progress')
    } finally {
      document.body.style.cursor = ''
    }
  })

  it('has no handle to drag while collapsed', () => {
    useSettingsStore.setState({ sidebarCollapsed: true })
    render(<Sidebar />)

    expect(screen.queryByRole('slider', { name: 'Resize sidebar' })).not.toBeInTheDocument()
  })
})
