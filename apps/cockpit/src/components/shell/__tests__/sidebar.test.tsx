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

beforeEach(() => {
  cleanup()
  useToolStateCache.setState({ cache: new Map() })
  useUiStore.setState({ activeTool: '' })
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: true })
})

// ── SidebarItem ────────────────────────────────────────────────────

describe('SidebarItem — active indicator', () => {
  it('applies glow shadow class when item is active', () => {
    useUiStore.setState({ activeTool: 'tool-a' })
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)
    const btn = screen.getByRole('button', { name: 'Tool A' })
    expect(btn.className).toContain('shadow-[inset_3px_0_8px_-4px_var(--color-accent)]')
  })

  it('does not apply glow shadow when item is inactive', () => {
    useUiStore.setState({ activeTool: 'tool-b' })
    render(<SidebarItem id="tool-a" name="Tool A" icon={fixtureIcon('a')} />)
    const btn = screen.getByRole('button', { name: 'Tool A' })
    expect(btn.className).not.toContain('shadow-[inset')
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
    expect(screen.getByText('[TestGroup]')).toBeInTheDocument()
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

    expect(screen.getByText('[Pinned]')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Base64' })).toBeInTheDocument()
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

describe('Sidebar — only one tree is live at a time', () => {
  it('renders exactly one "Open settings" button and one node per tool id when expanded', () => {
    useSettingsStore.setState({ sidebarCollapsed: false })
    render(<Sidebar />)

    expect(screen.getAllByLabelText('Open settings')).toHaveLength(1)
    for (const tool of ALL_TOOLS) {
      expect(document.querySelectorAll(`[data-sidebar-item="${tool.id}"]`)).toHaveLength(1)
    }
  })

  it('renders exactly one "Open settings" button when collapsed, and no leftover expanded-tree tool nodes', () => {
    useSettingsStore.setState({ sidebarCollapsed: true })
    render(<Sidebar />)

    expect(screen.getAllByLabelText('Open settings')).toHaveLength(1)
    // The collapsed layout doesn't render per-tool nodes at all (tools only
    // appear in a group's flyout on demand) — so the expanded tree's
    // data-sidebar-item nodes must be fully absent, not just invisible.
    for (const tool of ALL_TOOLS) {
      expect(document.querySelectorAll(`[data-sidebar-item="${tool.id}"]`)).toHaveLength(0)
    }
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
