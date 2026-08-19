import { useRef, useState, useCallback, useEffect } from 'react'
import { XIcon, PlusIcon } from '@phosphor-icons/react'
import { useUiStore } from '@/stores/ui.store'
import { getToolById } from '@/app/tool-registry'

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
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const closeTab = useUiStore((s) => s.closeTab)
  const openTabInstance = useUiStore((s) => s.openTabInstance)
  const reorderTab = useUiStore((s) => s.reorderTab)
  const closeOtherTabs = useUiStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useUiStore((s) => s.closeTabsToRight)
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeftFade, setShowLeftFade] = useState(false)
  const [showRightFade, setShowRightFade] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updateFades = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowLeftFade(el.scrollLeft > 0)
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  // Listen for scroll and container resize
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') return
    updateFades()
    el.addEventListener('scroll', updateFades, { passive: true })
    const ro = new ResizeObserver(updateFades)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateFades)
      ro.disconnect()
    }
  }, [updateFades])

  // Re-check when tabs are added/removed (scroll width changes without a scroll event)
  useEffect(() => {
    updateFades()
  }, [tabs, updateFades])

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
    const menuHeight = 128 // four items at ~32px
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 4)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 4)
    setContextMenu({ tabId, x, y })
  }, [])

  // Derived helpers for context menu item availability
  const contextTabIdx = contextMenu ? tabs.findIndex((t) => t.id === contextMenu.tabId) : -1
  const hasOthers = contextTabIdx !== -1 && tabs.length > 1
  const hasRight = contextTabIdx !== -1 && contextTabIdx < tabs.length - 1

  return (
    <div className="font-ui relative flex h-9 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Scrollable tab row */}
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Open tools"
        className="flex flex-1 items-stretch overflow-x-auto [scrollbar-width:none]"
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
        {tabs.map((tab) => {
          const tool = getToolById(tab.toolId)
          const isActive = tab.id === activeTabId
          const label = tool?.name ?? tab.toolId
          // Two tabs of the same tool are otherwise indistinguishable, so number
          // them — and only then, so a single tab is never "JSON Tools 1".
          const sameTool = tabs.filter((t) => t.toolId === tab.toolId)
          const title = sameTool.length > 1 ? `${label} ${sameTool.indexOf(tab) + 1}` : label
          return (
            <div
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              data-tab-id={tab.id}
              draggable
              onDragStart={(e) => {
                setDraggingTabId(tab.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', tab.id)
              }}
              onDragOver={(e) => {
                if (!draggingTabId || draggingTabId === tab.id) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const rect = e.currentTarget.getBoundingClientRect()
                setDropTarget({
                  tabId: tab.id,
                  edge: e.clientX < rect.left + rect.width / 2 ? 'before' : 'after',
                })
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (!draggingTabId || draggingTabId === tab.id) return
                const from = tabs.findIndex((candidate) => candidate.id === draggingTabId)
                const target = tabs.findIndex((candidate) => candidate.id === tab.id)
                if (from !== -1 && target !== -1) {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const edge = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
                  const boundary = target + (edge === 'after' ? 1 : 0)
                  const toIndex = boundary - (from < boundary ? 1 : 0)
                  reorderTab(draggingTabId, toIndex)
                }
                setDraggingTabId(null)
                setDropTarget(null)
              }}
              onDragEnd={() => {
                setDraggingTabId(null)
                setDropTarget(null)
              }}
              onClick={() => setActiveTab(tab.id)}
              // Middle-click to close, as every other tabbed app does.
              onAuxClick={(e) => {
                if (e.button !== 1) return
                e.preventDefault()
                closeTab(tab.id)
              }}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveTab(tab.id)
                }
              }}
              className={`group relative flex max-w-[180px] min-w-[80px] shrink-0 cursor-pointer select-none items-center gap-1.5 px-3 text-xs transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring-inset)] ${
                isActive
                  ? 'bg-[var(--color-bg)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
              } ${draggingTabId === tab.id ? 'opacity-50' : ''} ${
                dropTarget?.tabId === tab.id && dropTarget.edge === 'before'
                  ? 'border-l-2 border-l-[var(--color-accent)]'
                  : ''
              } ${
                dropTarget?.tabId === tab.id && dropTarget.edge === 'after'
                  ? 'border-r-2 border-r-[var(--color-accent)]'
                  : ''
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
              <span className="flex-1 truncate text-2xs">{title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                aria-label={`Close ${title}`}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:bg-[var(--color-surface-hover)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <XIcon size={12} />
              </button>

              {/* Bottom pill indicator for active tab */}
              {isActive && (
                <span
                  aria-hidden="true"
                  data-testid="tab-pill"
                  className="pointer-events-none absolute bottom-0 left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-t-full bg-[var(--color-accent)]"
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Left fade — visible once the user has scrolled right */}
      {showLeftFade && (
        <div className="pointer-events-none absolute left-0 top-0 h-full w-8 bg-gradient-to-r from-[var(--color-surface)] to-transparent" />
      )}

      {/* Right fade — visible when tabs overflow off the right edge */}
      {showRightFade && (
        <div className="pointer-events-none absolute right-8 top-0 h-full w-8 bg-gradient-to-l from-[var(--color-surface)] to-transparent" />
      )}

      {/* + button pinned outside the scroll area */}
      <button
        onClick={toggleCommandPalette}
        aria-label="Open new tool (⌘K)"
        title="Open new tool (⌘K)"
        className="flex h-full w-8 shrink-0 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
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
