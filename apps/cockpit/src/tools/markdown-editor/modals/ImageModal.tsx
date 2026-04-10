import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'

type Props = {
  onInsert: (markdown: string) => void
  onClose: () => void
}

export function ImageModal({ onInsert, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [pasteError, setPasteError] = useState('')
  const urlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    urlRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="flex w-[420px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-mono text-sm text-[var(--color-text)]">Insert Image</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
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
                onClick={handlePaste}
                title="Paste image from clipboard"
              >
                Paste
              </Button>
            </div>
            {pasteError && (
              <p className="font-mono text-xs text-[var(--color-error)]">{pasteError}</p>
            )}
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

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
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
        </div>
      </div>
    </div>
  )
}
