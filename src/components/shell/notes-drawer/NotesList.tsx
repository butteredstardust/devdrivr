import type { RefObject } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  DotsSixVerticalIcon,
  NoteIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  PushPinIcon,
  TagIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { MarkdownRenderer } from '@/components/shell/notes-drawer/MarkdownRenderer'
import {
  noteCardStyle,
  timeAgo,
  type DragOverNote,
  type DropPosition,
} from '@/components/shell/notes-drawer/note-helpers'
import type { Note as NoteType } from '@/types/models'

type NoteSection = { id: string; label: string; notes: NoteType[] }

type NotesListProps = {
  canReorderNotes: boolean
  copyNote: (note: NoteType) => void
  dragOverNote: DragOverNote | null
  draggedNoteId: string | null
  filteredNotes: NoteType[]
  handleAddNote: () => Promise<void>
  handleNotePointerDown: (event: React.PointerEvent<HTMLButtonElement>, noteId: string) => void
  handleUseAsInput: (content: string) => void
  moveNote: (source: NoteType, target: NoteType | undefined, position: DropPosition) => void
  noteListRef: RefObject<HTMLDivElement | null>
  notes: NoteType[]
  noteSections: NoteSection[]
  search: string
  setDeleteCandidate: (note: NoteType) => void
  setEditingId: (id: string) => void
  setSearch: (value: string) => void
  updateNote: (id: string, patch: Partial<NoteType>) => Promise<void>
}

export function NotesList({
  canReorderNotes,
  copyNote,
  dragOverNote,
  draggedNoteId,
  filteredNotes,
  handleAddNote,
  handleNotePointerDown,
  handleUseAsInput,
  moveNote,
  noteListRef,
  notes,
  noteSections,
  search,
  setDeleteCandidate,
  setEditingId,
  setSearch,
  updateNote,
}: NotesListProps) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2.5">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search notes..."
          aria-label="Search notes"
          clearLabel="Clear notes search"
          className="min-w-0 flex-1"
        />
        <Button variant="primary" size="sm" onClick={() => void handleAddNote()}>
          <PlusIcon size={14} className="mr-1" aria-hidden="true" /> New
        </Button>
      </div>

      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
        <span>
          {search
            ? `${filteredNotes.length} of ${notes.length} note${notes.length === 1 ? '' : 's'}`
            : `${notes.length} note${notes.length === 1 ? '' : 's'}`}
        </span>
        {canReorderNotes && notes.length > 1 && <span>Drag to reorder</span>}
      </div>

      <div ref={noteListRef} className="flex-1 overflow-auto p-2.5">
        {filteredNotes.length === 0 && (
          <EmptyState
            icon={NoteIcon}
            size="sm"
            title={search ? 'No matching notes' : 'Capture your first note'}
            description={
              search
                ? 'Try a different title, tag, or phrase.'
                : 'Keep useful context close while you work.'
            }
            action={
              !search ? (
                <Button variant="primary" size="sm" onClick={() => void handleAddNote()}>
                  <PlusIcon size={14} className="mr-1" aria-hidden="true" /> New note
                </Button>
              ) : undefined
            }
          />
        )}
        {noteSections.map((section) => (
          <section key={section.id} className="mb-4">
            <SectionLabel as="div" className="mb-1.5 justify-between px-1">
              <span>{section.label}</span>
              <span>{section.notes.length}</span>
            </SectionLabel>
            <div className="space-y-2">
              {section.notes.map((note, noteIndex) => {
                const previousNote = section.notes[noteIndex - 1]
                const nextNote = section.notes[noteIndex + 1]
                const dragPlacement = dragOverNote?.id === note.id ? dragOverNote.position : null
                return (
                  <div
                    key={note.id}
                    data-testid={`note-card-${note.id}`}
                    data-note-id={note.id}
                    data-pinned={note.pinned ? 'true' : 'false'}
                    className={`group rounded-[var(--radius-lg)] border border-l-[3px] transition-colors ${
                      draggedNoteId === note.id ? 'opacity-60' : ''
                    } ${dragPlacement === 'before' ? 'border-t-2 border-t-[var(--color-accent)]' : ''} ${
                      dragPlacement === 'after' ? 'border-b-2 border-b-[var(--color-accent)]' : ''
                    }`}
                    style={noteCardStyle(note.color)}
                  >
                    <div className="flex items-start gap-1.5 p-2.5 pb-1">
                      {canReorderNotes && (
                        <button
                          type="button"
                          onPointerDown={(event) => handleNotePointerDown(event, note.id)}
                          aria-label={`Drag ${note.title || 'untitled note'} to reorder`}
                          // Rests at muted and brightens to full text on hover/focus. It used
                          // to rest at opacity-60 over muted, which composited below the 3:1
                          // WCAG minimum for a UI control on every theme.
                          // `touch-none` so a drag down the list is read as a
                          // drag and not as a scroll that cancels the pointer.
                          className="mt-0.5 inline-flex min-h-6 min-w-5 cursor-grab touch-none items-center justify-center rounded text-[var(--color-text-muted)] transition-colors focus-visible:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] group-hover:text-[var(--color-text)]"
                        >
                          <DotsSixVerticalIcon size={14} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingId(note.id)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                        aria-label={`Edit ${note.title || 'untitled note'}`}
                      >
                        <span className="flex items-center gap-1.5">
                          {note.pinned && (
                            <PushPinIcon
                              size={12}
                              weight="fill"
                              className="shrink-0 text-[var(--color-accent)]"
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate text-xs font-semibold text-[var(--color-text)]">
                            {note.title || 'Untitled'}
                          </span>
                        </span>
                        {note.content && (
                          <span className="mt-1.5 block line-clamp-3">
                            <MarkdownRenderer content={note.content} />
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-1 px-2.5 pb-2.5">
                      <span className="mr-auto text-2xs text-[var(--color-text-muted)]">
                        {timeAgo(note.updatedAt)}
                      </span>
                      <Button
                        variant="icon"
                        size="xs"
                        onClick={() => moveNote(note, previousNote, 'before')}
                        disabled={!canReorderNotes || !previousNote}
                        aria-label={`Move ${note.title || 'untitled note'} up`}
                      >
                        <ArrowUpIcon size={12} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="icon"
                        size="xs"
                        onClick={() => moveNote(note, nextNote, 'after')}
                        disabled={!canReorderNotes || !nextNote}
                        aria-label={`Move ${note.title || 'untitled note'} down`}
                      >
                        <ArrowDownIcon size={12} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="icon"
                        size="xs"
                        onClick={() => copyNote(note)}
                        aria-label={`Copy ${note.title || 'untitled note'} content`}
                      >
                        <CopyIcon size={12} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="icon"
                        size="xs"
                        onClick={() => handleUseAsInput(note.content)}
                        aria-label={`Use ${note.title || 'untitled note'} as input`}
                      >
                        <PaperPlaneTiltIcon size={12} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="icon"
                        size="xs"
                        onClick={() => {
                          void updateNote(note.id, { pinned: !note.pinned }).catch(() => {
                            // The notes store provides the user-facing persistence error.
                          })
                        }}
                        aria-label={`${note.pinned ? 'Unpin' : 'Pin'} ${note.title || 'untitled note'}`}
                        aria-pressed={note.pinned}
                        className={note.pinned ? 'text-[var(--color-accent)]' : ''}
                      >
                        <PushPinIcon
                          size={12}
                          weight={note.pinned ? 'fill' : 'regular'}
                          aria-hidden="true"
                        />
                      </Button>
                      <Button
                        variant="icon"
                        size="xs"
                        onClick={() => setDeleteCandidate(note)}
                        aria-label={`Delete ${note.title || 'untitled note'}`}
                      >
                        <TrashIcon size={12} aria-hidden="true" />
                      </Button>
                    </div>

                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 border-t border-[var(--color-border)]/50 px-2.5 py-2">
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--color-text-muted)]/10 px-1.5 py-0.5 text-2xs text-[var(--color-text-muted)]"
                          >
                            <TagIcon size={12} aria-hidden="true" /> {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
