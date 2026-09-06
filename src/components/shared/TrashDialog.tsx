import { useState } from 'react'
import { ArrowCounterClockwiseIcon, FolderIcon, TrashIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'

export type TrashEntry = {
  id: string
  name: string
  detail?: string
  type: 'folder' | 'item'
}

type Props = {
  title: string
  entries: TrashEntry[]
  onClose: () => void
  onRestore: (entry: TrashEntry) => Promise<void>
  onDeletePermanently: (entry: TrashEntry) => Promise<void>
  onEmpty: () => Promise<void>
}

type Confirmation = { type: 'entry'; entry: TrashEntry } | { type: 'empty' } | null

export function TrashDialog({
  title,
  entries,
  onClose,
  onRestore,
  onDeletePermanently,
  onEmpty,
}: Props) {
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const restore = async (entry: TrashEntry) => {
    setBusyId(entry.id)
    setError(false)
    try {
      await onRestore(entry)
    } catch {
      setError(true)
    } finally {
      setBusyId(null)
    }
  }

  const confirm = async () => {
    if (!confirmation) return
    const busyKey = confirmation.type === 'empty' ? 'empty' : confirmation.entry.id
    setBusyId(busyKey)
    setError(false)
    try {
      if (confirmation.type === 'empty') await onEmpty()
      else await onDeletePermanently(confirmation.entry)
      setConfirmation(null)
    } catch {
      // Keep the confirmation visible so the user can retry or cancel.
      setError(true)
    } finally {
      setBusyId(null)
    }
  }

  if (confirmation) {
    const isEmpty = confirmation.type === 'empty'
    const target = isEmpty ? 'everything in this Trash' : `“${confirmation.entry.name}”`
    return (
      <Dialog
        title={isEmpty ? 'Empty Trash?' : 'Delete permanently?'}
        onClose={() => setConfirmation(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmation(null)} disabled={!!busyId}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirm()} loading={!!busyId}>
              {isEmpty ? 'Empty Trash' : 'Delete forever'}
            </Button>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
          Permanently delete {target}? This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs text-[var(--color-error)]">
            Trash action failed. Try again.
          </p>
        )}
      </Dialog>
    )
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      size="md"
      bodyClassName="p-3"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="danger"
            onClick={() => setConfirmation({ type: 'empty' })}
            disabled={entries.length === 0}
          >
            Empty Trash
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-2 text-xs text-[var(--color-error)]">
          Trash action failed. Try again.
        </p>
      )}
      {entries.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">Trash is empty.</p>
      ) : (
        <ul className="space-y-1" aria-label="Deleted items">
          {entries.map((entry) => (
            <li
              key={`${entry.type}-${entry.id}`}
              className="flex items-center gap-2 rounded border border-[var(--color-border)] p-2"
            >
              {entry.type === 'folder' ? (
                <FolderIcon size={16} className="shrink-0 text-[var(--color-text-muted)]" />
              ) : (
                <TrashIcon size={16} className="shrink-0 text-[var(--color-text-muted)]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-[var(--color-text)]">{entry.name}</p>
                {entry.detail && (
                  <p className="truncate text-2xs text-[var(--color-text-muted)]">{entry.detail}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void restore(entry)}
                loading={busyId === entry.id}
                aria-label={`Restore ${entry.name}`}
              >
                <ArrowCounterClockwiseIcon size={12} aria-hidden="true" />
                Restore
              </Button>
              <Button
                variant="icon"
                size="xs"
                onClick={() => setConfirmation({ type: 'entry', entry })}
                disabled={!!busyId}
                aria-label={`Delete ${entry.name} permanently`}
                className="hover:text-[var(--color-error)]"
              >
                <TrashIcon size={12} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
