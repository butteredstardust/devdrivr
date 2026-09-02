import { useMemo, useState } from 'react'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input } from '@/components/shared/Input'
import { Kbd } from '@/components/shared/Kbd'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { formatShortcut } from '@/lib/shortcut-label'
import { useUiStore } from '@/stores/ui.store'
import { detectPlatform } from '@/lib/platform'

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
function getCategories(): ShortcutCategory[] {
  // `F11` is capitalised because `formatShortcut` only upper-cases single characters; a
  // multi-character token it does not recognise is echoed verbatim, so `f11` would render lowercase.
  const fullscreenKeys = detectPlatform() === 'mac' ? 'ctrl+mod+f' : 'F11'
  return [
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
        { keys: fullscreenKeys, action: 'Toggle full screen' },
        { keys: 'mod+/', action: 'Keyboard shortcuts' },
      ],
    },
  ]
}

export function ShortcutsModal() {
  const open = useUiStore((s) => s.shortcutsModalOpen)
  const setOpen = useUiStore((s) => s.setShortcutsModalOpen)
  const [query, setQuery] = useState('')

  // Substring, not fuzzy. The list is ~25 entries of two or three words, and
  // Fuse at the palette's 0.4 threshold matches "tab" against "Toggle sidebar"
  // — on a reference table, a wrong row is worse than no row. Matching the
  // rendered shortcut too means "⌘K" and "cmd" both find the palette.
  const categories = useMemo(() => {
    const allCategories = getCategories()
    const q = query.trim().toLowerCase()
    if (!q) return allCategories
    return allCategories
      .map((cat) => ({
        ...cat,
        shortcuts: cat.shortcuts.filter((s) =>
          `${s.action} ${s.keys} ${formatShortcut(s.keys)}`.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.shortcuts.length > 0)
  }, [query])

  if (!open) return null

  return (
    <Dialog
      title="Keyboard Shortcuts"
      onClose={() => setOpen(false)}
      closeLabel="Close shortcuts"
      size="lg"
      // Fills the dialog's 90vh rather than stopping at 70vh, and lets the search
      // row stay put while only the table below it scrolls.
      bodyClassName="flex min-h-0 flex-col p-0"
      titleClassName="text-[var(--color-accent)]"
    >
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <Input
          type="search"
          aria-label="Filter shortcuts"
          placeholder="Filter shortcuts…"
          className="w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {categories.length === 0 ? (
          <EmptyState
            size="sm"
            title="No matching shortcuts"
            description={`Nothing matches “${query.trim()}”.`}
          />
        ) : (
          categories.map((cat) => (
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
          ))
        )}
      </div>
    </Dialog>
  )
}
