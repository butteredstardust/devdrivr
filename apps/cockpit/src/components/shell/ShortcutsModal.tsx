import { Dialog } from '@/components/shared/Dialog'
import { Kbd } from '@/components/shared/Kbd'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { useUiStore } from '@/stores/ui.store'

type ShortcutEntry = {
  /** Combo notation, as `useKeyboardShortcut` and `Kbd` both read it. */
  keys: string
  action: string
}

type ShortcutCategory = {
  label: string
  shortcuts: ShortcutEntry[]
}

// Written as combos rather than pre-rendered symbols: `Kbd` resolves `mod` per platform, so this
// table can't say ⌘ to a Windows user the way the old `getCategories(modSymbol)` shape invited.
const CATEGORIES: ShortcutCategory[] = [
  {
    label: 'Navigation',
    shortcuts: [
      { keys: 'mod+k', action: 'Command palette' },
      { keys: 'mod+b', action: 'Toggle sidebar' },
      { keys: 'mod+]', action: 'Next tool' },
      { keys: 'mod+[', action: 'Previous tool' },
    ],
  },
  // Tab shortcuts used to sit under "Editor", which is where you'd look for
  // them last — they act on the workspace, not on the tool inside it.
  {
    label: 'Tabs',
    shortcuts: [
      { keys: 'mod+1 / 2 / 3', action: 'Switch to tab by position' },
      { keys: 'ctrl+tab', action: 'Switch to recently used tab' },
      { keys: 'ctrl+shift+tab', action: 'Switch back through recent tabs' },
      { keys: 'mod+w', action: 'Close tab' },
    ],
  },
  {
    label: 'Notes',
    shortcuts: [{ keys: 'mod+shift+n', action: 'Toggle notes drawer' }],
  },
  {
    label: 'Editor',
    shortcuts: [
      { keys: 'mod+enter', action: 'Execute / Run' },
      { keys: 'mod+shift+c', action: 'Copy output' },
      { keys: 'mod+o', action: 'Open file' },
      { keys: 'mod+s', action: 'Save file' },
    ],
  },
  {
    label: 'Window',
    shortcuts: [
      { keys: 'mod+,', action: 'Settings' },
      { keys: 'mod+shift+t', action: 'Toggle theme' },
      { keys: 'mod+shift+p', action: 'Toggle always-on-top' },
      { keys: 'mod+/', action: 'Keyboard shortcuts' },
    ],
  },
]

export function ShortcutsModal() {
  const open = useUiStore((s) => s.shortcutsModalOpen)
  const setOpen = useUiStore((s) => s.setShortcutsModalOpen)

  if (!open) return null

  return (
    <Dialog
      title="Keyboard Shortcuts"
      onClose={() => setOpen(false)}
      closeLabel="Close shortcuts"
      className="w-full max-w-[560px]"
      bodyClassName="max-h-[70vh] px-4 py-3"
      titleClassName="text-[var(--color-accent)]"
    >
      {CATEGORIES.map((cat) => (
        <div key={cat.label} className="mb-4 last:mb-0">
          <SectionLabel as="h3" className="mb-2">
            {cat.label}
          </SectionLabel>
          <div className="flex flex-col gap-1">
            {cat.shortcuts.map((s) => (
              <div key={s.action} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-[var(--color-text)]">{s.action}</span>
                <Kbd keys={s.keys} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Dialog>
  )
}
