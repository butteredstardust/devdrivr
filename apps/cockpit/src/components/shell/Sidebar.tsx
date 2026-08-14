import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TOOL_GROUPS } from '@/app/tool-groups'
import { TOOLS } from '@/app/tool-registry'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useFuseSearch } from '@/hooks/useFuseSearch'
import { TOOL_FUSE_OPTIONS, toolSearchable } from '@/lib/tool-search'
import { Mascot } from '@/components/shared/Mascot'
import { SidebarGroup } from './SidebarGroup'
import { SidebarFooter } from './SidebarFooter'
import { SidebarRecent } from './SidebarRecent'
import { SidebarPinned } from './SidebarPinned'
import { SidebarCollapsedGroup } from './SidebarCollapsedGroup'
import { CaretLeftIcon, CaretRightIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'

// Bare "/" — no modifier. The shared shortcut dispatcher already ignores
// non-mod combos while focus sits in another text field, so this never
// hijacks "/" while the user is typing in an editor or input elsewhere.
const FILTER_COMBO = { key: '/' } as const

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const openedSidebarGroups = useSettingsStore((s) => s.openedSidebarGroups)
  const update = useSettingsStore((s) => s.update)
  const activeTool = useUiStore((s) => s.activeTool)

  const [filterQuery, setFilterQuery] = useState('')
  const filterInputRef = useRef<HTMLInputElement>(null)
  // Set by the "/" shortcut when the sidebar is collapsed (no room for the
  // filter box there) — expand first, then focus once the expanded tree
  // mounts.
  const pendingFilterFocusRef = useRef(false)

  const activeGroup = useMemo(() => {
    const tool = TOOLS.find((t) => t.id === activeTool)
    return tool?.group ?? ''
  }, [activeTool])

  // Track which groups the user has actually used, so groups they've never
  // opened a tool from can default to collapsed (see SidebarGroup). Fires
  // for any path that changes the active tool — sidebar click, command
  // palette, collapsed flyout, tab switch — not just clicks in this file.
  useEffect(() => {
    if (!activeGroup) return
    if (openedSidebarGroups.includes(activeGroup)) return
    void update('openedSidebarGroups', [...openedSidebarGroups, activeGroup]).catch(() => {})
  }, [activeGroup, openedSidebarGroups, update])

  const toggleCollapsed = () => {
    void update('sidebarCollapsed', !sidebarCollapsed).catch(() => {})
  }

  useKeyboardShortcut(
    FILTER_COMBO,
    useCallback(() => {
      if (sidebarCollapsed) {
        pendingFilterFocusRef.current = true
        void update('sidebarCollapsed', false).catch(() => {})
        return
      }
      filterInputRef.current?.focus()
      filterInputRef.current?.select()
    }, [sidebarCollapsed, update])
  )

  useEffect(() => {
    if (sidebarCollapsed || !pendingFilterFocusRef.current) return
    pendingFilterFocusRef.current = false
    // Wait a frame so the expanded tree (and the input inside it) has mounted.
    const raf = requestAnimationFrame(() => filterInputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [sidebarCollapsed])

  // ─── Filtering ───────────────────────────────────────────────────
  // Reuses the same Fuse.js scoring as the command palette (see
  // useFuseSearch) rather than a second search implementation.
  const searchTools = useFuseSearch(TOOLS, TOOL_FUSE_OPTIONS, toolSearchable, true)
  const trimmedFilter = filterQuery.trim()
  const isFiltering = trimmedFilter.length > 0

  const filteredToolIds = useMemo(() => {
    if (!isFiltering) return null
    return new Set(searchTools(trimmedFilter).map((t) => t.id))
  }, [isFiltering, trimmedFilter, searchTools])

  const clearFilter = useCallback(() => {
    setFilterQuery('')
  }, [])

  const handleFilterKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (e.currentTarget.value) {
        setFilterQuery('')
      } else {
        e.currentTarget.blur()
      }
      return
    }
    // ArrowDown from the filter box jumps straight into the (filtered)
    // results, so the filter is fully usable without ever reaching for Tab.
    if (e.key === 'ArrowDown') {
      const container = e.currentTarget.closest('aside')
      const first = container?.querySelector<HTMLElement>(
        '[data-sidebar-group], [data-sidebar-item]:not([tabindex="-1"])'
      )
      if (first) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

  // Arrow-key navigation for the expanded tool list.
  // Collects all focusable sidebar items and group headers in DOM order,
  // then moves focus up or down on ArrowUp/ArrowDown.
  const handleNavKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    const container = e.currentTarget
    // Include group headers (data-sidebar-group) and visible tool items
    // (data-sidebar-item with tabindex != -1 means item is in an expanded group)
    const items = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-sidebar-group], [data-sidebar-item]:not([tabindex="-1"])'
      )
    )
    if (items.length === 0) return

    e.preventDefault()

    const focused = document.activeElement as HTMLElement
    const idx = items.indexOf(focused)

    // Guard: if focus is outside the list (idx === -1) go to first/last item
    // rather than using the raw modular arithmetic which skips items.
    if (e.key === 'ArrowDown') {
      const next = idx === -1 ? items[0] : items[(idx + 1) % items.length]
      next?.focus()
    } else {
      const prev =
        idx === -1 ? items[items.length - 1] : items[(idx - 1 + items.length) % items.length]
      prev?.focus()
    }
  }, [])

  // Arrow-key navigation for the collapsed group icon column
  const handleCollapsedNavKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const container = e.currentTarget
    const items = Array.from(
      container.querySelectorAll<HTMLElement>('[data-sidebar-collapsed-group]')
    )
    if (items.length === 0) return

    e.preventDefault()
    const focused = document.activeElement as HTMLElement
    const idx = items.indexOf(focused)

    // Same idx === -1 guard: focus outside list → jump to first/last
    if (e.key === 'ArrowDown') {
      ;(idx === -1 ? items[0] : items[(idx + 1) % items.length])?.focus()
    } else {
      ;(idx === -1
        ? items[items.length - 1]
        : items[(idx - 1 + items.length) % items.length]
      )?.focus()
    }
  }, [])

  return (
    <aside
      className={`font-ui relative flex shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-[1px_0_0_0_var(--color-border),2px_0_8px_-2px_var(--color-shadow)] transition-[width] duration-200 ease-in-out ${sidebarCollapsed ? 'w-10' : 'w-[218px]'}`}
    >
      {/* Only one of the two layouts is ever mounted. Rendering both at once
          (previously cross-faded via opacity) kept the hidden tree fully
          live — real hit-testing, real tab order, real accessibility tree —
          so screen readers announced every tool twice, Tab walked an
          invisible copy of the sidebar, and the footer could be
          unclickable depending on which tree happened to sit on top.
          The outer <aside> still animates `width`, and the freshly-mounted
          layout fades/slides in via the existing `animate-fade-in`
          utility, so the swap still reads as a transition rather than a
          hard snap.

          The filter box only exists in this expanded layout: at the
          collapsed 40px width there's no room for a text input next to the
          icon column, so "/" while collapsed expands the sidebar first
          (see the effect above) rather than trying to cram a filter
          affordance into the icon rail. */}
      {sidebarCollapsed ? (
        <div key="collapsed" className="flex h-full flex-col items-center py-2 animate-fade-in">
          {/* Expand button — h-8 w-8 for a comfortable click target */}
          <button
            onClick={toggleCollapsed}
            className="mb-1 flex h-8 w-8 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <CaretRightIcon size={12} />
          </button>
          <div
            className="flex flex-1 flex-col items-center gap-0.5"
            onKeyDown={handleCollapsedNavKeyDown}
          >
            {TOOL_GROUPS.map((group) => {
              const tools = TOOLS.filter((t) => t.group === group.id)
              return (
                <SidebarCollapsedGroup
                  key={group.id}
                  group={group}
                  tools={tools}
                  isActiveGroup={group.id === activeGroup}
                />
              )
            })}
          </div>
          <SidebarFooter collapsed />
        </div>
      ) : (
        <div key="expanded" className="flex h-full flex-col animate-fade-in">
          <div className="flex items-center justify-between px-2 py-2">
            <div className="flex items-center gap-1 overflow-hidden">
              <Mascot className="shrink-0" />
              <h1 className="font-pixel text-sm font-bold tracking-tight text-[var(--color-accent)]">
                [devdrivr]
              </h1>
            </div>
            {/* Collapse button — h-7 w-7 for a larger click target */}
            <button
              onClick={toggleCollapsed}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <CaretLeftIcon size={12} />
            </button>
          </div>

          <div className="px-2 pb-1.5">
            <div className="flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 focus-within:border-[var(--color-accent)]/60">
              <MagnifyingGlassIcon
                size={12}
                className="shrink-0 text-[var(--color-text-muted)]"
                aria-hidden="true"
              />
              <input
                ref={filterInputRef}
                type="text"
                role="searchbox"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                onKeyDown={handleFilterKeyDown}
                placeholder="Filter tools... (/)"
                aria-label="Filter tools"
                className="min-w-0 flex-1 bg-transparent text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
              />
              {isFiltering && (
                <button
                  onClick={clearFilter}
                  aria-label="Clear filter"
                  title="Clear filter"
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  <XIcon size={10} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1" onKeyDown={handleNavKeyDown}>
            <SidebarPinned filterToolIds={filteredToolIds} />
            <SidebarRecent filterToolIds={filteredToolIds} />
            {(() => {
              let visibleIndex = 0
              return TOOL_GROUPS.map((group) => {
                const tools = TOOLS.filter(
                  (t) => t.group === group.id && (!filteredToolIds || filteredToolIds.has(t.id))
                )
                if (isFiltering && tools.length === 0) return null
                const isFirst = visibleIndex === 0
                visibleIndex += 1
                return (
                  <SidebarGroup
                    key={group.id}
                    group={group}
                    tools={tools}
                    isFirst={isFirst}
                    isActiveGroup={group.id === activeGroup}
                    forceExpanded={isFiltering}
                  />
                )
              })
            })()}
            {isFiltering && filteredToolIds?.size === 0 && (
              <p className="px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
                No tools matching "{trimmedFilter}"
              </p>
            )}
          </div>
          <SidebarFooter collapsed={false} />
        </div>
      )}
    </aside>
  )
}
