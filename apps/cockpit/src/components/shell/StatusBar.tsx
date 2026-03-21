import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { getToolById } from '@/app/tool-registry'

export function StatusBar() {
  const activeTool = useUiStore((s) => s.activeTool)
  const lastAction = useUiStore((s) => s.lastAction)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const theme = useSettingsStore((s) => s.theme)
  const tool = getToolById(activeTool)

  const actionColor =
    lastAction?.type === 'error'
      ? 'text-[var(--color-error)]'
      : lastAction?.type === 'success'
        ? 'text-[var(--color-success)]'
        : 'text-[var(--color-text-muted)]'

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[11px]">
      <div className="flex items-center gap-3">
        <span className="text-[var(--color-text-muted)]">{tool?.name ?? ''}</span>
        {lastAction && (
          <span className={actionColor}>{lastAction.message}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title={`Theme: ${theme}`}
        >
          {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '⚙️'}
        </button>
      </div>
    </div>
  )
}
