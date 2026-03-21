import { useSettingsStore } from '@/stores/settings.store'

export function NotesDrawer() {
  const drawerOpen = useSettingsStore((s) => s.notesDrawerOpen)

  if (!drawerOpen) return null

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-10 items-center border-b border-[var(--color-border)] px-3">
        <span className="font-pixel text-xs text-[var(--color-text-muted)]">Notes</span>
      </div>
      <div className="flex flex-1 items-center justify-center p-4 text-xs text-[var(--color-text-muted)]">
        Notes will appear here (Plan 4)
      </div>
    </aside>
  )
}
