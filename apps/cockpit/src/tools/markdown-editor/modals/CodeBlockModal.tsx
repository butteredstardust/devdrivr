import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'

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

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = query.trim()
    ? LANGUAGES.filter((l) => l.includes(query.toLowerCase().trim()))
    : LANGUAGES

  const handleInsert = () => {
    const lang = selected || ''
    onInsert(`\`\`\`${lang}\ncode\n\`\`\``)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-[340px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-mono text-sm text-[var(--color-text)]">Insert Code Block</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
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
                <button
                  key={lang}
                  onClick={() => setSelected(lang)}
                  className={`block w-full px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                    selected === lang
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {lang}
                </button>
              ))
            )}
          </div>
          {selected && (
            <p className="font-mono text-xs text-[var(--color-accent)]">Selected: {selected}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleInsert}>
            Insert
          </Button>
        </div>
      </div>
    </div>
  )
}
