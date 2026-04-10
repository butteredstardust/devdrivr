import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'

type Props = {
  initialText?: string
  onInsert: (markdown: string) => void
  onClose: () => void
}

export function LinkModal({ initialText = '', onInsert, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState(initialText)
  const [title, setTitle] = useState('')
  const [newTab, setNewTab] = useState(false)
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

  const handleInsert = () => {
    const trimUrl = url.trim()
    if (!trimUrl) return
    const linkText = text.trim() || trimUrl
    if (newTab) {
      onInsert(`<a href="${trimUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`)
    } else if (title.trim()) {
      onInsert(`[${linkText}](${trimUrl} "${title.trim()}")`)
    } else {
      onInsert(`[${linkText}](${trimUrl})`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleInsert()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="flex w-[400px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-mono text-sm text-[var(--color-text)]">Insert Link</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">URL *</label>
            <Input
              ref={urlRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              size="md"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">Link Text</label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Link text"
              size="md"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">
              Title (tooltip)
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tooltip text (optional)"
              size="md"
              disabled={newTab}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={newTab}
              onChange={(e) => setNewTab(e.target.checked)}
              aria-label="Open in new tab"
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              Open in new tab (inserts HTML)
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleInsert} disabled={!url.trim()}>
            Insert
          </Button>
        </div>
      </div>
    </div>
  )
}
