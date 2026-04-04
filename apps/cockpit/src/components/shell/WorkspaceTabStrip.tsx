import { useRef, useState, useCallback, useEffect } from 'react'
import { XIcon, PlusIcon } from '@phosphor-icons/react'
import { useUiStore } from '@/stores/ui.store'
import { getToolById } from '@/app/tool-registry'

export function WorkspaceTabStrip() {
  const tabs = useUiStore((s) => s.tabs)
  const activeTabId = useUiStore((s) => s.activeTabId)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const closeTab = useUiStore((s) => s.closeTab)
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeftFade, setShowLeftFade] = useState(false)
  const [showRightFade, setShowRightFade] = useState(false)

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

  return (
    <div className="relative flex h-10 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Scrollable tab row */}
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Open tools"
        className="flex flex-1 items-stretch overflow-x-auto [scrollbar-width:none]"
      >
        {tabs.map((tab) => {
          const tool = getToolById(tab.toolId)
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex max-w-[180px] min-w-[100px] shrink-0 cursor-pointer select-none items-center gap-1.5 border-b-2 px-3 text-xs transition-colors ${
                isActive
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
              }`}
            >
              <span className="truncate font-pixel text-[10px]">{tool?.name ?? tab.toolId}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                aria-label={`Close ${tool?.name ?? 'tab'}`}
                className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded transition-opacity hover:bg-[var(--color-surface-hover)] ${
                  isActive
                    ? 'opacity-60 hover:opacity-100'
                    : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
              >
                <XIcon size={10} />
              </button>
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
        className="flex h-full w-8 shrink-0 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
      >
        <PlusIcon size={12} />
      </button>
    </div>
  )
}
