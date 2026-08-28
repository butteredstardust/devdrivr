import { useUpdaterStore } from '@/stores/updater.store'
import { useSettingsStore } from '@/stores/settings.store'
import {
  ArrowCircleUpIcon,
  ArrowClockwiseIcon,
  XIcon,
  DownloadSimpleIcon,
  SpinnerIcon,
} from '@phosphor-icons/react'

export function UpdateNotification() {
  const updateInfo = useUpdaterStore((s) => s.updateInfo)
  const dismissed = useUpdaterStore((s) => s.dismissed)
  const isDownloading = useUpdaterStore((s) => s.isDownloading)
  const isReady = useUpdaterStore((s) => s.isReady)
  const isInstalling = useUpdaterStore((s) => s.isInstalling)
  const progress = useUpdaterStore((s) => s.progress)
  const dismiss = useUpdaterStore((s) => s.dismiss)
  const downloadUpdate = useUpdaterStore((s) => s.downloadUpdate)
  const restartToUpdate = useUpdaterStore((s) => s.restartToUpdate)
  const notifyWhenUpdateAvailable = useSettingsStore((s) => s.notifyWhenUpdateAvailable)

  if (!updateInfo || dismissed) return null
  // "Notify when update is available" governs the announcement, not the install. Once a download
  // has been staged there is a pending action the user has to be able to reach, so a downloaded or
  // downloading update stays visible even with notifications off — otherwise auto-download can
  // stage an update that nothing in the app offers to install. Dismiss still hides it;
  // Settings → Updates keeps a restart action for that case.
  if (!isReady && !isDownloading && !notifyWhenUpdateAvailable) return null

  const handleDownload = () => {
    void downloadUpdate()
  }

  const handleRestart = () => {
    void restartToUpdate()
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 border-b border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-2"
    >
      <ArrowCircleUpIcon size={14} className="shrink-0 text-[var(--color-accent)]" />
      <span className="flex-1 text-xs text-[var(--color-text)]">
        <span className="font-medium text-[var(--color-accent)]">
          devdrivr v{updateInfo.version}
        </span>{' '}
        {isReady ? 'is ready to install' : 'is available'}
        {!isReady && updateInfo.notes ? ` — ${updateInfo.notes}` : ''}
      </span>

      {isDownloading ? (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <SpinnerIcon size={12} className="animate-spin text-[var(--color-accent)]" />
          {progress === null ? 'Downloading…' : `Downloading… ${Math.round(progress * 100)}%`}
        </div>
      ) : isReady ? (
        <button
          type="button"
          onClick={handleRestart}
          disabled={isInstalling}
          className="flex min-h-8 items-center gap-1.5 rounded border border-[var(--color-accent)] px-2.5 py-1 text-xs text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50"
        >
          <ArrowClockwiseIcon size={12} aria-hidden="true" />
          {isInstalling ? 'Installing…' : 'Restart to update'}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleDownload}
          className="flex min-h-8 items-center gap-1.5 rounded border border-[var(--color-accent)] px-2.5 py-1 text-xs text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <DownloadSimpleIcon size={12} aria-hidden="true" />
          Download
        </button>
      )}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss update notification"
        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <XIcon size={12} aria-hidden="true" />
      </button>
    </div>
  )
}
