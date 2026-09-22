import { useCallback, useEffect, useState } from 'react'
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  CheckIcon,
  FilesIcon,
  SpinnerIcon,
} from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Spinner } from '@/components/shared/Spinner'
import { SettingRow } from '@/components/shell/settings/SettingControls'
import {
  getFileAssociations,
  setFileAssociation,
  type FileAssociationStatus,
} from '@/lib/file-associations'
import { useUiStore } from '@/stores/ui.store'

function AssociationButton({
  label,
  accessibleLabel,
  pending,
  icon,
  onClick,
}: {
  label: string
  accessibleLabel: string
  pending: boolean
  icon: React.ReactNode
  onClick: () => Promise<void>
}) {
  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      disabled={pending}
      onClick={() => {
        void onClick()
      }}
      className="flex min-w-[5.5rem] items-center justify-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-60"
    >
      {pending ? <SpinnerIcon size={12} className="animate-spin" aria-hidden="true" /> : icon}
      {pending ? 'Working…' : label}
    </button>
  )
}

export function FilesTab() {
  const addToast = useUiStore((state) => state.addToast)
  const [data, setData] = useState<FileAssociationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getFileAssociations())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addToast(`Could not read file associations: ${message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const change = async (id: string, enabled: boolean) => {
    setPendingId(id)
    try {
      await setFileAssociation(id, enabled)
      if (data?.management === 'system') {
        addToast('Choose devdrivr in Windows Default Apps', 'info')
      } else {
        addToast(enabled ? 'File association enabled' : 'Previous app restored', 'success')
      }
      await refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addToast(`Could not update file association: ${message}`, 'error')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <SectionLabel as="h4">
            <FilesIcon size={12} />
            File associations
          </SectionLabel>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh file association status"
            className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-60"
          >
            <ArrowClockwiseIcon size={14} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>

        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Choose which supported files open in devdrivr by default. Removing an association restores
          the app that was selected before devdrivr.
        </p>

        {loading && !data ? (
          <div className="flex min-h-32 items-center justify-center">
            <Spinner label="Loading file associations" />
          </div>
        ) : !data?.available ? (
          <p className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-text-muted)]">
            File association management is not available on this platform.
          </p>
        ) : (
          <div className="space-y-1">
            {data.management === 'system' && (
              <p className="mb-3 rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-text-muted)]">
                Windows protects default-app choices. Manage opens Windows Default Apps, where you
                can select or remove devdrivr for each extension.
              </p>
            )}
            {data.items.map((item) => (
              <SettingRow key={item.id} label={item.label} hint={item.detail}>
                {data.management === 'system' ? (
                  <AssociationButton
                    label="Manage"
                    accessibleLabel={`Manage ${item.label} file associations in Windows`}
                    icon={<ArrowSquareOutIcon size={12} />}
                    pending={pendingId !== null}
                    onClick={() => change(item.id, true)}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-2xs text-[var(--color-text-muted)]">
                      {item.status === 'active'
                        ? 'Default'
                        : item.status === 'partial'
                          ? 'Mixed'
                          : 'Not default'}
                    </span>
                    {item.status !== 'active' && (
                      <AssociationButton
                        label={item.status === 'partial' ? 'Enable all' : 'Enable'}
                        accessibleLabel={`Enable ${item.label} file associations`}
                        icon={<CheckIcon size={12} />}
                        pending={pendingId !== null}
                        onClick={() => change(item.id, true)}
                      />
                    )}
                    {item.status !== 'inactive' && (
                      <AssociationButton
                        label={item.status === 'partial' ? 'Restore assigned' : 'Restore'}
                        accessibleLabel={`Restore ${item.label} file associations`}
                        icon={<ArrowCounterClockwiseIcon size={12} />}
                        pending={pendingId !== null}
                        onClick={() => change(item.id, false)}
                      />
                    )}
                  </div>
                )}
              </SettingRow>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
