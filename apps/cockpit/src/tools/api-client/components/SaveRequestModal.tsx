import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Field } from '@/components/shared/Field'
import { Dialog } from '@/components/shared/Dialog'
import { Input } from '@/components/shared/Input'
import { Select } from '@/components/shared/Select'
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

  const handleOpenAutoFocus = useCallback((target: HTMLElement) => {
    if (target === nameRef.current) {
      nameRef.current.select()
    }
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
  }

  return (
    <Dialog
      title={mode === 'save-as' ? 'Save Request As' : 'Save Request'}
      onClose={onClose}
      closeLabel="Close save request dialog"
      initialFocusRef={nameRef}
      onOpenAutoFocus={handleOpenAutoFocus}
      bodyClassName="p-0"
      footer={
        <>
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
        </>
      }
    >
      <div className="flex flex-col gap-4 p-4" onKeyDown={handleKeyDown}>
        <Field label="Request Name">
          <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} size="md" />
        </Field>

        <Field label="Collection">
          <Select size="md" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
            <option value="">(Unassigned)</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_COLLECTION_SENTINEL}>+ New Collection…</option>
          </Select>
        </Field>

        {isNewCol && (
          <Field label="New Collection Name">
            <Input
              autoFocus
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="My Collection"
              size="md"
            />
          </Field>
        )}
      </div>
    </Dialog>
  )
}
