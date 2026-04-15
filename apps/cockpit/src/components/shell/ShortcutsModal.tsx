import { Dialog } from '@/components/shared/Dialog'
import { useUiStore } from '@/stores/ui.store'
import { usePlatform } from '@/hooks/usePlatform'

type ShortcutEntry = {
  keys: string[]
  action: string
}

type ShortcutCategory = {
  label: string
  shortcuts: ShortcutEntry[]
}

function getCategories(mod: string): ShortcutCategory[] {
  return [
    {
      label: 'Navigation',
      shortcuts: [
        { keys: [mod, 'K'], action: 'Command palette' },
        { keys: [mod, 'B'], action: 'Toggle sidebar' },
        { keys: [mod, ']'], action: 'Next tool' },
        { keys: [mod, '['], action: 'Previous tool' },
      ],
    },
    {
      label: 'Notes',
      shortcuts: [{ keys: [mod, 'Shift', 'N'], action: 'Toggle notes drawer' }],
    },
    {
      label: 'Editor',
      shortcuts: [
        { keys: [mod, 'Enter'], action: 'Execute / Run' },
        { keys: [mod, 'Shift', 'C'], action: 'Copy output' },
        { keys: [mod, '1 / 2 / 3'], action: 'Switch tab' },
        { keys: [mod, 'O'], action: 'Open file' },
        { keys: [mod, 'S'], action: 'Save file' },
      ],
    },
    {
      label: 'Window',
      shortcuts: [
        { keys: [mod, ','], action: 'Settings' },
        { keys: [mod, 'Shift', 'T'], action: 'Toggle theme' },
        { keys: [mod, 'Shift', 'P'], action: 'Toggle always-on-top' },
        { keys: [mod, '/'], action: 'Keyboard shortcuts' },
      ],
    },
  ]
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text)]">
      {children}
    </kbd>
  )
}

export function ShortcutsModal() {
  const open = useUiStore((s) => s.shortcutsModalOpen)
  const setOpen = useUiStore((s) => s.setShortcutsModalOpen)
  const { modSymbol } = usePlatform()

  if (!open) return null

  const categories = getCategories(modSymbol)

  return (
    <Dialog
      title="Keyboard Shortcuts"
      onClose={() => setOpen(false)}
      closeLabel="Close shortcuts"
      className="w-full max-w-[560px]"
      bodyClassName="max-h-[70vh] px-4 py-3"
      titleClassName="text-[var(--color-accent)]"
    >
      {categories.map((cat) => (
        <div key={cat.label} className="mb-4 last:mb-0">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            {cat.label}
          </h3>
          <div className="flex flex-col gap-1">
            {cat.shortcuts.map((s) => (
              <div key={s.action} className="flex items-center justify-between py-1.5">
                <span className="text-xs text-[var(--color-text)]">{s.action}</span>
                <div className="flex items-center gap-1">
                  {s.keys.map((k, i) => (
                    <Kbd key={i}>{k}</Kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Dialog>
  )
}
