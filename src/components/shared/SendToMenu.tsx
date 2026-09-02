import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { TOOLS } from '@/app/tool-registry'
import { useUiStore } from '@/stores/ui.store'
import { useIsInstanceActive } from '@/app/tool-instance'

type Position = { x: number; y: number }

type SendToMenuProps = {
  content: string
  position: Position
  onClose: () => void
}

export function SendToMenu({ content, position, onClose }: SendToMenuProps) {
  const isInstanceActive = useIsInstanceActive()
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const addToast = useUiStore((s) => s.addToast)
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listboxId = useId()
  const optionId = (index: number) => `${listboxId}-option-${index}`

  const tools = TOOLS.filter((t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase()))

  // A filter that removes the active row must not leave the highlight pointing past the end.
  useEffect(() => {
    setActiveIndex((index) => (index < tools.length ? index : 0))
  }, [tools.length])

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
      if (!isInstanceActive) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (!isInstanceActive) return
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isInstanceActive, onClose])

  // Clamp against both viewport edges using what the menu actually measures: capping only the
  // maximum leaves a negative left/top in a narrow window, which pushes the filter off-screen.
  const [size, setSize] = useState({ width: 224, height: 320 })
  useLayoutEffect(() => {
    const element = menuRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    setSize((current) =>
      current.width === rect.width && current.height === rect.height
        ? current
        : { width: rect.width, height: rect.height }
    )
  }, [tools.length])

  const MARGIN = 8
  const adjustedLeft = Math.max(
    MARGIN,
    Math.min(position.x, window.innerWidth - size.width - MARGIN)
  )
  const adjustedTop = Math.max(
    MARGIN,
    Math.min(position.y, window.innerHeight - size.height - MARGIN)
  )

  const handleFilterKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (tools.length === 0) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => {
          const next =
            event.key === 'ArrowDown'
              ? (index + 1) % tools.length
              : (index - 1 + tools.length) % tools.length
          listRef.current
            ?.querySelector(`[data-index="${next}"]`)
            ?.scrollIntoView({ block: 'nearest' })
          return next
        })
        return
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        setActiveIndex(event.key === 'Home' ? 0 : tools.length - 1)
        return
      }
      if (event.key === 'Enter') {
        const tool = tools[activeIndex]
        if (!tool) return
        event.preventDefault()
        handleSelect(tool.id, tool.name)
      }
    },
    [activeIndex, handleSelect, tools]
  )

  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-label="Send to tool"
      className="font-ui animate-fade-in fixed z-[var(--z-popover)] w-56 rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
      style={{ left: adjustedLeft, top: adjustedTop }}
    >
      <div className="border-b border-[var(--color-border)] p-2">
        {/* Combobox over a listbox: the arrow keys move a highlight that stays announced while
            focus remains in the filter, which is what a user expects from a "send to" picker. */}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={handleFilterKeyDown}
          placeholder="Send to..."
          aria-label="Filter tools"
          role="combobox"
          aria-expanded={tools.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          {...(tools[activeIndex] ? { 'aria-activedescendant': optionId(activeIndex) } : {})}
          className="w-full bg-transparent text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          autoFocus
        />
      </div>
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Tools"
        className="max-h-64 overflow-auto py-1"
      >
        {tools.map((tool, index) => (
          <div
            key={tool.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === activeIndex}
            data-index={index}
            onClick={() => handleSelect(tool.id, tool.name)}
            onMouseMove={() => setActiveIndex(index)}
            className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text)] ${
              index === activeIndex ? 'bg-[var(--color-surface-hover)]' : ''
            }`}
          >
            <span className="w-5 text-center font-mono text-2xs text-[var(--color-text-muted)]">
              {tool.icon}
            </span>
            {tool.name}
          </div>
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
