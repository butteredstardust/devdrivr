/**
 * Settings → Theme: the theme picker, on its own.
 *
 * The picker is a grid of more than twenty live previews. Sharing General with the window and
 * updater rows pushed it into a scroll region, so choosing a theme meant scrolling past settings
 * that have nothing to do with appearance.
 */
import { useSettingsStore } from '@/stores/settings.store'
import { ThemePicker } from '@/components/shell/ThemePicker'

export function ThemeTab() {
  const update = useSettingsStore((s) => s.update)
  const theme = useSettingsStore((s) => s.theme)

  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-1 text-xs text-[var(--color-text)]">Theme</h4>
        <p className="mb-2 text-2xs text-[var(--color-text-muted)]">
          Appearance mode for the app — hover or focus a swatch to preview it
        </p>
        <ThemePicker value={theme} onChange={(v) => void update('theme', v).catch(() => {})} />
      </div>
    </div>
  )
}
