import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ToolDefinition, ToolGroupMeta } from '@/types/tools'
import { useUiStore } from '@/stores/ui.store'

type Props = {
  group: ToolGroupMeta
  tools: ToolDefinition[]
  isActiveGroup: boolean
}

export function SidebarCollapsedGroup({ group, tools, isActiveGroup }: Props) {
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const activeTool = useUiStore((s) => s.activeTool)

  const handleSelect = useCallback(
    (toolId: string) => {
      setActiveTool(toolId)
      setFlyoutOpen(false)
    },
    [setActiveTool]
  )

  // Position the flyout next to the trigger, flipping if near bottom of viewport
  const [flyoutStyle, setFlyoutStyle] = useState<React.CSSProperties>({})

  useEffect(() => {
    if (!flyoutOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const flyoutHeight = tools.length * 30 + 28 // estimated: 30px per item + 28px header
    const spaceBelow = window.innerHeight - rect.top
    const flipUp = spaceBelow < flyoutHeight && rect.top > flyoutHeight

    setFlyoutStyle({
      position: 'fixed',
      left: rect.right + 4,
      ...(flipUp
        ? { bottom: window.innerHeight - rect.bottom }
        : { top: rect.top }),
      zIndex: 9999,
    })
  }, [flyoutOpen, tools.length])

  // Close flyout on outside click
  useEffect(() => {
    if (!flyoutOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        flyoutRef.current &&
        !flyoutRef.current.contains(target)
      ) {
        setFlyoutOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [flyoutOpen])

  // Close flyout on Escape
  useEffect(() => {
    if (!flyoutOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlyoutOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [flyoutOpen])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setFlyoutOpen(!flyoutOpen)}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors duration-150 ${
          isActiveGroup
            ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
            : flyoutOpen
              ? 'bg-[var(--color-surface-hover)] text-[var(--color-text)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
        }`}
        title={group.label}
        aria-label={group.label}
        aria-expanded={flyoutOpen}
        aria-haspopup="true"
      >
        <span className="flex w-5 shrink-0 items-center justify-center">{group.icon}</span>
      </button>

      {flyoutOpen &&
        createPortal(
          <div
            ref={flyoutRef}
            style={flyoutStyle}
            className="min-w-[160px] overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-1 shadow-lg"
          >
            <div className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              {group.label}
            </div>
            {tools.map((tool) => {
              const isActive = tool.id === activeTool
              return (
                <button
                  key={tool.id}
                  onClick={() => handleSelect(tool.id)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  <span className="w-4 shrink-0 text-center font-pixel text-[10px]">
                    {typeof tool.icon === 'string' ? tool.icon : '•'}
                  </span>
                  <span className="truncate">{tool.name}</span>
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}
