import { useUpdaterStore } from '@/stores/updater.store'
import { useSettingsStore } from '@/stores/settings.store'
import { ArrowCircleUpIcon, XIcon, DownloadSimpleIcon, SpinnerIcon } from '@phosphor-icons/react'

export function UpdateNotification() {
  const updateInfo = useUpdaterStore((s) => s.updateInfo)
  const dismissed = useUpdaterStore((s) => s.dismissed)
  const isDownloading = useUpdaterStore((s) => s.isDownloading)
  const downloadProgress = useUpdaterStore((s) => s.downloadProgress)
  const dismiss = useUpdaterStore((s) => s.dismiss)
  const downloadUpdate = useUpdaterStore((s) => s.downloadUpdate)
  const notifyWhenUpdateAvailable = useSettingsStore((s) => s.notifyWhenUpdateAvailable)

  if (!updateInfo || dismissed || !notifyWhenUpdateAvailable) return null

  const handleDownload = () => {
    downloadUpdate().catch(() => {})
  }

  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-2">
      <ArrowCircleUpIcon size={14} className="shrink-0 text-[var(--color-accent)]" />
      <span className="flex-1 text-xs text-[var(--color-text)]">
        <span className="font-medium text-[var(--color-accent)]">
          devdrivr v{updateInfo.version}
        </span>{' '}
        is available
        {updateInfo.notes ? ` — ${updateInfo.notes}` : ''}
      </span>

      {isDownloading ? (
        <div className="flex items-center gap-2">
          <SpinnerIcon size={12} className="animate-spin text-[var(--color-accent)]" />
          <span className="text-xs text-[var(--color-text-muted)]">{downloadProgress}%</span>
        </div>
      ) : (
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded border border-[var(--color-accent)] px-2.5 py-1 text-xs text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)]"
        >
          <DownloadSimpleIcon size={12} />
          Download
        </button>
      )}

      <button
        onClick={dismiss}
        aria-label="Dismiss update notification"
        className="rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
      >
        <XIcon size={12} />
      </button>
    </div>
  )
}
