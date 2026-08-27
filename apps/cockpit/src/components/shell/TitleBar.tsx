import { GearSixIcon, KeyboardIcon, NotebookIcon } from '@phosphor-icons/react'
import { usePlatform } from '@/hooks/usePlatform'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { CommandPalette } from '@/components/shell/CommandPalette'
import { WindowControls } from '@/components/shell/WindowControls'

const FOCUS_RING = 'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]'

const ICON_BUTTON_CLASS = `flex items-center justify-center rounded p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors ${FOCUS_RING}`

const SIDE_CLUSTER_CLASS = 'relative z-10 flex items-center gap-1'

/**
 * Horizontal space the centred palette overlay keeps clear on *both* sides, so it can never reach
 * a cluster no matter how narrow the window gets. Symmetric by construction — an asymmetric
 * reserve would decentre the palette, which is the whole reason the overlay exists.
 *
 * Sized to the widest cluster on each platform, since the reserve has to clear both:
 *   macOS   — leading is 12px gutter + 76px traffic-light allowance + a 28px button = 116px;
 *             trailing is 12 + two 28px buttons + gap = 72px. Reserve 120.
 *   others  — leading is 12 + 28 = 40px; trailing adds the 3×46px window controls to the two
 *             buttons and their gaps = ~218px. Reserve 224.
 */
const SIDE_RESERVE_CLASS = { mac: 'px-[120px]', other: 'px-[224px]' } as const

/**
 * Unified client-side-decorated title bar (Safari-style). Replaces the native titlebar removed
 * by `decorations: false` in tauri.conf.json.
 *
 * That same flag also costs the window its rounded corners on macOS, which `src-tauri/src/
 * window_corners.rs` puts back by clipping the content layer. If decorations are ever restored,
 * that module becomes redundant — check it alongside this file.
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
 *
 * The palette used to be centred by an absolutely-positioned full-width overlay, which kept it
 * centred but let it centre *through* the left cluster: it is 480px wide, so below a window width
 * of 820px its left edge crossed x=170 and painted over the icon buttons. The overlay was
 * `pointer-events-none`, so those buttons stayed clickable while being invisible — worse than
 * plain occlusion. `minWidth` in tauri.conf.json is 800, so this was reachable at the smallest
 * window the app allows.
 *
 * The overlay stays — true window-centring is the point of the design, and equal-flex side columns
 * cannot deliver it here, because the macOS traffic-light allowance is padding on one side only
 * and slides all three columns left (measured: palette centre 794 against a window centre of 756).
 * Instead the overlay reserves a symmetric `SIDE_RESERVE` gutter wide enough for the *widest*
 * cluster, so the palette is centred on the window and still cannot reach either cluster. It
 * shrinks below its 480px maximum rather than overlapping.
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
      // The hairline is an inset shadow rather than `border-b` so this row's content box stays an
      // even 44px. With a border it was 43px, and centring an even-sized icon in an odd box lands it
      // on a half pixel — which is why every control up here (window buttons, notes, settings,
      // shortcuts, and the palette's magnifier) rendered a touch soft and low. Shadow draws the same
      // 1px line without taking a pixel out of the box.
      className={`shell-chrome font-ui relative flex h-11 shrink-0 items-center bg-[var(--color-surface)] px-3 shadow-[inset_0_-1px_0_var(--color-border)]`}
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

      {/* Left: the one control with state worth glancing at. Settings and Shortcuts moved to the
          trailing edge — both are modal, rarely-used and reachable from the palette, and keeping
          three buttons here left only 14px between them and the macOS traffic lights, so the
          cluster read as a fourth window control. */}
      <div className={`${SIDE_CLUSTER_CLASS} ${isMac ? 'ml-[76px]' : ''}`}>
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
      </div>

      {/* `@container` makes the reserved gutter the query container for the palette inside it, so
          the palette can drop its own trimmings as the window narrows. It has to degrade rather
          than just shrink: the ⌘K chip is `shrink-0`, so once the slot fell below ~200px the chip
          stopped fitting and spilled out over the settings and shortcuts buttons instead of
          truncating with everything else. That is reachable on Windows well before it is on
          macOS, because the trailing cluster there also carries the three window controls and the
          symmetric reserve is 224px a side against macOS's 120. */}
      <div
        data-testid="titlebar-palette-slot"
        className={`@container pointer-events-none absolute inset-0 z-10 flex items-center justify-center ${
          isMac ? SIDE_RESERVE_CLASS.mac : SIDE_RESERVE_CLASS.other
        }`}
      >
        <CommandPalette />
      </div>

      <div className={`${SIDE_CLUSTER_CLASS} ml-auto`}>
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
        {!isMac && (
          <div data-testid="titlebar-right-controls" className="ml-1 flex items-center">
            <WindowControls />
          </div>
        )}
      </div>
    </div>
  )
}
