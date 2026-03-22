import { Notebook, GearSix, Keyboard } from '@phosphor-icons/react'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useNotesStore } from '@/stores/notes.store'

type SidebarFooterProps = {
  collapsed: boolean
}

export function SidebarFooter({ collapsed }: SidebarFooterProps) {
  const update = useSettingsStore((s) => s.update)
  const notesDrawerOpen = useSettingsStore((s) => s.notesDrawerOpen)
  const toggleSettingsPanel = useUiStore((s) => s.toggleSettingsPanel)
  const toggleShortcutsModal = useUiStore((s) => s.toggleShortcutsModal)
  const hasNotes = useNotesStore((s) => s.notes.length > 0)

  const toggleNotes = () => update('notesDrawerOpen', !notesDrawerOpen)

  const buttonClass =
    'flex items-center justify-center rounded p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors'

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-[var(--color-border)] py-2">
        <button onClick={toggleNotes} className={buttonClass} title="Notes" aria-label="Toggle notes drawer">
          <span className="relative">
            <Notebook size={16} />
            {hasNotes && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            )}
          </span>
        </button>
        <button onClick={toggleSettingsPanel} className={buttonClass} title="Settings" aria-label="Open settings">
          <GearSix size={16} />
        </button>
        <button onClick={toggleShortcutsModal} className={buttonClass} title="Keyboard Shortcuts" aria-label="Open keyboard shortcuts">
          <Keyboard size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1 border-t border-[var(--color-border)] px-3 py-2">
      <button onClick={toggleNotes} className={buttonClass} title="Notes" aria-label="Toggle notes drawer">
        <span className="relative">
          <Notebook size={16} />
          {hasNotes && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
          )}
        </span>
      </button>
      <button onClick={toggleSettingsPanel} className={buttonClass} title="Settings" aria-label="Open settings">
        <GearSix size={16} />
      </button>
      <button onClick={toggleShortcutsModal} className={buttonClass} title="Keyboard Shortcuts" aria-label="Open keyboard shortcuts">
        <Keyboard size={16} />
      </button>
    </div>
  )
}
