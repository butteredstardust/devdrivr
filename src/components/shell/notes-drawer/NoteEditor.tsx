import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  CopyIcon,
  PaperPlaneTiltIcon,
  PushPinIcon,
  TagIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { InlineInput } from '@/components/shared/InlineInput'
import { SectionLabel } from '@/components/shared/SectionLabel'
import {
  NOTE_COLORS,
  noteColorVar,
  type SaveState,
} from '@/components/shell/notes-drawer/note-helpers'
import type { Note as NoteType } from '@/types/models'

export function NoteEditor({
  note,
  saveState,
  onEdit,
  onFlush,
  onUpdate,
  onBack,
  onOpenWorkspace,
  onDelete,
  onCopy,
  onUseAsInput,
}: {
  note: NoteType
  saveState: SaveState
  onEdit: (id: string, patch: Partial<Pick<NoteType, 'title' | 'content'>>) => void
  onFlush: (id: string) => Promise<void>
  onUpdate: (id: string, patch: Partial<NoteType>) => Promise<void>
  onBack: () => void
  onOpenWorkspace: () => void
  onDelete: () => void
  onCopy: (content: string) => void
  onUseAsInput: (content: string) => void
}) {
  const [tagInput, setTagInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const resizeTextarea = useCallback((element?: HTMLTextAreaElement | null) => {
    const textarea = element ?? textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [])

  const setTextareaRef = useCallback(
    (element: HTMLTextAreaElement | null) => {
      textareaRef.current = element
      resizeTextarea(element)
    },
    [resizeTextarea]
  )

  const applyImmediateUpdate = useCallback(
    (patch: Partial<NoteType>) => {
      void onUpdate(note.id, patch).catch(() => {
        // The notes store provides the user-facing persistence error.
      })
    },
    [note.id, onUpdate]
  )

  useEffect(() => {
    resizeTextarea()
  }, [note.content, resizeTextarea])

  useEffect(
    () => () => {
      void onFlush(note.id).catch(() => {
        // The notes store provides the user-facing persistence error.
      })
    },
    [note.id, onFlush]
  )

  const handleBack = useCallback(() => {
    void onFlush(note.id)
      .catch(() => {
        // The notes store provides the user-facing persistence error.
      })
      .finally(onBack)
  }, [note.id, onBack, onFlush])

  const handleDeleteRequest = useCallback(() => {
    void onFlush(note.id)
      .catch(() => {
        // Deletion can still proceed when the latest draft could not be saved.
      })
      .finally(onDelete)
  }, [note.id, onDelete, onFlush])

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !note.tags.includes(tag)) applyImmediateUpdate({ tags: [...note.tags, tag] })
    setTagInput('')
  }, [applyImmediateUpdate, note.tags, tagInput])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <Button variant="icon" size="sm" onClick={handleBack} aria-label="Back to all notes">
          <ArrowLeftIcon size={16} aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-[var(--color-text)]">
            {note.title || 'Untitled note'}
          </p>
          <p
            className={`text-2xs ${saveState === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-text-muted)]'}`}
            aria-live="polite"
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'}
          </p>
        </div>
        <Button
          variant="icon"
          size="sm"
          onClick={onOpenWorkspace}
          aria-label="Open note in Notes workspace"
          title="Open in Notes workspace"
        >
          <ArrowSquareOutIcon size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="icon"
          size="sm"
          onClick={() => applyImmediateUpdate({ pinned: !note.pinned })}
          aria-label={`${note.pinned ? 'Unpin' : 'Pin'} ${note.title || 'untitled note'}`}
          aria-pressed={note.pinned}
          title={note.pinned ? 'Unpin' : 'Pin'}
          className={note.pinned ? 'text-[var(--color-accent)]' : ''}
        >
          <PushPinIcon size={16} weight={note.pinned ? 'fill' : 'regular'} aria-hidden="true" />
        </Button>
        <Button
          variant="icon"
          size="sm"
          onClick={() => onCopy(note.content)}
          aria-label="Copy note content"
        >
          <CopyIcon size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="icon"
          size="sm"
          onClick={handleDeleteRequest}
          aria-label="Move note to Trash"
        >
          <TrashIcon size={16} aria-hidden="true" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <InlineInput
          value={note.title}
          onChange={(event) => onEdit(note.id, { title: event.target.value })}
          placeholder="Note title"
          aria-label="Note title"
          variant="display"
          className="w-full"
          autoFocus
        />
        <textarea
          ref={setTextareaRef}
          value={note.content}
          onChange={(event) => {
            onEdit(note.id, { content: event.target.value })
            resizeTextarea(event.currentTarget)
          }}
          onInput={(event) => resizeTextarea(event.currentTarget)}
          placeholder="Start writing… Markdown is supported."
          aria-label="Note content"
          rows={8}
          className="mt-3 min-h-48 w-full resize-none overflow-hidden bg-transparent text-sm leading-6 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none"
        />

        <div className="mt-5 border-t border-[var(--color-border)] pt-4">
          <SectionLabel as="div" className="mb-2">
            <TagIcon size={12} aria-hidden="true" /> Tags
          </SectionLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-dim)] px-2 py-1 text-2xs text-[var(--color-accent)]"
              >
                {tag}
                <button
                  type="button"
                  onClick={() =>
                    applyImmediateUpdate({ tags: note.tags.filter((item) => item !== tag) })
                  }
                  aria-label={`Remove ${tag} tag`}
                  className="rounded-full focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  <XIcon size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            <InlineInput
              variant="plain"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAddTag()
                }
              }}
              onBlur={handleAddTag}
              placeholder="Add tag"
              aria-label="Add tag"
              className="min-w-20 flex-1 px-1 py-1"
            />
          </div>
        </div>

        <fieldset className="mt-5 border-t border-[var(--color-border)] pt-4">
          <SectionLabel as="legend" className="mb-2">
            Color
          </SectionLabel>
          <div className="flex flex-wrap gap-2">
            {NOTE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => applyImmediateUpdate({ color })}
                aria-label={`Set note color to ${color}`}
                aria-pressed={note.color === color}
                className={`min-h-7 min-w-7 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
                  note.color === color
                    ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]'
                    : 'border-[var(--color-border)]'
                }`}
                style={{ backgroundColor: noteColorVar(color) }}
                title={color}
              />
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-3 py-2">
        <span className="text-2xs text-[var(--color-text-muted)]">
          {note.content.trim() ? `${note.content.trim().split(/\s+/).length} words` : 'Empty note'}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onUseAsInput(note.content)}
          disabled={!note.content}
        >
          <PaperPlaneTiltIcon size={14} aria-hidden="true" className="mr-1.5" />
          Use as input
        </Button>
      </div>
    </div>
  )
}
