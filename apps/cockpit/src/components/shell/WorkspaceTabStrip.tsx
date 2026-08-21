import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import {
  XIcon,
  PlusIcon,
  CaretDownIcon,
  PushPinIcon,
  PushPinSlashIcon,
} from '@phosphor-icons/react'
import { useUiStore } from '@/stores/ui.store'
import { getToolById } from '@/app/tool-registry'
import { formatShortcut } from '@/lib/shortcut-label'
import { useFlipReorder } from '@/hooks/useFlipReorder'

type ContextMenu = {
  tabId: string
  x: number
  y: number
}

type DropTarget = {
  tabId: string
  edge: 'before' | 'after'
}

export function WorkspaceTabStrip() {
  const tabs = useUiStore((s) => s.tabs)
  const activeTabId = useUiStore((s) => s.activeTabId)
  const dirtyTabIds = useUiStore((s) => s.dirtyTabIds)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const closeTab = useUiStore((s) => s.closeTab)
  const openTabInstance = useUiStore((s) => s.openTabInstance)
  const closeOtherTabs = useUiStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useUiStore((s) => s.closeTabsToRight)
  const toggleTabPinned = useUiStore((s) => s.toggleTabPinned)
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeftFade, setShowLeftFade] = useState(false)
  const [showRightFade, setShowRightFade] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const overflowRef = useRef<HTMLDivElement>(null)

  const registerTabNode = useFlipReorder(tabs.map((tab) => tab.id).join('|'))

  const updateFades = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowLeftFade(el.scrollLeft > 0)
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  // Overflow is faded with a mask on the scroll container rather than two
  // gradient overlays. The overlays had to pick a single background colour to
  // fade into, and the strip has two — inactive tabs sit on --color-surface,
  // the active one on --color-bg — so whichever was chosen left a visible seam
  // wherever the fade crossed the active tab. A mask fades the pixels
  // themselves and is correct over both.
  const maskImage = useMemo(() => {
    if (!showLeftFade && !showRightFade) return undefined
    const stops = [
      showLeftFade ? 'transparent 0, #000 32px' : '#000 0',
      showRightFade ? '#000 calc(100% - 32px), transparent 100%' : '#000 100%',
    ]
    return `linear-gradient(to right, ${stops.join(', ')})`
  }, [showLeftFade, showRightFade])

  // Keep the active tab on screen.
  //
  // The strip scrolls, but nothing scrolled it: mod+1..9, Ctrl+Tab, the
  // overflow menu and closing a tab can all select a tab that is scrolled out
  // of view, leaving a strip with no visible active tab and no clue which way
  // to scroll to find it. `block: 'nearest'` so a tab that is already visible
  // is left exactly where it is rather than being centred on every switch.
  const revealActiveTab = useCallback(
    (behavior: ScrollBehavior) => {
      if (!activeTabId) return
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`)
      // jsdom has no layout and so no scrollIntoView; feature-detect rather than
      // stub it globally, so the tests exercise the same code path as the app.
      if (typeof el?.scrollIntoView !== 'function') return
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior })
    },
    [activeTabId]
  )

  // Listen for scroll and container resize
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') return
    updateFades()
    el.addEventListener('scroll', updateFades, { passive: true })
    // Selecting a tab is not the only thing that can push it out of view — so can
    // anything that narrows the strip, and none of those go through `activeTabId`:
    // opening the notes drawer, collapsing the sidebar, dragging the sidebar
    // resizer, resizing the window. Observed live, opening the drawer scrolled the
    // active tab off the left edge and nothing brought it back.
    //
    // `auto` rather than `smooth` here: a sidebar resize-drag fires this on every
    // frame, and queuing a smooth animation per frame reads as the strip lagging
    // behind the pointer. Activation keeps `smooth`, where there is one event and
    // the motion explains where the tab went.
    const ro = new ResizeObserver(() => {
      updateFades()
      revealActiveTab('auto')
    })
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateFades)
      ro.disconnect()
    }
  }, [updateFades, revealActiveTab])

  // Re-check when tabs are added/removed (scroll width changes without a scroll event)
  useEffect(() => {
    updateFades()
  }, [tabs, updateFades])

  // Keep the active tab on screen.
  //
  // The strip scrolls, but nothing scrolled it: mod+1..9, Ctrl+Tab, the
  // overflow menu and closing a tab can all select a tab that is scrolled out
  // of view, leaving a strip with no visible active tab and no clue which way
  // to scroll to find it. `block: 'nearest'` so a tab that is already visible
  // is left exactly where it is rather than being centred on every switch.
  useEffect(() => {
    revealActiveTab('smooth')
  }, [revealActiveTab, tabs])

  // A vertical wheel over a horizontal strip should scroll it — trackpads emit
  // deltaY for the gesture that visually reads as "along the tabs". Ignored
  // when the gesture is already horizontal, which the browser handles itself.
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth) return
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    el.scrollLeft += e.deltaY
  }, [])

  // Tab reordering, on pointer events rather than HTML5 drag-and-drop.
  //
  // Not a style preference: the window runs with Tauri's `dragDropEnabled` on
  // (the default), which installs a native drag-and-drop handler on the
  // webview. That handler is what delivers file drops to `useFileDropZone`,
  // and on macOS it also swallows in-page `dragover`/`drop`, so a `draggable`
  // tab fired `dragstart` and then nothing — the tab never moved. The two
  // features cannot share the flag, and file drops are worth more than the
  // browser's drag ghost. Pointer events are below that handler entirely.
  //
  // A drag only begins once the pointer has moved past a small threshold, so a
  // plain click still selects and a double-click still pins.
  const dragOrigin = useRef<{ tabId: string; x: number } | null>(null)
  // The gesture's own state lives in refs, and the `useState` copies below exist
  // only to paint it. A pointerup can arrive in the same task as the pointermove
  // before it, ahead of any re-render, so a handler reading the rendered
  // `dropTarget` would drop the tab where it was two moves ago — or, when the
  // first move and the release coincide, nowhere at all.
  const draggingRef = useRef<string | null>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)

  const handleDragPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, tabId: string) => {
      if (event.button !== 0) return
      dragOrigin.current = { tabId, x: event.clientX }
    },
    []
  )

  useEffect(() => {
    const DRAG_THRESHOLD = 4

    const endGesture = () => {
      dragOrigin.current = null
      draggingRef.current = null
      dropTargetRef.current = null
      setDraggingTabId(null)
      setDropTarget(null)
    }

    // A drag that ends within the tab it started on still produces a click, and
    // that click would re-activate the tab on top of the reorder the gesture
    // already performed. One that ends over a different element produces no
    // click at all — measured, not assumed — so a suppressor armed at pointerup
    // and left to wait for a click that never comes would sit armed and eat the
    // user's next, unrelated click instead. It has to expire on its own.
    let suppressorTimer: number | undefined
    const swallowTrailingClick = (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
    }
    const disarmSuppressor = () => {
      window.clearTimeout(suppressorTimer)
      window.removeEventListener('click', swallowTrailingClick, { capture: true })
    }
    const armSuppressor = () => {
      disarmSuppressor()
      window.addEventListener('click', swallowTrailingClick, { capture: true, once: true })
      // The trailing click, when there is one, is dispatched in the same task as
      // the mouseup that follows this pointerup, so a zero delay outlives it.
      suppressorTimer = window.setTimeout(disarmSuppressor, 0)
    }

    const onMove = (event: PointerEvent) => {
      const origin = dragOrigin.current
      if (!origin) return
      if (!draggingRef.current && Math.abs(event.clientX - origin.x) < DRAG_THRESHOLD) return
      if (!draggingRef.current) {
        draggingRef.current = origin.tabId
        setDraggingTabId(origin.tabId)
      }

      // Hit-test the strip rather than relying on the pointer being over a tab:
      // the tab under the cursor shrinks and shifts as others move out of the
      // way, and a pointer that has run off the end of the strip still has a
      // meaningful answer — the nearest edge.
      const strip = scrollRef.current
      if (!strip) return
      const nodes = [...strip.querySelectorAll<HTMLElement>('[data-tab-id]')]
      let target: DropTarget | null = null
      for (const node of nodes) {
        const id = node.dataset.tabId
        if (!id || id === origin.tabId) continue
        const rect = node.getBoundingClientRect()
        if (event.clientX < rect.left + rect.width / 2) {
          target = { tabId: id, edge: 'before' }
          break
        }
        target = { tabId: id, edge: 'after' }
      }
      dropTargetRef.current = target
      setDropTarget(target)
    }

    const onUp = () => {
      const dragging = draggingRef.current
      const target = dropTargetRef.current
      if (!dragOrigin.current || !dragging) {
        endGesture()
        return
      }
      armSuppressor()

      if (target) {
        // Read the order at drop time: a tab may have opened or closed while the
        // pointer was down, and a stale index would move the wrong tab.
        const { tabs: current, reorderTab: reorder } = useUiStore.getState()
        const from = current.findIndex((candidate) => candidate.id === dragging)
        const to = current.findIndex((candidate) => candidate.id === target.tabId)
        if (from !== -1 && to !== -1) {
          const boundary = to + (target.edge === 'after' ? 1 : 0)
          reorder(dragging, boundary - (from < boundary ? 1 : 0))
        }
      }
      endGesture()
    }

    // A cancelled pointer (an OS gesture taking over, say) must not leave the
    // strip believing a drag is still in flight. Nor must a window that loses
    // focus mid-gesture: the button comes up somewhere we never hear about, so
    // without this the next plain click would be read as the end of the old drag
    // and would move a tab the user never touched.
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', endGesture)
    window.addEventListener('blur', endGesture)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', endGesture)
      window.removeEventListener('blur', endGesture)
      disarmSuppressor()
    }
  }, [])

  // Close context menu on outside mousedown
  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  // Same dismissal rules for the overflow menu.
  useEffect(() => {
    if (!overflowMenuOpen) return
    const onPointer = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverflowMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [overflowMenuOpen])

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [contextMenu])

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    e.stopPropagation()
    // Clamp so the menu doesn't overflow the viewport edges
    const menuWidth = 160
    const menuHeight = 160 // five items at ~32px
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 4)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 4)
    setContextMenu({ tabId, x, y })
  }, [])

  // Derived helpers for context menu item availability. Both counts skip
  // pinned tabs, which now survive either command — enabling an item that
  // would close nothing is worse than greying it out.
  const contextTabIdx = contextMenu ? tabs.findIndex((t) => t.id === contextMenu.tabId) : -1
  const contextTabPinned = contextTabIdx !== -1 && !!tabs[contextTabIdx]?.pinned
  const hasOthers =
    contextTabIdx !== -1 && tabs.some((t) => t.id !== contextMenu?.tabId && !t.pinned)
  const hasRight = contextTabIdx !== -1 && tabs.slice(contextTabIdx + 1).some((t) => !t.pinned)

  return (
    <div className="font-ui relative flex h-9 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Scrollable tab row */}
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Open tools"
        style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
        className="no-scrollbar flex flex-1 items-stretch overflow-x-auto"
        onWheel={handleWheel}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          const idx = tabs.findIndex((t) => t.id === activeTabId)
          if (idx === -1) return
          const next =
            e.key === 'ArrowLeft'
              ? tabs[Math.max(0, idx - 1)]
              : tabs[Math.min(tabs.length - 1, idx + 1)]
          if (next && next.id !== activeTabId) {
            e.preventDefault()
            setActiveTab(next.id)
            const el = e.currentTarget.querySelector<HTMLElement>(`[data-tab-id="${next.id}"]`)
            el?.focus()
          }
        }}
      >
        {tabs.map((tab, index) => {
          const tool = getToolById(tab.toolId)
          const isActive = tab.id === activeTabId
          const isDirty = dirtyTabIds.includes(tab.id)
          const isPinned = !!tab.pinned
          // A hairline between adjacent inactive tabs. Without it a row of
          // tabs reads as one undifferentiated strip, since padding is the
          // only thing separating them. Suppressed next to the active tab,
          // whose own fill already provides the edge, and after the last tab.
          const showSeparator =
            !isActive && index < tabs.length - 1 && tabs[index + 1]?.id !== activeTabId
          // The end of the pinned block gets a rule regardless of what sits on
          // either side of it. Without it, a pinned tab next to the active tab
          // suppresses its own separator and the two groups run together —
          // which is precisely the boundary that has to stay legible.
          const endsPinnedBlock = isPinned && !tabs[index + 1]?.pinned && index < tabs.length - 1
          const label = tool?.name ?? tab.toolId
          // Two tabs of the same tool are otherwise indistinguishable, so number
          // them — and only then, so a single tab is never "JSON Tools 1".
          const sameTool = tabs.filter((t) => t.toolId === tab.toolId)
          const title = sameTool.length > 1 ? `${label} ${sameTool.indexOf(tab) + 1}` : label
          return (
            <div
              key={tab.id}
              id={`tab-${tab.id}`}
              ref={(node) => registerTabNode(tab.id, node)}
              role="tab"
              aria-selected={isActive}
              aria-label={isPinned ? `${title} (pinned)` : undefined}
              title={isPinned ? `${title} — pinned` : undefined}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              data-tab-id={tab.id}
              onPointerDown={(e) => handleDragPointerDown(e, tab.id)}
              // A click is also the tail of every drag, and reordering is the whole
              // of what that gesture asked for — the drag handler above stops that
              // one click before it reaches here, so this only ever sees real ones.
              onClick={() => setActiveTab(tab.id)}
              // Double-click to pin, matching the convention the context menu
              // spells out. Cheap to discover by accident and cheap to undo.
              onDoubleClick={() => toggleTabPinned(tab.id)}
              // Middle-click to close, as every other tabbed app does — except
              // on a pinned tab, where the whole point of the pin is that the
              // tab does not disappear by accident.
              onAuxClick={(e) => {
                if (e.button !== 1) return
                e.preventDefault()
                if (isPinned) return
                closeTab(tab.id)
              }}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveTab(tab.id)
                }
              }}
              // The active tab used to carry three simultaneous cues — its own
              // fill, accent-coloured text, and the pill. The fill is what
              // joins the tab to the panel below it and the pill is the
              // marker; accent text on top of both was redundant, and it
              // fought the tool icon beside it, which draws in its own colour.
              // Tabs shrink as the strip fills, the way browser tabs do, rather
              // than holding a fixed 180px and overflowing the moment a fifth
              // one opens. `grow-0` keeps a lone tab from stretching across the
              // whole strip; past the floor, the scroll/fade/overflow menu take
              // over.
              //
              // That floor was 52px, which is where the icon and close button
              // stop fitting — but a tab that narrow shows about three
              // characters of its name, and, worse, the strip could then hold
              // sixteen tabs without ever overflowing, so the fade, the wheel
              // scroll and the overflow menu were all unreachable in practice.
              // 112px keeps a readable stub of the label and hands over to the
              // scrolling chrome at a tab count someone will actually hit.
              //
              // Pinned tabs opt out entirely: fixed and icon-only, which is
              // what buys back the room the shrinking is competing for.
              className={`group relative flex cursor-pointer select-none items-center text-xs transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring-inset)] ${
                isPinned
                  ? 'w-9 shrink-0 justify-center px-0'
                  : 'min-w-[112px] max-w-[180px] shrink grow-0 basis-[160px] gap-1.5 px-3'
              } ${
                isActive
                  ? 'bg-[var(--color-bg)] text-[var(--color-text)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
              } ${draggingTabId === tab.id ? 'opacity-50' : ''}`}
            >
              {tool && (
                <span
                  aria-hidden="true"
                  className="flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5"
                >
                  {tool.icon}
                </span>
              )}
              {/* A pinned tab drops its label, so the icon has to carry the
                  identity on screen and the accessible name has to carry it
                  everywhere else — without this the tab announces as blank. */}
              {!isPinned && <span className="flex-1 truncate">{title}</span>}
              {/* Unsaved work shows a dot in the close button's slot, which
                  swaps back to the × on hover or focus. Same 16px box either
                  way, so nothing reflows. */}
              {isDirty && (
                <span
                  aria-hidden="true"
                  data-testid="tab-dirty-dot"
                  // A pinned tab has no close button to swap with, so its dot
                  // tucks into the icon's corner and simply stays put.
                  className={
                    isPinned
                      ? 'pointer-events-none absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]'
                      : 'pointer-events-none absolute right-3 flex h-4 w-4 items-center justify-center opacity-100 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0'
                  }
                >
                  {!isPinned && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                  )}
                </span>
              )}
              {/* No close button on a pinned tab — the pin exists to make the
                  tab hard to lose, and a one-click × beside it says otherwise.
                  Unpin (context menu or double-click) is the way out. */}
              {!isPinned && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  aria-label={`Close ${title}${isDirty ? ' (unsaved changes)' : ''}`}
                  // Always visible on the active tab — it is the one most likely
                  // to be closed, and hiding its only close affordance behind a
                  // hover is a poor trade for a few pixels of quiet. A dirty tab
                  // yields the slot to the dot until hover.
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-opacity hover:!opacity-100 hover:bg-[var(--color-surface-hover)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
                    isDirty
                      ? 'opacity-0 group-hover:opacity-60 group-focus-within:opacity-60'
                      : isActive
                        ? 'opacity-60'
                        : 'opacity-0 group-hover:opacity-60'
                  }`}
                >
                  <XIcon size={12} />
                </button>
              )}

              {/* Top pill indicator for the active tab.
                  The strip sits above the panel, so the active tab's job is to
                  look continuous with the content below it. A bottom pill drew
                  a bright line across exactly the seam that should disappear;
                  on the top edge it marks the tab without severing it. */}
              {isActive && (
                <span
                  aria-hidden="true"
                  data-testid="tab-pill"
                  className={`pointer-events-none absolute top-0 left-1/2 h-[3px] -translate-x-1/2 rounded-b-full bg-[var(--color-accent)] ${
                    isPinned ? 'w-5' : 'w-10'
                  }`}
                />
              )}

              {(showSeparator || endsPinnedBlock) && (
                <span
                  aria-hidden="true"
                  data-testid={endsPinnedBlock ? 'tab-pinned-divider' : 'tab-separator'}
                  className={`pointer-events-none absolute right-0 w-px bg-[var(--color-border)] ${
                    endsPinnedBlock ? 'inset-y-0' : 'inset-y-1.5'
                  }`}
                />
              )}

              {/* Drag drop indicator. Absolutely positioned rather than a
                  border, which added 2px to the tab box mid-drag and nudged
                  every tab to its right on each dragover. */}
              {dropTarget?.tabId === tab.id && (
                <span
                  aria-hidden="true"
                  data-testid="tab-drop-indicator"
                  className={`pointer-events-none absolute inset-y-0 w-0.5 bg-[var(--color-accent)] ${
                    dropTarget.edge === 'before' ? 'left-0' : 'right-0'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Every open tab in one list. The mask fade tells you there is more to
          the strip than you can see, but not what — and scrolling a strip with
          no visible scrollbar is a poor way to find a named tab. Only shown
          once something is actually out of view, so it doesn't sit there as
          dead chrome in the common case of three tabs. */}
      {(showLeftFade || showRightFade) && (
        <div ref={overflowRef} className="relative flex shrink-0">
          <button
            onClick={() => setOverflowMenuOpen((open) => !open)}
            aria-label="Show all open tools"
            aria-expanded={overflowMenuOpen}
            aria-haspopup="menu"
            title="Show all open tools"
            className="flex h-full w-8 items-center justify-center border-l border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <CaretDownIcon size={12} />
          </button>
          {overflowMenuOpen && (
            <div
              role="menu"
              aria-label="Open tools"
              className="absolute right-0 top-full z-[var(--z-popover)] max-h-[60vh] min-w-[200px] overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-1 shadow-lg"
            >
              {tabs.map((tab) => {
                const tool = getToolById(tab.toolId)
                const label = tool?.name ?? tab.toolId
                const sameTool = tabs.filter((t) => t.toolId === tab.toolId)
                const entryTitle =
                  sameTool.length > 1 ? `${label} ${sameTool.indexOf(tab) + 1}` : label
                return (
                  <button
                    key={tab.id}
                    role="menuitem"
                    onClick={() => {
                      setActiveTab(tab.id)
                      setOverflowMenuOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
                      tab.id === activeTabId
                        ? 'text-[var(--color-accent)]'
                        : 'text-[var(--color-text)]'
                    }`}
                  >
                    {tool && (
                      <span
                        aria-hidden="true"
                        className="flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5"
                      >
                        {tool.icon}
                      </span>
                    )}
                    <span className="flex-1 truncate">{entryTitle}</span>
                    {tab.pinned && (
                      <PushPinIcon
                        size={12}
                        aria-label="pinned"
                        className="shrink-0 text-[var(--color-text-muted)]"
                      />
                    )}
                    {dirtyTabIds.includes(tab.id) && (
                      <span
                        aria-label="unsaved changes"
                        role="img"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* + button pinned outside the scroll area. The left border separates
          "tabs" from "action" — flush against the scroll area it read as one
          more tab. */}
      <button
        onClick={toggleCommandPalette}
        aria-label={`Open new tool (${formatShortcut('mod+k')})`}
        title={`Open new tool (${formatShortcut('mod+k')})`}
        className="flex h-full w-8 shrink-0 items-center justify-center border-l border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <PlusIcon size={12} />
      </button>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x }}
          className="z-[var(--z-popover)] min-w-[160px] overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-1 shadow-lg"
        >
          <button
            onClick={() => {
              closeTab(contextMenu.tabId)
              setContextMenu(null)
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-xs text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Close
          </button>
          <button
            onClick={() => {
              toggleTabPinned(contextMenu.tabId)
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            {contextTabPinned ? <PushPinSlashIcon size={12} /> : <PushPinIcon size={12} />}
            {contextTabPinned ? 'Unpin Tab' : 'Pin Tab'}
          </button>
          <button
            onClick={() => {
              const tab = tabs.find((t) => t.id === contextMenu.tabId)
              if (tab) openTabInstance(tab.toolId)
              setContextMenu(null)
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-xs text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Duplicate
          </button>
          <button
            onClick={() => {
              closeOtherTabs(contextMenu.tabId)
              setContextMenu(null)
            }}
            disabled={!hasOthers}
            className="flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Close Others
          </button>
          <button
            onClick={() => {
              closeTabsToRight(contextMenu.tabId)
              setContextMenu(null)
            }}
            disabled={!hasRight}
            className="flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            Close to Right
          </button>
        </div>
      )}
    </div>
  )
}
