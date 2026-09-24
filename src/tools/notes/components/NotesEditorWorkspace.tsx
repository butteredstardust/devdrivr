import type {
  ClipboardEventHandler,
  ComponentProps,
  Dispatch,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react'
import type { OnMount } from '@monaco-editor/react'
import {
  CheckCircleIcon,
  CopyIcon,
  NoteIcon,
  PlusIcon,
  PushPinIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { InlineInput } from '@/components/shared/InlineInput'
import { Input, Select } from '@/components/shared/Input'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { SplitPane } from '@/components/shared/SplitPane'
import type { CopyToClipboard } from '@/hooks/useCopyToClipboard'
import { folderPath } from '@/lib/resource-folders'
import { MODE_OPTIONS } from '@/tools/markdown-editor/markdown-model'
import { WikiLinkPicker } from '@/tools/notes/WikiLinkPicker'
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  type NotesWorkspaceState,
  type UpdateNotesWorkspaceState,
} from '@/tools/notes/notes-workspace-model'
import { isTask } from '@/tools/notes/task-model'
import { findWikiTrigger, type WikiResource, type WikiTrigger } from '@/lib/wiki-links'
import type { Note, ResourceFolder, TaskPriority, TaskStatus } from '@/types/models'
import type { useNotesStore } from '@/stores/notes.store'

type NotesStore = ReturnType<typeof useNotesStore.getState>

type NotesEditorWorkspaceProps = {
  selected: Note | null
  state: NotesWorkspaceState
  updateState: UpdateNotesWorkspaceState
  saveState: string | null
  noteFolders: ResourceFolder[]
  monacoTheme: string
  noteEditorOptions: NonNullable<ComponentProps<typeof Editor>['options']>
  editorMount: OnMount
  editorContainerRef: RefObject<HTMLDivElement | null>
  onPasteCapture: ClipboardEventHandler<HTMLDivElement>
  wikiTrigger: WikiTrigger | null
  setWikiTrigger: Dispatch<SetStateAction<WikiTrigger | null>>
  wikiResources: WikiResource[]
  onWikiSelect: (resource: WikiResource) => void
  isDraggingImage: boolean
  preview: ReactNode
  backlinks: Note[]
  editNote: NotesStore['edit']
  updateNote: NotesStore['update']
  updateTask: NotesStore['updateTask']
  copy: CopyToClipboard
  onRemoveTask: (note: Note) => void
  onDelete: (note: Note) => void
  onNew: () => Promise<void>
}

export function NotesEditorWorkspace({
  selected,
  state,
  updateState,
  saveState,
  noteFolders,
  monacoTheme,
  noteEditorOptions,
  editorMount,
  editorContainerRef,
  onPasteCapture,
  wikiTrigger,
  setWikiTrigger,
  wikiResources,
  onWikiSelect,
  isDraggingImage,
  preview,
  backlinks,
  editNote,
  updateNote,
  updateTask,
  copy,
  onRemoveTask,
  onDelete,
  onNew,
}: NotesEditorWorkspaceProps) {
  if (!selected) {
    return (
      <EmptyState
        icon={NoteIcon}
        title="Write your first note"
        description="Create a Markdown note to open the editor and preview workspace."
        className="h-full"
        action={
          <Button variant="primary" onClick={() => void onNew()}>
            <PlusIcon size={14} aria-hidden="true" className="mr-1.5" />
            New note
          </Button>
        }
      />
    )
  }

  return (
    <section aria-label="Note editor" className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <div className="min-w-40 flex-1">
          <InlineInput
            value={selected.title}
            onChange={(event) => editNote(selected.id, { title: event.target.value })}
            placeholder="Note title"
            aria-label="Note title"
            variant="title"
            className="w-full"
          />
          <p
            aria-live="polite"
            className={`text-2xs ${
              saveState === 'Save failed'
                ? 'text-[var(--color-error)]'
                : 'text-[var(--color-text-muted)]'
            }`}
          >
            {saveState}
          </p>
        </div>
        <SegmentedControl
          aria-label="Note editor mode"
          options={MODE_OPTIONS}
          value={state.mode}
          onChange={(mode) => updateState({ mode })}
        />
        <Select
          value={selected.folderId ?? 'notes-inbox'}
          onChange={(event) => void updateNote(selected.id, { folderId: event.target.value })}
          aria-label="Note folder"
          title="Move note to folder"
          className="max-w-44"
        >
          {noteFolders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folderPath(noteFolders, folder.id).join(' / ')}
            </option>
          ))}
        </Select>
        {isTask(selected) ? (
          <div className="flex flex-wrap items-center gap-1" aria-label="Task metadata">
            <Select
              value={selected.taskStatus}
              onChange={(event) =>
                void updateTask(selected.id, {
                  status: event.target.value as TaskStatus,
                })
              }
              aria-label="Task status"
              className="max-w-32"
            >
              {TASK_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={selected.taskPriority ?? ''}
              onChange={(event) =>
                void updateTask(selected.id, {
                  priority: (event.target.value || null) as TaskPriority | null,
                })
              }
              aria-label="Task priority"
              className="max-w-36"
            >
              <option value="">No priority</option>
              {TASK_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={selected.taskDueDate ?? ''}
              onChange={(event) =>
                void updateTask(selected.id, { dueDate: event.target.value || null })
              }
              aria-label="Task due date"
              className="w-36"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveTask(selected)}>
              Convert to note
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void updateTask(selected.id, { status: 'todo' })}
          >
            <CheckCircleIcon size={14} aria-hidden="true" />
            Make task
          </Button>
        )}
        <Button
          variant="icon"
          size="sm"
          onClick={() => void updateNote(selected.id, { pinned: !selected.pinned })}
          aria-label={selected.pinned ? 'Unpin note' : 'Pin note'}
          aria-pressed={selected.pinned}
          className={selected.pinned ? 'text-[var(--color-accent)]' : undefined}
        >
          <PushPinIcon size={14} weight={selected.pinned ? 'fill' : 'regular'} aria-hidden="true" />
        </Button>
        <Button
          variant="icon"
          size="sm"
          onClick={() =>
            void copy(selected.content, {
              success: 'Note copied to clipboard',
              failure: 'Failed to copy note',
            })
          }
          aria-label="Copy note"
        >
          <CopyIcon size={14} aria-hidden="true" />
        </Button>
        <Button
          variant="icon"
          size="sm"
          onClick={() => onDelete(selected)}
          aria-label="Move note to Trash"
          className="hover:text-[var(--color-error)]"
        >
          <TrashIcon size={14} aria-hidden="true" />
        </Button>
      </header>

      <SplitPane
        storageKey="notes-workspace"
        stackBelow={900}
        firstVisible={state.mode !== 'preview'}
        secondVisible={state.mode !== 'edit'}
        aria-label="Resize note editor and preview"
      >
        <div
          ref={editorContainerRef}
          onPasteCapture={onPasteCapture}
          className="relative min-h-0 flex-1 overflow-hidden"
        >
          <Editor
            theme={monacoTheme}
            language="markdown"
            value={selected.content}
            onMount={editorMount}
            onChange={(value, event) => {
              const content = value ?? ''
              editNote(selected.id, { content })
              const lastChange = event?.changes[event.changes.length - 1]
              const cursor = lastChange
                ? lastChange.rangeOffset + lastChange.text.length
                : content.length
              setWikiTrigger(findWikiTrigger(content, cursor))
            }}
            options={noteEditorOptions}
          />
          {wikiTrigger && (
            <WikiLinkPicker
              query={wikiTrigger.query}
              resources={wikiResources}
              onQueryChange={(query) =>
                setWikiTrigger((current) => (current ? { ...current, query } : null))
              }
              onSelect={onWikiSelect}
              onClose={() => setWikiTrigger(null)}
            />
          )}
          {isDraggingImage && (
            <div
              className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-sm font-semibold text-[var(--color-accent)]"
              role="status"
            >
              Drop image to attach
            </div>
          )}
        </div>
        {preview}
      </SplitPane>
      {backlinks.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
          <span className="text-2xs font-semibold text-[var(--color-text-muted)]">
            Backlinks ({backlinks.length})
          </span>
          {backlinks.map((note) => (
            <Button
              key={note.id}
              type="button"
              variant="ghost"
              size="xs"
              onClick={() =>
                updateState({
                  selectedId: note.id,
                  selectedFolderId: null,
                  taskView: 'notes',
                })
              }
            >
              {note.title || 'Untitled note'}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
