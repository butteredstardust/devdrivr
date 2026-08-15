import { useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Dialog } from '@/components/shared/Dialog'
import { Alert } from '@/components/shared/Alert'

type Props = {
  onInsert: (markdown: string) => void
  onClose: () => void
}

export function ImageModal({ onInsert, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [pasteError, setPasteError] = useState('')
  const urlRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && url.trim()) {
      e.preventDefault()
      onInsert(`![${alt.trim()}](${url.trim()})`)
    }
  }

  const handlePaste = async () => {
    setPasteError('')
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const reader = new FileReader()
          reader.onload = (e) => {
            setUrl(e.target?.result as string)
          }
          reader.readAsDataURL(blob)
          return
        }
      }
      setPasteError('No image found in clipboard.')
    } catch {
      setPasteError('Clipboard access denied.')
    }
  }

  const isValid = url.trim().length > 0

  return (
    <Dialog
      title="Insert Image"
      onClose={onClose}
      className="w-[420px]"
      initialFocusRef={urlRef}
      closeLabel="Close insert image dialog"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onInsert(`![${alt.trim()}](${url.trim()})`)}
            disabled={!isValid}
          >
            Insert
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" onKeyDown={handleKeyDown}>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-[var(--color-text-muted)]">Image URL</label>
          <div className="flex gap-2">
            <Input
              ref={urlRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/image.png"
              size="md"
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void handlePaste()
              }}
              title="Paste image from clipboard"
            >
              Paste
            </Button>
          </div>
          {pasteError && <Alert variant="error">{pasteError}</Alert>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-[var(--color-text-muted)]">Alt Text</label>
          <Input
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="Alt text"
            size="md"
          />
        </div>

        {isValid && (
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">Preview</label>
            <div className="flex items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
              <img
                src={url}
                alt={alt || 'preview'}
                className="max-h-[120px] max-w-full rounded object-contain"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
