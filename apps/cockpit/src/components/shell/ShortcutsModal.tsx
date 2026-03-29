import { useEffect } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { usePlatform } from '@/hooks/usePlatform'
import { XIcon } from '@phosphor-icons/react'

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
      shortcuts: [
        { keys: [mod, 'Shift', 'N'], action: 'Toggle notes drawer' },
      ],
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

  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, setOpen])

  if (!open) return null

  const categories = getCategories(modSymbol)

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => setOpen(false)}
      />
      <div className="animate-fade-in fixed left-1/2 top-1/2 z-50 w-full max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-pixel text-sm text-[var(--color-accent)]">Keyboard Shortcuts</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts"
            className="rounded p-1 text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <XIcon size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
          {categories.map((cat) => (
            <div key={cat.label} className="mb-4 last:mb-0">
              <h3 className="mb-2 font-pixel text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
                {cat.label}
              </h3>
              <div className="flex flex-col gap-1">
                {cat.shortcuts.map((s) => (
                  <div
                    key={s.action}
                    className="flex items-center justify-between py-1.5"
                  >
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
        </div>
      </div>
    </>
  )
}
