import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TOOL_GROUPS } from '@/app/tool-groups'
import { TOOLS } from '@/app/tool-registry'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useFuseSearchWithMatches, type MatchRange } from '@/hooks/useFuseSearch'
import { TOOL_FUSE_OPTIONS, toolSearchable } from '@/lib/tool-search'
import { Mascot } from '@/components/shared/Mascot'
import { SidebarGroup } from './SidebarGroup'
import { SidebarRecent } from './SidebarRecent'
import { SidebarPinned } from './SidebarPinned'
import { SidebarCollapsedGroup } from './SidebarCollapsedGroup'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { SearchInput } from '@/components/shared/SearchInput'

// Bare "/" — no modifier. The shared shortcut dispatcher already ignores
// non-mod combos while focus sits in another text field, so this never
// hijacks "/" while the user is typing in an editor or input elsewhere.
const FILTER_COMBO = { key: '/' } as const

// Floor is where the longest tool names stop being readable at all; ceiling
// keeps the sidebar from eating a window that is only ~800px wide to begin with.
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 420

function clampSidebarWidth(width: number): number {
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)))
}

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const openedSidebarGroups = useSettingsStore((s) => s.openedSidebarGroups)
  const update = useSettingsStore((s) => s.update)
  const activeTool = useUiStore((s) => s.activeTool)

  const savedWidth = useSettingsStore((s) => s.sidebarWidth)

  const [filterQuery, setFilterQuery] = useState('')
  const [width, setWidth] = useState(() => clampSidebarWidth(savedWidth))
  const [resizing, setResizing] = useState(false)
  const filterInputRef = useRef<HTMLInputElement>(null)
  const resizeSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
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

  useEffect(() => setWidth(clampSidebarWidth(savedWidth)), [savedWidth])

  useEffect(() => () => clearTimeout(resizeSaveTimer.current), [])

  // Drag the right edge to resize. Mirrors the notes drawer's handle (same
  // debounce, same body cursor/selection lock) so the two edges of the shell
  // behave identically, just measured from the opposite side.
  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = width
      setResizing(true)

      const onMove = (moveEvent: MouseEvent) => {
        setWidth(clampSidebarWidth(startWidth + moveEvent.clientX - startX))
      }
      const onUp = (upEvent: MouseEvent) => {
        const final = clampSidebarWidth(startWidth + upEvent.clientX - startX)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setResizing(false)
        clearTimeout(resizeSaveTimer.current)
        resizeSaveTimer.current = setTimeout(
          () => void update('sidebarWidth', final).catch(() => {}),
          500
        )
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [update, width]
  )

  // Keyboard resizing, so the width isn't mouse-only. 16px a step, matching
  // roughly one indent level of the tree it is sizing.
  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const next = clampSidebarWidth(width + (event.key === 'ArrowRight' ? 16 : -16))
      setWidth(next)
      clearTimeout(resizeSaveTimer.current)
      resizeSaveTimer.current = setTimeout(
        () => void update('sidebarWidth', next).catch(() => {}),
        500
      )
    },
    [update, width]
  )

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
  const searchTools = useFuseSearchWithMatches(
    TOOLS,
    TOOL_FUSE_OPTIONS,
    toolSearchable,
    'name',
    true
  )
  const trimmedFilter = filterQuery.trim()
  const isFiltering = trimmedFilter.length > 0

  // One pass produces both the visibility set and the per-tool ranges: they
  // come from the same search and must not be allowed to disagree about which
  // tools matched.
  const { filteredToolIds, matchRanges } = useMemo(() => {
    if (!isFiltering) return { filteredToolIds: null, matchRanges: null }
    const hits = searchTools(trimmedFilter)
    return {
      filteredToolIds: new Set(hits.map((hit) => hit.item.id)),
      matchRanges: new Map<string, MatchRange[]>(hits.map((hit) => [hit.item.id, hit.ranges])),
    }
  }, [isFiltering, trimmedFilter, searchTools])

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
    // One elevation story for the shell: the sidebar and the tab strip are a
    // single recessed chrome plane (--color-surface, hairline borders) and the
    // tool content is the raised one (--color-bg). The old treatment stacked a
    // border, a 1px hard shadow duplicating that same border, and a soft drop
    // shadow, which made the chrome float above the content it frames.
    //
    // 150ms, not 200: the expanded tree unmounts the instant collapse starts,
    // so every millisecond past the swap is an empty rail sliding shut.
    <aside
      // Width is inline because it is now user data rather than a design
      // constant. The collapsed rail keeps its fixed 40px — there is nothing
      // to size there — and the transition is suppressed mid-drag, since
      // animating towards a target that moves every mousemove makes the edge
      // lag the cursor.
      style={{ width: sidebarCollapsed ? 40 : width }}
      className={`shell-panel font-ui relative flex shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] ease-[var(--ease-in-out)] ${
        resizing ? '' : 'transition-[width] duration-[var(--duration-fast)]'
      }`}
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
            className="mb-1 flex h-8 w-8 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <CaretRightIcon size={12} />
          </button>
          {/* The rail keeps the grouping the expanded tree has — without the
              dividers it is 40px of undifferentiated icons, and the structure
              the user learned while expanded vanishes on collapse. */}
          <div
            className="flex flex-1 flex-col items-center gap-0.5"
            onKeyDown={handleCollapsedNavKeyDown}
          >
            {TOOL_GROUPS.map((group, index) => {
              const tools = TOOLS.filter((t) => t.group === group.id)
              return (
                <Fragment key={group.id}>
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className="my-1 h-px w-5 shrink-0 bg-[var(--color-border)]"
                    />
                  )}
                  <SidebarCollapsedGroup
                    group={group}
                    tools={tools}
                    isActiveGroup={group.id === activeGroup}
                  />
                </Fragment>
              )
            })}
          </div>
        </div>
      ) : (
        <div key="expanded" className="flex h-full flex-col animate-fade-in">
          <div className="flex items-center justify-between px-2 py-2">
            <div className="flex items-center gap-1 overflow-hidden">
              <Mascot className="shrink-0" />
              {/* Not accent-coloured. The wordmark was the brightest thing in
                  the sidebar and the least useful — it competed with the
                  active tool for the eye every time the sidebar was open. The
                  Mascot beside it still carries the brand colour. */}
              <h1 className="font-pixel text-sm font-bold tracking-tight text-[var(--color-text)]">
                [devdrivr]
              </h1>
            </div>
            {/* Collapse button — h-7 w-7 for a larger click target */}
            <button
              onClick={toggleCollapsed}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <CaretLeftIcon size={12} />
            </button>
          </div>

          <div className="px-2 pb-1.5">
            <SearchInput
              ref={filterInputRef}
              value={filterQuery}
              onValueChange={setFilterQuery}
              onKeyDown={handleFilterKeyDown}
              placeholder="Filter tools... (/)"
              aria-label="Filter tools"
              clearLabel="Clear filter"
            />
          </div>

          <div className="flex-1 overflow-y-auto py-1" onKeyDown={handleNavKeyDown}>
            <SidebarPinned filterToolIds={filteredToolIds} matchRanges={matchRanges} />
            <SidebarRecent filterToolIds={filteredToolIds} matchRanges={matchRanges} />
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
                    matchRanges={matchRanges ?? undefined}
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
        </div>
      )}

      {/* Resize handle. Hidden while collapsed, where there is no width to
          set. A slider role rather than a bare div so the value is
          announced and the arrow keys have a documented meaning. */}
      {!sidebarCollapsed && (
        <div
          role="slider"
          tabIndex={0}
          aria-label="Resize sidebar"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={width}
          aria-orientation="vertical"
          onMouseDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          title="Drag to resize"
          className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-[var(--color-accent)]/40 active:bg-[var(--color-accent)]/60 focus-visible:outline-none focus-visible:bg-[var(--color-accent)]/60"
        />
      )}
    </aside>
  )
}
