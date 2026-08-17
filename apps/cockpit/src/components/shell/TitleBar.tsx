import { GearSixIcon, KeyboardIcon, NotebookIcon } from '@phosphor-icons/react'
import { usePlatform } from '@/hooks/usePlatform'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { CommandPalette } from '@/components/shell/CommandPalette'
import { WindowControls } from '@/components/shell/WindowControls'

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
 *
 * Layering inside the bar is explicit rather than inherited from DOM order: the drag layer is the
 * floor (`z-0`) and every interactive cluster sits a tier above it (`relative z-10`). An
 * absolutely-positioned `z-index: auto` layer paints above any *non-positioned* sibling no matter
 * where it appears in the markup, so relying on source order alone is what let the drag layer
 * swallow every Windows window-control click. Stating the tiers follows the same rule as the app's
 * overlay scale in styles/tokens.css — layering must not depend on DOM position — and keeps this
 * bar safe to reorder. Both tiers stay below the `z-[39]` window resize handles and the `--z-scrim`
 * overlay tiers, which must still win over the title bar.
 */
export function TitleBar() {
  const { isMac } = usePlatform()

  const update = useSettingsStore((s) => s.update)
  const notesDrawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const toggleSettingsPanel = useUiStore((s) => s.toggleSettingsPanel)
  const toggleShortcutsModal = useUiStore((s) => s.toggleShortcutsModal)
  const hasNotes = useNotesStore((s) => s.notes.length > 0)

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
        className="absolute inset-0 z-0"
      />
      {isMac && (
        <div
          data-testid="titlebar-mac-controls"
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2"
        >
          <WindowControls />
        </div>
      )}

      <div className="relative z-10 flex items-center gap-1">
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
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-2">
        <CommandPalette />
      </div>

      {!isMac && (
        <div
          data-testid="titlebar-right-controls"
          className="relative z-10 ml-auto flex items-center"
        >
          <WindowControls />
        </div>
      )}
    </div>
  )
}
