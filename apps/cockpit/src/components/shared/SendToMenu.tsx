import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { TOOLS } from '@/app/tool-registry'
import { useUiStore } from '@/stores/ui.store'

type Position = { x: number; y: number }

type SendToMenuProps = {
  content: string
  position: Position
  onClose: () => void
}

export function SendToMenu({ content, position, onClose }: SendToMenuProps) {
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const addToast = useUiStore((s) => s.addToast)
  const menuRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')

  const tools = TOOLS.filter((t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase()))

  const setPendingSendTo = useUiStore((s) => s.setPendingSendTo)

  const handleSelect = useCallback(
    (toolId: string, toolName: string) => {
      setPendingSendTo(content)
      setActiveTool(toolId)
      addToast(`Sent to ${toolName}`, 'success')
      onClose()
    },
    [content, setActiveTool, setPendingSendTo, addToast, onClose]
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Clamp position so the menu never goes off-screen
  const menuWidth = 224 // w-56
  const menuHeight = 320
  const adjustedLeft = Math.min(position.x, window.innerWidth - menuWidth - 8)
  const adjustedTop = Math.min(position.y, window.innerHeight - menuHeight - 8)

  return (
    <div
      ref={menuRef}
      className="animate-fade-in fixed z-50 w-56 rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
      style={{ left: adjustedLeft, top: adjustedTop }}
    >
      <div className="border-b border-[var(--color-border)] p-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Send to..."
          className="w-full bg-transparent text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          autoFocus
        />
      </div>
      <div className="max-h-64 overflow-auto py-1">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleSelect(tool.id, tool.name)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            <span className="w-5 text-center font-mono text-[10px] text-[var(--color-text-muted)]">
              {tool.icon}
            </span>
            {tool.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// Context for tools to trigger "Send To" from anywhere
type SendToContextType = {
  showSendTo: (content: string, position: Position) => void
}

export const SendToContext = createContext<SendToContextType>({
  showSendTo: () => {},
})

export function useSendTo() {
  return useContext(SendToContext)
}
