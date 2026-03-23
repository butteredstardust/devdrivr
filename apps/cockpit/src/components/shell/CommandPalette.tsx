import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { TOOLS } from '@/app/tool-registry'
import { TOOL_GROUPS } from '@/app/tool-groups'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { usePlatform } from '@/hooks/usePlatform'
import { dispatchToolAction } from '@/lib/tool-actions'
import { openFileDialog } from '@/lib/file-io'
import { getCurrentWindow } from '@tauri-apps/api/window'

// ─── Types ───────────────────────────────────────────────────────────

type PaletteItem = {
  id: string
  kind: 'tool' | 'action'
  name: string
  description: string
  icon: string
  shortcut?: string
  group?: string
}

type SectionItem =
  | { type: 'header'; label: string }
  | { type: 'item'; item: PaletteItem; flatIndex: number }

// ─── Constants ───────────────────────────────────────────────────────

const MAX_RECENT = 5

const GROUP_LABELS: Record<string, string> = Object.fromEntries(
  TOOL_GROUPS.map((g) => [g.id, g.label])
)

function buildActions(modSymbol: string): PaletteItem[] {
  return [
    {
      id: 'action:theme',
      kind: 'action',
      name: 'Toggle Theme',
      description: 'Switch between dark, light, and system',
      icon: '◐',
      shortcut: `${modSymbol}⇧T`,
    },
    {
      id: 'action:sidebar',
      kind: 'action',
      name: 'Toggle Sidebar',
      description: 'Show or hide the sidebar',
      icon: '◫',
      shortcut: `${modSymbol}B`,
    },
    {
      id: 'action:notes',
      kind: 'action',
      name: 'Toggle Notes',
      description: 'Open or close the notes drawer',
      icon: '¶',
      shortcut: `${modSymbol}⇧N`,
    },
    {
      id: 'action:settings',
      kind: 'action',
      name: 'Open Settings',
      description: 'Appearance, editor, and data preferences',
      icon: '⚙',
      shortcut: `${modSymbol},`,
    },
    {
      id: 'action:shortcuts',
      kind: 'action',
      name: 'Keyboard Shortcuts',
      description: 'View all keyboard shortcuts',
      icon: '⌨',
      shortcut: `${modSymbol}/`,
    },
    {
      id: 'action:pin',
      kind: 'action',
      name: 'Toggle Always on Top',
      description: 'Pin or unpin the window above others',
      icon: '⊤',
      shortcut: `${modSymbol}⇧P`,
    },
    {
      id: 'action:open-file',
      kind: 'action',
      name: 'Open File',
      description: 'Open a file and send to the active tool',
      icon: '↗',
      shortcut: `${modSymbol}O`,
    },
    {
      id: 'action:save-file',
      kind: 'action',
      name: 'Save Output',
      description: 'Save the active tool output to a file',
      icon: '↓',
      shortcut: `${modSymbol}S`,
    },
    {
      id: 'action:next-tool',
      kind: 'action',
      name: 'Next Tool',
      description: 'Switch to the next tool in the list',
      icon: '→',
      shortcut: `${modSymbol}]`,
    },
    {
      id: 'action:prev-tool',
      kind: 'action',
      name: 'Previous Tool',
      description: 'Switch to the previous tool in the list',
      icon: '←',
      shortcut: `${modSymbol}[`,
    },
  ]
}

// ─── Recent tools (session-scoped, not persisted) ────────────────────
// Module-level backing store so recents survive palette close/open cycles.
// The component copies this into useState on mount for reactivity.

let recentBacking: string[] = []

function pushRecent(toolId: string) {
  recentBacking = [toolId, ...recentBacking.filter((id) => id !== toolId)].slice(0, MAX_RECENT)
}

// ─── Component ───────────────────────────────────────────────────────

export function CommandPalette() {
  const isOpen = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const activeTool = useUiStore((s) => s.activeTool)
  const addToast = useUiStore((s) => s.addToast)
  const toggleSettingsPanel = useUiStore((s) => s.toggleSettingsPanel)
  const toggleShortcutsModal = useUiStore((s) => s.toggleShortcutsModal)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const settingsUpdate = useSettingsStore((s) => s.update)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const notesDrawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const { modSymbol } = usePlatform()

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentToolIds, setRecentToolIds] = useState<string[]>(recentBacking)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const trackRecent = useCallback((toolId: string) => {
    pushRecent(toolId)
    setRecentToolIds([...recentBacking])
  }, [])

  // ─── Palette items ─────────────────────────────────────────────

  const actions = useMemo(() => buildActions(modSymbol), [modSymbol])

  const toolItems: PaletteItem[] = useMemo(
    () =>
      TOOLS.map((t) => ({
        id: t.id,
        kind: 'tool' as const,
        name: t.name,
        description: t.description,
        icon: typeof t.icon === 'string' ? t.icon : '•',
        group: t.group,
      })),
    []
  )

  const allItems = useMemo(() => [...toolItems, ...actions], [toolItems, actions])

  const fuseOpts = useMemo(
    () => ({ keys: ['name', 'description'] as string[], threshold: 0.4, includeScore: true, includeMatches: true }),
    []
  )

  const fuse = useMemo(() => new Fuse(allItems, fuseOpts), [allItems, fuseOpts])
  const actionFuse = useMemo(() => new Fuse(actions, fuseOpts), [actions, fuseOpts])

  // ─── Results ───────────────────────────────────────────────────

  const isActionMode = query.startsWith('>')
  const searchQuery = isActionMode ? query.slice(1).trim() : query.trim()

  const results = useMemo(() => {
    if (!searchQuery) {
      if (isActionMode) return actions

      // Default: recent tools first, then all tools grouped
      const recent = recentToolIds
        .map((id) => toolItems.find((t) => t.id === id))
        .filter((t): t is PaletteItem => t != null && t.id !== activeTool)

      // Group remaining tools by category
      const remaining = toolItems.filter(
        (t) => !recentToolIds.includes(t.id) || t.id === activeTool
      )

      return [...recent, ...remaining]
    }

    // Fuzzy search (action mode uses dedicated Fuse, normal mode searches everything)
    const fuseInstance = isActionMode ? actionFuse : fuse
    return fuseInstance.search(searchQuery).map((r) => r.item)
  }, [searchQuery, isActionMode, toolItems, actions, fuse, actionFuse, activeTool])

  // ─── Section headers for default view ──────────────────────────

  const sections = useMemo((): SectionItem[] => {
    if (searchQuery || isActionMode) {
      // Flat list when searching
      return results.map((item, i) => ({ type: 'item' as const, item, flatIndex: i }))
    }

    const out: SectionItem[] = []
    let flatIdx = 0

    // Recent section
    const recentItems = results.filter(
      (r) => recentToolIds.includes(r.id) && r.id !== activeTool
    )
    if (recentItems.length > 0) {
      out.push({ type: 'header', label: 'Recent' })
      for (const item of recentItems) {
        out.push({ type: 'item', item, flatIndex: flatIdx++ })
      }
    }

    // Group remaining tools by category
    const remaining = results.filter(
      (r) => r.kind === 'tool' && (!recentToolIds.includes(r.id) || r.id === activeTool)
    )
    let currentGroup = ''
    for (const item of remaining) {
      const group = item.group ?? ''
      if (group !== currentGroup) {
        currentGroup = group
        out.push({ type: 'header', label: GROUP_LABELS[group] ?? group })
      }
      out.push({ type: 'item', item, flatIndex: flatIdx++ })
    }

    return out
  }, [results, searchQuery, isActionMode, activeTool])

  const flatCount = useMemo(
    () => sections.filter((s) => s.type === 'item').length,
    [sections]
  )

  // ─── Action execution ──────────────────────────────────────────

  const executeItem = useCallback(
    (item: PaletteItem) => {
      if (item.kind === 'tool') {
        trackRecent(item.id)
        setActiveTool(item.id)
        setOpen(false)
        return
      }

      // Actions
      setOpen(false)
      switch (item.id) {
        case 'action:theme':
          toggleTheme().catch(() => {})
          break
        case 'action:sidebar':
          settingsUpdate('sidebarCollapsed', !sidebarCollapsed).catch(() => {})
          break
        case 'action:notes':
          settingsUpdate('notesDrawerOpen', !notesDrawerOpen).catch(() => {})
          break
        case 'action:settings':
          toggleSettingsPanel()
          break
        case 'action:shortcuts':
          toggleShortcutsModal()
          break
        case 'action:pin': {
          const win = getCurrentWindow()
          const next = !alwaysOnTop
          win.setAlwaysOnTop(next)
          settingsUpdate('alwaysOnTop', next).catch(() => {})
          break
        }
        case 'action:open-file':
          openFileDialog().then((result) => {
            if (result) {
              dispatchToolAction({
                type: 'open-file',
                content: result.content,
                filename: result.filename,
              })
              addToast(`Opened ${result.filename}`, 'success')
            }
          }).catch(() => {})
          break
        case 'action:save-file':
          dispatchToolAction({ type: 'save-file' })
          break
        case 'action:next-tool': {
          const idx = TOOLS.findIndex((t) => t.id === activeTool)
          const next = TOOLS[(idx + 1) % TOOLS.length]
          if (next) {
            trackRecent(next.id)
            setActiveTool(next.id)
          }
          break
        }
        case 'action:prev-tool': {
          const idx = TOOLS.findIndex((t) => t.id === activeTool)
          const prev = TOOLS[(idx - 1 + TOOLS.length) % TOOLS.length]
          if (prev) {
            trackRecent(prev.id)
            setActiveTool(prev.id)
          }
          break
        }
      }
    },
    [
      setActiveTool,
      setOpen,
      toggleTheme,
      settingsUpdate,
      sidebarCollapsed,
      notesDrawerOpen,
      toggleSettingsPanel,
      toggleShortcutsModal,
      alwaysOnTop,
      addToast,
      activeTool,
      trackRecent,
    ]
  )

  // ─── Lifecycle ─────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setRecentToolIds([...recentBacking]) // sync in case tools were used while palette was closed
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Track tool usage from outside the palette
  useEffect(() => {
    if (activeTool) trackRecent(activeTool)
  }, [activeTool, trackRecent])

  // Scroll keyboard-selected item into view
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const buttons = container.querySelectorAll('[data-palette-item]')
    buttons[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // ─── Keyboard navigation ──────────────────────────────────────

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, flatCount - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter': {
          e.preventDefault()
          const flatItems = sections.filter(
            (s): s is SectionItem & { type: 'item' } => s.type === 'item'
          )
          const selected = flatItems[selectedIndex]
          if (selected) executeItem(selected.item)
          break
        }
        case 'Escape':
          e.preventDefault()
          setOpen(false)
          break
        case 'Backspace':
          // If query is empty and in action mode, exit action mode
          if (query === '>') {
            e.preventDefault()
            setQuery('')
          }
          break
      }
    },
    [flatCount, sections, selectedIndex, executeItem, setOpen, query]
  )

  // ─── Render ────────────────────────────────────────────────────

  if (!isOpen) return null

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => setOpen(false)}
      />
      <div className="animate-fade-in fixed left-1/2 top-[15%] z-50 w-[540px] -translate-x-1/2 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg">
        {/* Input */}
        <div className="flex items-center border-b border-[var(--color-border)] px-3">
          <span className="mr-2 text-sm text-[var(--color-text-muted)]">&gt;</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={`Search tools... (${modSymbol}K)  •  Type > for actions`}
            className="h-11 flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
          {isActionMode && (
            <span className="rounded bg-[var(--color-accent-dim)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]">
              Actions
            </span>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-96 overflow-y-auto py-1">
          {sections.map((section) => {
            if (section.type === 'header') {
              return (
                <div
                  key={`header-${section.label}`}
                  className="px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]"
                >
                  {section.label}
                </div>
              )
            }

            const { item, flatIndex } = section
            const isSelected = flatIndex === selectedIndex
            const isActive = item.kind === 'tool' && item.id === activeTool

            return (
              <button
                key={item.id}
                data-palette-item
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                  isSelected
                    ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                }`}
                onClick={() => executeItem(item)}
                onMouseEnter={() => setSelectedIndex(flatIndex)}
              >
                <span className="w-6 shrink-0 text-center font-pixel text-[10px]">
                  {item.icon}
                </span>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.name}</span>
                    {isActive && (
                      <span className="rounded bg-[var(--color-accent)]/20 px-1 text-[10px] text-[var(--color-accent)]">
                        active
                      </span>
                    )}
                    {item.kind === 'action' && (
                      <span className="rounded bg-[var(--color-info)]/20 px-1 text-[10px] text-[var(--color-info)]">
                        action
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-[var(--color-text-muted)]">
                    {item.description}
                  </div>
                </div>
                {item.shortcut && (
                  <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                    {item.shortcut}
                  </span>
                )}
              </button>
            )
          })}
          {flatCount === 0 && (
            <div className="px-3 py-4 text-center text-sm text-[var(--color-text-muted)]">
              {isActionMode ? 'No actions found' : 'No tools found'}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-[var(--color-border)] px-3 py-1.5 text-[10px] text-[var(--color-text-muted)]">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
          {!isActionMode && <span className="ml-auto">&gt; actions</span>}
        </div>
      </div>
    </>
  )
}
