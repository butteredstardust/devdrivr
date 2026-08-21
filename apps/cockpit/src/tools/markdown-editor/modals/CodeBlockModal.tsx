import { useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Dialog } from '@/components/shared/Dialog'

const LANGUAGES = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'dockerfile',
  'go',
  'graphql',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'markdown',
  'php',
  'plaintext',
  'python',
  'ruby',
  'rust',
  'scala',
  'shell',
  'sql',
  'swift',
  'toml',
  'typescript',
  'xml',
  'yaml',
]

type Props = {
  onInsert: (markdown: string) => void
  onClose: () => void
}

export function CodeBlockModal({ onInsert, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim()
    ? LANGUAGES.filter((l) => l.includes(query.toLowerCase().trim()))
    : LANGUAGES

  const handleInsert = () => {
    const lang = selected || ''
    onInsert(`\`\`\`${lang}\ncode\n\`\`\``)
  }

  return (
    <Dialog
      title="Insert Code Block"
      onClose={onClose}
      initialFocusRef={searchRef}
      closeLabel="Close insert code block dialog"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleInsert}>
            Insert
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          ref={searchRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected('')
          }}
          placeholder="Search languages…"
          size="md"
        />
        <div className="h-[180px] overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">No match</p>
          ) : (
            filtered.map((lang) => (
              <Button
                key={lang}
                variant="ghost"
                size="xs"
                onClick={() => setSelected(lang)}
                className={`block w-full rounded-none px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                  selected === lang
                    ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                }`}
              >
                {lang}
              </Button>
            ))
          )}
        </div>
        {selected && (
          <p className="font-mono text-xs text-[var(--color-accent)]">Selected: {selected}</p>
        )}
      </div>
    </Dialog>
  )
}
