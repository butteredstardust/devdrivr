import { GearSixIcon, KeyboardIcon, MagnifyingGlassIcon, NotebookIcon } from '@phosphor-icons/react'
import { getToolById } from '@/app/tool-registry'
import { usePlatform } from '@/hooks/usePlatform'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { WindowControls } from './WindowControls'

const FOCUS_RING = 'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]'

const ICON_BUTTON_CLASS = `flex items-center justify-center rounded p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors ${FOCUS_RING}`

/**
 * Unified client-side-decorated title bar (Safari-style). Replaces the native titlebar removed
 * by `decorations: false` in tauri.conf.json.
 *
 * A dedicated background layer carries `data-tauri-drag-region` so the window can be
 * dragged/double-click-zoomed from empty space. Interactive controls are siblings above it, never
 * descendants of a native drag region; this keeps pointer and keyboard focus transitions under
 * normal browser control.
 */
export function TitleBar() {
  const { isMac, modSymbol } = usePlatform()

  const update = useSettingsStore((s) => s.update)
  const notesDrawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const toggleSettingsPanel = useUiStore((s) => s.toggleSettingsPanel)
  const toggleShortcutsModal = useUiStore((s) => s.toggleShortcutsModal)
  const hasNotes = useNotesStore((s) => s.notes.length > 0)
  const activeTool = useUiStore((s) => s.activeTool)
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)

  const tool = getToolById(activeTool)
  const shortcutHint = isMac ? `${modSymbol}K` : `${modSymbol}+K`

  const toggleNotes = () => {
    void update('notesDrawerOpen', !notesDrawerOpen)
  }

  return (
    <div
      className={`font-ui relative flex h-11 shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] ${isMac ? 'pl-[78px]' : 'pl-2'} pr-2`}
    >
      <div
        data-tauri-drag-region
        data-testid="titlebar-drag-region"
        aria-hidden="true"
        className="absolute inset-0"
      />
      {isMac && (
        <div
          data-testid="titlebar-mac-controls"
          className="absolute left-3 top-1/2 -translate-y-1/2"
        >
          <WindowControls />
        </div>
      )}

      <div className="relative flex items-center gap-1">
        <button
          type="button"
          onClick={toggleNotes}
          className={ICON_BUTTON_CLASS}
          title="Notes"
          aria-label="Toggle notes drawer"
        >
          <span className="relative">
            <NotebookIcon size={16} />
            {hasNotes && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={toggleSettingsPanel}
          className={ICON_BUTTON_CLASS}
          title="Settings"
          aria-label="Open settings"
        >
          <GearSixIcon size={16} />
        </button>
        <button
          type="button"
          onClick={toggleShortcutsModal}
          className={ICON_BUTTON_CLASS}
          title="Keyboard Shortcuts"
          aria-label="Open keyboard shortcuts"
        >
          <KeyboardIcon size={16} />
        </button>
      </div>

      {/* Absolutely centred on the full bar width (Safari-style) — stays centred regardless of
          how wide the left cluster or right-side window controls are, rather than merely sitting
          between two flex siblings. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-2">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="Open command palette"
          className={`pointer-events-auto flex w-full min-w-0 max-w-[480px] items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] shadow-sm transition-colors hover:bg-[var(--color-surface-hover)] ${FOCUS_RING}`}
        >
          <MagnifyingGlassIcon size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-left">
            {tool?.name ?? 'Search tools and commands'}
          </span>
          <kbd className="shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
            {shortcutHint}
          </kbd>
        </button>
      </div>

      {!isMac && (
        <div data-testid="titlebar-right-controls" className="ml-auto flex items-center">
          <WindowControls />
        </div>
      )}
    </div>
  )
}
