import { useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Field } from '@/components/shared/Field'
import { Input } from '@/components/shared/Input'
import { Dialog } from '@/components/shared/Dialog'
import { Toggle } from '@/components/shared/Toggle'

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
    <Dialog
      title="Insert Link"
      onClose={onClose}
      className="w-[400px]"
      initialFocusRef={urlRef}
      closeLabel="Close insert link dialog"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleInsert} disabled={!url.trim()}>
            Insert
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" onKeyDown={handleKeyDown}>
        <Field label="URL" required>
          <Input
            ref={urlRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            size="md"
          />
        </Field>
        <Field label="Link Text">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Link text"
            size="md"
          />
        </Field>
        <Field label="Title (tooltip)">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tooltip text (optional)"
            size="md"
            disabled={newTab}
          />
        </Field>
        {/* A modal settings row is where `Toggle` belongs — unlike the dense per-row checkboxes
            in the validators, there is room for a switch, and it brings a real focus ring. */}
        <Toggle checked={newTab} onChange={setNewTab} label="Open in new tab (inserts HTML)" />
      </div>
    </Dialog>
  )
}
