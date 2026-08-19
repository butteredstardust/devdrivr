import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { IFuseOptions } from 'fuse.js'
import { TOOLS } from '@/app/tool-registry'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import type { Theme } from '@/types/models'
import { usePlatform } from '@/hooks/usePlatform'
import { dispatchToolAction, supportsToolFileAction } from '@/lib/tool-actions'
import { openFileDialog } from '@/lib/file-io'
import { useFuseSearch } from '@/hooks/useFuseSearch'
import { GROUP_LABELS, searchTermsForTool } from '@/lib/tool-search'
import { focusNativeWindow } from '@/lib/native-window'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  GearSixIcon,
  KeyboardIcon,
  MagnifyingGlassIcon,
  MoonStarsIcon,
  NotePencilIcon,
  PushPinIcon,
  PushPinSlashIcon,
  SidebarIcon,
  type Icon,
} from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Kbd } from '@/components/shared/Kbd'

// ─── Types ───────────────────────────────────────────────────────────

type PaletteItem = {
  id: string
  kind: 'tool' | 'action'
  name: string
  description: string
  icon: ReactElement
  shortcut?: string
  group?: string
  groupLabel?: string
  searchTerms?: string[]
}

type SectionItem =
  | { type: 'header'; label: string }
  | { type: 'item'; item: PaletteItem; flatIndex: number }

// ─── Constants ───────────────────────────────────────────────────────

const actionIcon = (IconComponent: Icon) => (
  <IconComponent size={16} weight="regular" aria-hidden="true" />
)

function themeLabel(theme: Theme): string {
  return theme
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

type ActionState = {
  alwaysOnTop: boolean
  notesDrawerOpen: boolean
  sidebarCollapsed: boolean
  theme: Theme
}

function buildActions(modSymbol: string, state: ActionState): PaletteItem[] {
  const sidebarName = state.sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'
  const notesName = state.notesDrawerOpen ? 'Close Notes' : 'Open Notes'
  const pinName = state.alwaysOnTop ? 'Unpin Window' : 'Pin Window'

  return [
    {
      id: 'action:theme',
      kind: 'action',
      name: `Change Theme (${themeLabel(state.theme)})`,
      description: 'Cycle to the next app theme',
      icon: actionIcon(MoonStarsIcon),
      shortcut: `${modSymbol}⇧T`,
      searchTerms: ['theme', 'appearance', 'dark', 'light', 'system', state.theme],
    },
    {
      id: 'action:sidebar',
      kind: 'action',
      name: sidebarName,
      description: state.sidebarCollapsed ? 'Expand the sidebar' : 'Collapse the sidebar',
      icon: actionIcon(SidebarIcon),
      shortcut: `${modSymbol}B`,
      searchTerms: ['sidebar', 'navigation', 'nav', 'panel', 'toggle sidebar'],
    },
    {
      id: 'action:notes',
      kind: 'action',
      name: notesName,
      description: state.notesDrawerOpen ? 'Close the notes drawer' : 'Open the notes drawer',
      icon: actionIcon(NotePencilIcon),
      shortcut: `${modSymbol}⇧N`,
      searchTerms: ['notes', 'drawer', 'scratchpad', 'toggle notes'],
    },
    {
      id: 'action:settings',
      kind: 'action',
      name: 'Open Settings',
      description: 'Appearance, editor, and data preferences',
      icon: actionIcon(GearSixIcon),
      shortcut: `${modSymbol},`,
      searchTerms: ['settings', 'preferences', 'appearance', 'editor', 'data'],
    },
    {
      id: 'action:shortcuts',
      kind: 'action',
      name: 'Keyboard Shortcuts',
      description: 'View all keyboard shortcuts',
      icon: actionIcon(KeyboardIcon),
      shortcut: `${modSymbol}/`,
      searchTerms: ['shortcuts', 'hotkeys', 'keybindings', 'keyboard'],
    },
    {
      id: 'action:pin',
      kind: 'action',
      name: pinName,
      description: state.alwaysOnTop
        ? 'Allow other windows to cover Cockpit'
        : 'Keep Cockpit above other windows',
      icon: actionIcon(state.alwaysOnTop ? PushPinSlashIcon : PushPinIcon),
      shortcut: `${modSymbol}⇧P`,
      searchTerms: ['pin', 'unpin', 'always on top', 'window', 'float'],
    },
    {
      id: 'action:open-file',
      kind: 'action',
      name: 'Open File',
      description: 'Open a file and send to the active tool',
      icon: actionIcon(FolderOpenIcon),
      shortcut: `${modSymbol}O`,
      searchTerms: ['open', 'file', 'import', 'load'],
    },
    {
      id: 'action:save-file',
      kind: 'action',
      name: 'Save Output',
      description: 'Save the active tool output to a file',
      icon: actionIcon(FloppyDiskIcon),
      shortcut: `${modSymbol}S`,
      searchTerms: ['save', 'file', 'download', 'export', 'output'],
    },
    {
      id: 'action:next-tool',
      kind: 'action',
      name: 'Next Tool',
      description: 'Switch to the next tool in the list',
      icon: actionIcon(ArrowRightIcon),
      shortcut: `${modSymbol}]`,
      searchTerms: ['next', 'tool', 'switch', 'forward'],
    },
    {
      id: 'action:prev-tool',
      kind: 'action',
      name: 'Previous Tool',
      description: 'Switch to the previous tool in the list',
      icon: actionIcon(ArrowLeftIcon),
      shortcut: `${modSymbol}[`,
      searchTerms: ['previous', 'prev', 'tool', 'switch', 'back'],
    },
  ]
}

/** Field set searched in both Fuse mode and the plain-substring fallback. */
function paletteItemSearchable(item: PaletteItem): Array<string | null | undefined> {
  return [
    item.name,
    item.description,
    item.group,
    item.groupLabel,
    item.shortcut,
    ...(item.searchTerms ?? []),
  ]
}

function optionId(item: PaletteItem): string {
  return `command-palette-option-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

// ─── Component ───────────────────────────────────────────────────────

export function CommandPalette() {
  const isOpen = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const activeTool = useUiStore((s) => s.activeTool)
  const tabs = useUiStore((s) => s.tabs)
  const addToast = useUiStore((s) => s.addToast)
  const recentToolIds = useUiStore((s) => s.recentToolIds)
  const toggleSettingsPanel = useUiStore((s) => s.toggleSettingsPanel)
  const toggleShortcutsModal = useUiStore((s) => s.toggleShortcutsModal)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const settingsUpdate = useSettingsStore((s) => s.update)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const notesDrawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const theme = useSettingsStore((s) => s.theme)
  const { modSymbol } = usePlatform()

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ─── Palette items ─────────────────────────────────────────────

  const actions = useMemo(
    () => buildActions(modSymbol, { alwaysOnTop, notesDrawerOpen, sidebarCollapsed, theme }),
    [modSymbol, alwaysOnTop, notesDrawerOpen, sidebarCollapsed, theme]
  )

  const toolItems: PaletteItem[] = useMemo(
    () =>
      TOOLS.map((t) => ({
        id: t.id,
        kind: 'tool' as const,
        name: t.name,
        description: t.description,
        icon: t.icon,
        group: t.group,
        groupLabel: GROUP_LABELS[t.group] ?? t.group,
        searchTerms: searchTermsForTool(t),
      })),
    []
  )

  const allItems = useMemo(() => [...toolItems, ...actions], [toolItems, actions])

  const fuseOpts: IFuseOptions<PaletteItem> = useMemo(
    () => ({
      keys: ['name', 'description', 'group', 'groupLabel', 'shortcut', 'searchTerms'],
      threshold: 0.4,
      includeScore: true,
      includeMatches: true,
    }),
    []
  )

  // Fuzzy search: action mode uses a dedicated index over just the actions,
  // normal mode searches everything. Both go through the one shared Fuse
  // implementation (see useFuseSearch) — no second scoring engine here.
  const searchAllItems = useFuseSearch(allItems, fuseOpts, paletteItemSearchable, isOpen)
  const searchActions = useFuseSearch(actions, fuseOpts, paletteItemSearchable, isOpen)

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

    return isActionMode ? searchActions(searchQuery) : searchAllItems(searchQuery)
  }, [
    searchQuery,
    isActionMode,
    toolItems,
    actions,
    activeTool,
    recentToolIds,
    searchActions,
    searchAllItems,
  ])

  // ─── Section headers for default view ──────────────────────────

  const sections = useMemo((): SectionItem[] => {
    if (searchQuery || isActionMode) {
      // Flat list when searching
      return results.map((item, i) => ({ type: 'item' as const, item, flatIndex: i }))
    }

    const out: SectionItem[] = []
    let flatIdx = 0

    // Recent section
    const recentItems = results.filter((r) => recentToolIds.includes(r.id) && r.id !== activeTool)
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
  }, [results, searchQuery, isActionMode, activeTool, recentToolIds])

  const flatCount = useMemo(() => sections.filter((s) => s.type === 'item').length, [sections])
  const selectedOptionId = useMemo(() => {
    const selected = sections.filter((s): s is SectionItem & { type: 'item' } => s.type === 'item')[
      selectedIndex
    ]
    return selected ? optionId(selected.item) : undefined
  }, [sections, selectedIndex])

  // Clamp selectedIndex when result count shrinks (e.g. mid-keystroke)
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, flatCount - 1)))
  }, [flatCount])

  // ─── Action execution ──────────────────────────────────────────

  const executeItem = useCallback(
    (item: PaletteItem) => {
      if (item.kind === 'tool') {
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
          win
            .setAlwaysOnTop(next)
            .then(() => settingsUpdate('alwaysOnTop', next))
            .catch(() => addToast('Failed to update window pin state', 'error'))
          break
        }
        case 'action:open-file':
          if (!supportsToolFileAction(activeTool, 'open-file')) {
            addToast('Open File is not supported by the active tool', 'error')
            break
          }
          openFileDialog()
            .then((result) => {
              if (result) {
                dispatchToolAction({
                  type: 'open-file',
                  content: result.content,
                  filename: result.filename,
                })
                addToast(`Opened ${result.filename}`, 'success')
              }
            })
            .catch((err: unknown) =>
              addToast(err instanceof Error ? err.message : String(err), 'error')
            )
          break
        case 'action:save-file':
          if (!supportsToolFileAction(activeTool, 'save-file')) {
            addToast('Save Output is not supported by the active tool', 'error')
            break
          }
          dispatchToolAction({ type: 'save-file' })
          break
        case 'action:next-tool': {
          const idx = TOOLS.findIndex((t) => t.id === activeTool)
          if (idx === -1) break
          const next = TOOLS[(idx + 1) % TOOLS.length]
          if (next) setActiveTool(next.id)
          break
        }
        case 'action:prev-tool': {
          const idx = TOOLS.findIndex((t) => t.id === activeTool)
          if (idx === -1) break
          const prev = TOOLS[(idx - 1 + TOOLS.length) % TOOLS.length]
          if (prev) setActiveTool(prev.id)
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
    ]
  )

  // ─── Lifecycle ─────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
      void focusNativeWindow().catch((err) =>
        console.error('[CommandPalette] native focus failed:', err)
      )
    } else {
      setQuery('')
      inputRef.current?.blur()
    }
  }, [isOpen])

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
          if (flatCount > 0) setSelectedIndex((i) => (i + 1) % flatCount)
          break
        case 'ArrowUp':
          e.preventDefault()
          if (flatCount > 0) setSelectedIndex((i) => (i - 1 + flatCount) % flatCount)
          break
        case 'Home':
          e.preventDefault()
          setSelectedIndex(0)
          break
        case 'End':
          e.preventDefault()
          setSelectedIndex(Math.max(0, flatCount - 1))
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
        case 'Tab':
          e.preventDefault()
          inputRef.current?.focus()
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

  return (
    <>
      <div
        className={`pointer-events-auto relative flex w-full min-w-0 max-w-[480px] items-center gap-2 rounded-md border bg-[var(--color-surface-sunken)] px-3 py-1.5 text-xs shadow-sm transition-colors ${
          isOpen
            ? 'z-[51] border-[var(--color-accent)] shadow-[var(--focus-ring)]'
            : 'border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
        }`}
      >
        <MagnifyingGlassIcon size={14} className="shrink-0 text-[var(--color-text-muted)]" />
        {/* eslint-disable-next-line no-restricted-syntax -- the focus ring belongs to the wrapper,
            not the field: the whole bar is one ARIA combobox, and a second ring on the input inside
            it would draw a box within the lit box. InlineInput would supply exactly that ring. */}
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            if (!isOpen) setOpen(true)
            setQuery(e.target.value)
            setSelectedIndex(0)
          }}
          onKeyDown={onKeyDown}
          placeholder={
            isOpen
              ? `Search tools... (${modSymbol}K)  •  Type > for actions`
              : (TOOLS.find((tool) => tool.id === activeTool)?.name ?? 'Search tools and commands')
          }
          aria-label="Search tools and commands"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && flatCount > 0}
          aria-controls={isOpen ? 'command-palette-results' : undefined}
          aria-activedescendant={isOpen ? selectedOptionId : undefined}
          className="min-w-0 flex-1 bg-transparent text-left text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
        />
        {isActionMode && isOpen ? (
          <span className="rounded bg-[var(--color-accent-dim)] px-1.5 py-0.5 text-2xs text-[var(--color-accent)]">
            Actions
          </span>
        ) : (
          <Kbd keys="mod+k" />
        )}
      </div>

      {isOpen && (
        <>
          <div
            role="presentation"
            className="pointer-events-auto fixed inset-0 z-[var(--z-scrim)]"
            style={{ backgroundColor: 'var(--color-scrim)' }}
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-labelledby="command-palette-title"
            className="font-ui pointer-events-auto animate-fade-in fixed left-1/2 top-11 z-[var(--z-modal)] w-[540px] -translate-x-1/2 overflow-hidden rounded-b border border-t-0 border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg"
          >
            <h2 id="command-palette-title" className="sr-only">
              Command palette
            </h2>

            {/* Results */}
            <div
              ref={listRef}
              id="command-palette-results"
              role="listbox"
              className="max-h-96 overflow-y-auto py-1"
            >
              {sections.map((section) => {
                if (section.type === 'header') {
                  return (
                    <SectionLabel
                      as="div"
                      key={`header-${section.label}`}
                      role="presentation"
                      className="px-3 pb-0.5 pt-2"
                    >
                      {section.label}
                    </SectionLabel>
                  )
                }

                const { item, flatIndex } = section
                const isSelected = flatIndex === selectedIndex
                const isActive = item.kind === 'tool' && item.id === activeTool
                const isOpenInTab =
                  item.kind === 'tool' && !isActive && tabs.some((t) => t.toolId === item.id)

                return (
                  <button
                    key={item.id}
                    id={optionId(item)}
                    role="option"
                    aria-selected={isSelected}
                    data-palette-item
                    tabIndex={-1}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                      isSelected
                        ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                        : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                    }`}
                    onClick={() => executeItem(item)}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSelectedIndex(flatIndex)}
                  >
                    <span className="flex w-6 shrink-0 justify-center text-[var(--color-text-muted)]">
                      {item.icon}
                    </span>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {isActive && (
                          <span className="rounded bg-[var(--color-surface-hover)] px-1 text-2xs text-[var(--color-accent)]">
                            active
                          </span>
                        )}
                        {isOpenInTab && (
                          <span className="rounded bg-[var(--color-surface-hover)] px-1 text-2xs text-[var(--color-text-muted)]">
                            open
                          </span>
                        )}
                        {item.kind === 'action' && (
                          <span className="rounded bg-[var(--color-info)]/20 px-1 text-2xs text-[var(--color-info)]">
                            action
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-[var(--color-text-muted)]">
                        {item.description}
                      </div>
                    </div>
                    {item.shortcut && (
                      <span className="shrink-0 text-2xs text-[var(--color-text-muted)]">
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                )
              })}
              {flatCount === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {isActionMode
                      ? searchQuery
                        ? `No actions matching "${searchQuery}"`
                        : 'No actions available'
                      : `No tools matching "${searchQuery}"`}
                  </p>
                  <p className="mt-2 text-xs text-[var(--color-text-muted)] opacity-60">
                    {isActionMode
                      ? 'Remove > to search tools instead'
                      : 'Tip: type > to search actions'}
                  </p>
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-3 border-t border-[var(--color-border)] px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>esc close</span>
              {!isActionMode && <span className="ml-auto">&gt; actions</span>}
            </div>
          </div>
        </>
      )}
    </>
  )
}
