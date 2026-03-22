import { useCallback, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import Fuse from 'fuse.js'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

const LANGUAGES = [
  'javascript', 'typescript', 'json', 'css', 'html', 'markdown',
  'sql', 'python', 'yaml', 'xml', 'bash', 'text',
]

export default function SnippetsManager() {
  useMonacoTheme()
  const snippets = useSnippetsStore((s) => s.snippets)
  const addSnippet = useSnippetsStore((s) => s.add)
  const updateSnippet = useSnippetsStore((s) => s.update)
  const removeSnippet = useSnippetsStore((s) => s.remove)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fuse = useMemo(
    () => new Fuse(snippets, { keys: ['title', 'content', 'tags'], threshold: 0.4 }),
    [snippets]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return snippets
    return fuse.search(search).map((r) => r.item)
  }, [snippets, search, fuse])

  const selected = useMemo(
    () => snippets.find((s) => s.id === selectedId) ?? null,
    [snippets, selectedId]
  )

  const handleNew = useCallback(async () => {
    const snippet = await addSnippet('Untitled', '', 'javascript')
    setSelectedId(snippet.id)
    setLastAction('Snippet created', 'success')
  }, [addSnippet, setLastAction])

  const handleDelete = useCallback(async () => {
    if (!selectedId) return
    await removeSnippet(selectedId)
    setSelectedId(null)
    setLastAction('Snippet deleted', 'info')
  }, [selectedId, removeSnippet, setLastAction])

  const handleDeleteClick = useCallback(() => {
    if (!selectedId) return
    if (confirmDeleteId === selectedId) {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
      setConfirmDeleteId(null)
      handleDelete().catch(() => {})
    } else {
      setConfirmDeleteId(selectedId)
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
      confirmTimeoutRef.current = setTimeout(() => setConfirmDeleteId(null), 2500)
    }
  }, [selectedId, confirmDeleteId, handleDelete])

  const handleAddTag = useCallback(() => {
    if (!selected || !tagInput.trim()) return
    const newTags = [...selected.tags, tagInput.trim()]
    updateSnippet(selected.id, { tags: newTags })
    setTagInput('')
  }, [selected, tagInput, updateSnippet])

  const handleRemoveTag = useCallback((tag: string) => {
    if (!selected) return
    updateSnippet(selected.id, { tags: selected.tags.filter((t) => t !== tag) })
  }, [selected, updateSnippet])

  const handleExport = useCallback(() => {
    const data = JSON.stringify(snippets, null, 2)
    navigator.clipboard.writeText(data)
    setLastAction(`Exported ${snippets.length} snippets to clipboard`, 'success')
  }, [snippets, setLastAction])

  const handleImport = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      const imported = JSON.parse(text) as Array<Record<string, unknown>>
      for (const item of imported) {
        if (typeof item['title'] === 'string' && typeof item['content'] === 'string') {
          await addSnippet(
            item['title'],
            item['content'],
            typeof item['language'] === 'string' ? item['language'] : 'text',
            Array.isArray(item['tags']) ? item['tags'] as string[] : []
          )
        }
      }
      setLastAction(`Imported ${imported.length} snippets`, 'success')
    } catch {
      setLastAction('Import failed — paste valid JSON array', 'error')
    }
  }, [addSnippet, setLastAction])

  return (
    <div className="flex h-full">
      {/* Sidebar: snippet list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search snippets..."
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={handleNew}
            className="rounded border border-[var(--color-accent)] px-2 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1">
          <button onClick={handleExport} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Export</button>
          <button onClick={handleImport} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Import</button>
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.map((snippet) => (
            <button
              key={snippet.id}
              onClick={() => setSelectedId(snippet.id)}
              className={`flex w-full flex-col border-b border-[var(--color-border)] px-3 py-2 text-left ${
                selectedId === snippet.id ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              <span className="text-xs font-bold text-[var(--color-text)]">{snippet.title || 'Untitled'}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{snippet.language}</span>
              {snippet.tags.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {snippet.tags.map((tag) => (
                    <span key={tag} className="rounded bg-[var(--color-accent-dim)] px-1 text-[10px] text-[var(--color-accent)]">{tag}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
              {search ? 'No matching snippets' : 'No snippets yet'}
            </div>
          )}
        </div>
      </div>

      {/* Main: editor */}
      {selected ? (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
            <input
              value={selected.title}
              onChange={(e) => updateSnippet(selected.id, { title: e.target.value })}
              placeholder="Snippet title"
              className="flex-1 bg-transparent text-sm font-bold text-[var(--color-text)] outline-none"
            />
            <select
              value={selected.language}
              onChange={(e) => updateSnippet(selected.id, { language: e.target.value })}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none"
            >
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <CopyButton text={selected.content} />
            <button
              onClick={handleDeleteClick}
              className={`text-xs transition-colors ${
                confirmDeleteId === selectedId
                  ? 'font-bold text-[var(--color-error)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-error)]'
              }`}
            >
              {confirmDeleteId === selectedId ? 'Confirm?' : 'Delete'}
            </button>
          </div>
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-1">
            {selected.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded bg-[var(--color-accent-dim)] px-2 py-0.5 text-xs text-[var(--color-accent)]"
              >
                {tag}
                <button onClick={() => handleRemoveTag(tag)} className="hover:text-[var(--color-error)]">×</button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag() }}
              placeholder="Add tag..."
              className="bg-transparent text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
            />
          </div>
          <div className="flex-1">
            <Editor
              language={selected.language}
              value={selected.content}
              onChange={(v) => updateSnippet(selected.id, { content: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
          Select a snippet or create a new one
        </div>
      )}
    </div>
  )
}
