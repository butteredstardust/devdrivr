/** Settings → General: shell layout, window behaviour and the updater. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useUpdaterStore } from '@/stores/updater.store'
import {
  ArrowCircleUpIcon,
  ArrowClockwiseIcon,
  DownloadSimpleIcon,
  SpinnerIcon,
} from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Toggle } from '@/components/shared/Toggle'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { getVersion } from '@tauri-apps/api/app'
import {
  NumericSettingInput,
  SettingRow,
  SelectInput,
} from '@/components/shell/settings/SettingControls'
import {
  clampNotesDrawerWidth,
  clampSidebarWidth,
  MAX_NOTES_DRAWER_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_NOTES_DRAWER_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '@/lib/shell-layout'
import { setAlwaysOnTop } from '@/lib/always-on-top'

const POPULAR_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
] as const

export function GeneralTab() {
  const update = useSettingsStore((s) => s.update)
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop)
  const shellStyle = useSettingsStore((s) => s.shellStyle)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth)
  const notesDrawerWidth = useSettingsStore((s) => s.notesDrawerWidth)
  const recentToolsLimit = useSettingsStore((s) => s.recentToolsLimit)
  const restoreWorkspaceOnLaunch = useSettingsStore((s) => s.restoreWorkspaceOnLaunch)
  const defaultTimezone = useSettingsStore((s) => s.defaultTimezone)
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
  const isInstalling = useUpdaterStore((s) => s.isInstalling)
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
      setAlwaysOnTop(checked).catch(() => addToast('Failed to update window pin state', 'error'))
    },
    [addToast]
  )

  const timezoneOptions = useMemo(() => {
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return [
      localTimezone,
      ...POPULAR_TIMEZONES.filter((timezone) => timezone !== localTimezone),
    ].map((timezone) => ({ value: timezone, label: timezone.replace(/_/g, ' ') }))
  }, [])

  const lastCheckedLabel = lastCheckedAt
    ? `Last checked ${new Date(lastCheckedAt).toLocaleTimeString()}`
    : null

  return (
    <div className="space-y-4">
      <div>
        <SectionLabel as="h4" className="mb-2">
          Appearance
        </SectionLabel>
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
        <div className="mt-2 space-y-1">
          <SettingRow label="Recent Tools Limit" hint="Visible shortcuts in recent tool lists">
            <NumericSettingInput
              value={recentToolsLimit}
              min={0}
              max={5}
              clamp={(value) => Math.max(0, Math.min(5, Math.round(value)))}
              unit="tools"
              onCommit={(value) => void update('recentToolsLimit', value).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Sidebar Width" hint="Expanded sidebar width">
            <NumericSettingInput
              value={sidebarWidth}
              min={MIN_SIDEBAR_WIDTH}
              max={MAX_SIDEBAR_WIDTH}
              clamp={clampSidebarWidth}
              unit="px"
              onCommit={(value) => void update('sidebarWidth', value).catch(() => {})}
            />
          </SettingRow>
          <SettingRow label="Notes Drawer Width" hint="Open notes drawer width">
            <NumericSettingInput
              value={notesDrawerWidth}
              min={MIN_NOTES_DRAWER_WIDTH}
              max={MAX_NOTES_DRAWER_WIDTH}
              clamp={clampNotesDrawerWidth}
              unit="px"
              onCommit={(value) => void update('notesDrawerWidth', value).catch(() => {})}
            />
          </SettingRow>
        </div>
      </div>

      <div>
        <SectionLabel as="h4" className="mb-2">
          Window
        </SectionLabel>
        <div className="space-y-1">
          <SettingRow label="Always on Top" hint="Keep window above all others">
            <Toggle checked={alwaysOnTop} onChange={handleAlwaysOnTop} />
          </SettingRow>
        </div>
      </div>

      <div>
        <SectionLabel as="h4" className="mb-2">
          Startup
        </SectionLabel>
        <div className="space-y-1">
          <SettingRow label="Sidebar Collapsed" hint="Start with sidebar collapsed">
            <Toggle
              checked={sidebarCollapsed}
              onChange={(v) => void update('sidebarCollapsed', v).catch(() => {})}
            />
          </SettingRow>
          <SettingRow
            label="Restore Workspace on Launch"
            hint="Reopen saved tabs when devdrivr starts"
          >
            <Toggle
              checked={restoreWorkspaceOnLaunch}
              onChange={(value) => void update('restoreWorkspaceOnLaunch', value).catch(() => {})}
            />
          </SettingRow>
        </div>
      </div>

      <div>
        <SectionLabel as="h4" className="mb-2">
          Tool defaults
        </SectionLabel>
        <SettingRow label="Default Timezone" hint="Used by Timestamp Converter">
          <SelectInput
            value={defaultTimezone}
            onChange={(value) => void update('defaultTimezone', value).catch(() => {})}
            options={timezoneOptions}
          />
        </SettingRow>
      </div>

      {/* Updates */}
      <div>
        <SectionLabel as="h4" className="mb-2">
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
            hint={
              checkForUpdatesAutomatically
                ? 'Download in the background, then offer a restart'
                : 'Turn on automatic update checks to enable downloads'
            }
          >
            <Toggle
              checked={downloadUpdatesAutomatically}
              disabled={!checkForUpdatesAutomatically}
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
            // A check swaps the handle the download is running against, so it stays disabled until
            // the staged update is dealt with.
            disabled={isChecking || isDownloading || isReady || isInstalling}
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
              disabled={isInstalling}
              className="flex items-center gap-1.5 rounded border border-[var(--color-accent)] px-2.5 py-1.5 text-xs text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50"
            >
              <ArrowClockwiseIcon size={12} aria-hidden="true" />
              {isInstalling ? 'Installing…' : `Restart to update to v${updateInfo.version}`}
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
