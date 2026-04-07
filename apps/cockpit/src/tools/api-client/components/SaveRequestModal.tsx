import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import type { ApiCollection } from '@/types/models'

type Props = {
  mode: 'save' | 'save-as'
  initialName: string
  initialCollectionId: string | null
  collections: ApiCollection[]
  onSave: (name: string, collectionIdOrNewName: string | null, isNew: boolean) => void
  onClose: () => void
}

const NEW_COLLECTION_SENTINEL = '__new__'

export function SaveRequestModal({
  mode,
  initialName,
  initialCollectionId,
  collections,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName)
  const [collectionId, setCollectionId] = useState<string>(initialCollectionId ?? '')
  const [newColName, setNewColName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  const isNewCol = collectionId === NEW_COLLECTION_SENTINEL

  const handleSubmit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    if (isNewCol && !newColName.trim()) return
    if (isNewCol) {
      onSave(trimmedName, newColName.trim(), true)
    } else {
      onSave(trimmedName, collectionId || null, false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="flex w-[420px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-mono text-sm text-[var(--color-text)]">
            {mode === 'save-as' ? 'Save Request As' : 'Save Request'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">
              Request Name
            </label>
            <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} size="md" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">Collection</label>
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="">(Unassigned)</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_COLLECTION_SENTINEL}>+ New Collection…</option>
            </select>
          </div>

          {isNewCol && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[var(--color-text-muted)]">
                New Collection Name
              </label>
              <Input
                autoFocus
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="My Collection"
                size="md"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!name.trim() || (isNewCol && !newColName.trim())}
          >
            {mode === 'save-as' ? 'Save As' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
