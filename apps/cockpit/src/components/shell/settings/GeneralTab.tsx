/** Settings → General: appearance, window behaviour and the updater. */
import { useCallback, useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useUpdaterStore } from '@/stores/updater.store'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  ArrowCircleUpIcon,
  ArrowClockwiseIcon,
  DownloadSimpleIcon,
  SpinnerIcon,
} from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Toggle } from '@/components/shared/Toggle'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { ThemePicker } from '@/components/shell/ThemePicker'
import { getVersion } from '@tauri-apps/api/app'
import { SettingRow } from '@/components/shell/settings/SettingControls'

export function GeneralTab() {
  const update = useSettingsStore((s) => s.update)
  const theme = useSettingsStore((s) => s.theme)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const shellStyle = useSettingsStore((s) => s.shellStyle)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const checkForUpdatesAutomatically = useSettingsStore((s) => s.checkForUpdatesAutomatically)
  const downloadUpdatesAutomatically = useSettingsStore((s) => s.downloadUpdatesAutomatically)
  const notifyWhenUpdateAvailable = useSettingsStore((s) => s.notifyWhenUpdateAvailable)
  const addToast = useUiStore((s) => s.addToast)

  const isChecking = useUpdaterStore((s) => s.isChecking)
  const lastCheckedAt = useUpdaterStore((s) => s.lastCheckedAt)
  const updateInfo = useUpdaterStore((s) => s.updateInfo)
  const checkForUpdate = useUpdaterStore((s) => s.checkForUpdate)
  const isDownloading = useUpdaterStore((s) => s.isDownloading)
  const isReady = useUpdaterStore((s) => s.isReady)
  const progress = useUpdaterStore((s) => s.progress)
  const downloadUpdate = useUpdaterStore((s) => s.downloadUpdate)
  const restartToUpdate = useUpdaterStore((s) => s.restartToUpdate)

  const [appVersion, setAppVersion] = useState<string | null>(null)
  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {})
  }, [])

  const handleAlwaysOnTop = useCallback(
    (checked: boolean) => {
      getCurrentWindow()
        .setAlwaysOnTop(checked)
        .then(() => update('alwaysOnTop', checked))
        .catch(() => addToast('Failed to update window pin state', 'error'))
    },
    [addToast, update]
  )

  const lastCheckedLabel = lastCheckedAt
    ? `Last checked ${new Date(lastCheckedAt).toLocaleTimeString()}`
    : null

  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-1 text-xs text-[var(--color-text)]">Theme</h4>
        <p className="mb-2 text-2xs text-[var(--color-text-muted)]">
          Appearance mode for the app — hover or focus a swatch to preview it
        </p>
        <ThemePicker value={theme} onChange={(v) => void update('theme', v).catch(() => {})} />
      </div>

      <div>
        <h4 className="mb-1 text-xs text-[var(--color-text)]">Shell layout</h4>
        <p className="mb-2 text-2xs text-[var(--color-text-muted)]">
          Floating insets the panels into cards; flush packs them edge to edge and gives you back
          about 16px in each direction
        </p>
        <SegmentedControl
          aria-label="Shell layout"
          value={shellStyle}
          options={[
            { value: 'floating', label: 'Floating' },
            { value: 'flush', label: 'Flush' },
          ]}
          onChange={(v) => void update('shellStyle', v).catch(() => {})}
        />
      </div>

      <div className="space-y-1">
        <SettingRow label="Always on Top" hint="Keep window above all others">
          <Toggle checked={alwaysOnTop} onChange={handleAlwaysOnTop} />
        </SettingRow>
        <SettingRow label="Sidebar Collapsed" hint="Start with sidebar collapsed">
          <Toggle
            checked={sidebarCollapsed}
            onChange={(v) => void update('sidebarCollapsed', v).catch(() => {})}
          />
        </SettingRow>
      </div>

      {/* Updates */}
      <div>
        <SectionLabel as="h4" className="mb-2">
          <ArrowCircleUpIcon size={12} />
          Updates
        </SectionLabel>
        <div className="space-y-1">
          <SettingRow label="Check for updates automatically" hint="Check on every app launch">
            <Toggle
              checked={checkForUpdatesAutomatically}
              onChange={(v) => void update('checkForUpdatesAutomatically', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow
            label="Download update automatically"
            hint="Download in the background, then offer a restart"
          >
            <Toggle
              checked={downloadUpdatesAutomatically}
              onChange={(v) => void update('downloadUpdatesAutomatically', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Notify when update is available" hint="Show banner at top of app">
            <Toggle
              checked={notifyWhenUpdateAvailable}
              onChange={(v) => void update('notifyWhenUpdateAvailable', v).catch(() => {})}
            />
          </SettingRow>
        </div>

        <div className="mt-2 flex items-center gap-3">
          {appVersion && (
            <span className="text-2xs text-[var(--color-text-muted)]">v{appVersion}</span>
          )}
          <button
            type="button"
            onClick={() => {
              void checkForUpdate(true)
            }}
            disabled={isChecking}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50"
          >
            {isChecking ? (
              <SpinnerIcon size={12} className="animate-spin" />
            ) : (
              <ArrowCircleUpIcon size={12} />
            )}
            {isChecking ? 'Checking…' : 'Check Now'}
          </button>
          {/* The banner can be dismissed and notifications can be off, so this is the one place an
              update is always reachable. Without it an auto-downloaded update could sit staged with
              nothing in the app offering to install it. */}
          {updateInfo && isDownloading && (
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <SpinnerIcon size={12} className="animate-spin text-[var(--color-accent)]" />
              {progress === null ? 'Downloading…' : `Downloading… ${Math.round(progress * 100)}%`}
            </span>
          )}
          {updateInfo && !isDownloading && isReady && (
            <button
              type="button"
              onClick={() => {
                void restartToUpdate()
              }}
              className="flex items-center gap-1.5 rounded border border-[var(--color-accent)] px-2.5 py-1.5 text-xs text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <ArrowClockwiseIcon size={12} aria-hidden="true" />
              Restart to update to v{updateInfo.version}
            </button>
          )}
          {updateInfo && !isDownloading && !isReady && (
            <button
              type="button"
              onClick={() => {
                void downloadUpdate()
              }}
              className="flex items-center gap-1.5 rounded border border-[var(--color-accent)] px-2.5 py-1.5 text-xs text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <DownloadSimpleIcon size={12} aria-hidden="true" />
              Download v{updateInfo.version}
            </button>
          )}
          {!updateInfo && lastCheckedLabel && (
            <span className="text-2xs text-[var(--color-text-muted)]">{lastCheckedLabel}</span>
          )}
        </div>
      </div>
    </div>
  )
}
