import { useEffect, useState } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useHistoryStore } from '@/stores/history.store'
import { getToolById } from '@/app/tool-registry'
import { usePlatform } from '@/hooks/usePlatform'
import { THEME_META } from '@/lib/theme'
import { PushPinIcon, CommandIcon, ClockIcon } from '@phosphor-icons/react'

// ─── Isolated clock component (re-renders only itself every minute) ──

function useClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined
    // Align to the next whole minute, then tick every 60s
    const msToNextMinute = 60_000 - (Date.now() % 60_000)
    const timeoutId = setTimeout(() => {
      setTime(new Date())
      intervalId = setInterval(() => setTime(new Date()), 60_000)
    }, msToNextMinute)
    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [])
  return time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function ClockDisplay() {
  const clock = useClock()
  return (
    <span className="flex items-center gap-1 tabular-nums" title="Current time">
      <ClockIcon size={10} aria-hidden="true" />
      {clock}
    </span>
  )
}

// ─── Status Bar ─────────────────────────────────────────────────────

export function StatusBar() {
  const activeTool = useUiStore((s) => s.activeTool)
  const lastAction = useUiStore((s) => s.lastAction)
  const clearLastAction = useUiStore((s) => s.clearLastAction)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const theme = useSettingsStore((s) => s.theme)
  const editorKeybindingMode = useSettingsStore((s) => s.editorKeybindingMode)
  const historyCount = useHistoryStore((s) => s.entries.length)
  const { modSymbol } = usePlatform()

  const tool = getToolById(activeTool)

  // Clear stale last action when switching tools
  useEffect(() => {
    if (lastAction) clearLastAction()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on tool change
  }, [activeTool])

  const actionColor =
    lastAction?.type === 'error'
      ? 'text-[var(--color-error)]'
      : lastAction?.type === 'success'
        ? 'text-[var(--color-success)]'
        : 'text-[var(--color-text-muted)]'

  const themeLabel =
    theme === 'system' ? 'System' : (THEME_META[theme]?.shortLabel ?? theme)

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[11px]">
      {/* Left: active tool + last action */}
      <div className="flex items-center gap-3">
        <span className="font-medium text-[var(--color-text-muted)]">{tool?.name ?? ''}</span>
        {lastAction && lastAction.message && (
          <span
            key={`${lastAction.message}-${lastAction.timestamp}`}
            className={`animate-fade-in ${actionColor}`}
          >
            {lastAction.message}
          </span>
        )}
      </div>

      {/* Right: indicators */}
      <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
        {historyCount > 0 && (
          <span className="tabular-nums" title={`${historyCount} history entries`}>
            {historyCount} runs
          </span>
        )}
        {editorKeybindingMode !== 'standard' && (
          <span className="uppercase" title="Editor keybinding mode">
            {editorKeybindingMode}
          </span>
        )}
        <span title="Theme">{themeLabel}</span>
        <span
          className="flex items-center gap-1 text-[var(--color-text-muted)] opacity-60"
          title="Command Palette"
        >
          <CommandIcon size={10} aria-hidden="true" />
          <span>{modSymbol}K</span>
        </span>
        {alwaysOnTop && (
          <span title="Pinned">
            <PushPinIcon
              size={12}
              weight="fill"
              className="text-[var(--color-accent)]"
              aria-hidden="true"
            />
          </span>
        )}
        <ClockDisplay />
      </div>
    </div>
  )
}
