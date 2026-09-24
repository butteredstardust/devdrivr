import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react'
import {
  CheckCircleIcon,
  DownloadSimpleIcon,
  ImageIcon,
  NoteIcon,
  PlusIcon,
  PushPinIcon,
  TrashIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { ResourceFolderTree } from '@/components/shared/ResourceFolderTree'
import { SearchInput } from '@/components/shared/SearchInput'
import { formatShortcut } from '@/lib/shortcut-label'
import type {
  NotesWorkspaceState,
  UpdateNotesWorkspaceState,
} from '@/tools/notes/notes-workspace-model'
import {
  dueDateLabel,
  notePreview,
  taskStatusLabel,
  timeAgo,
} from '@/tools/notes/notes-workspace-model'
import { TASK_VIEWS, type TaskView } from '@/tools/notes/task-model'
import type { Note, ResourceFolder } from '@/types/models'

type NotesSidebarActionsProps = {
  trashEntryCount: number
  onExportBackup: () => Promise<void>
  onImportBackup: () => Promise<void>
  onFindOrphans: () => Promise<void>
  onOpenTrash: () => void
  onNewTask: () => Promise<void>
  onNew: () => Promise<void>
}

export function NotesSidebarActions({
  trashEntryCount,
  onExportBackup,
  onImportBackup,
  onFindOrphans,
  onOpenTrash,
  onNewTask,
  onNew,
}: NotesSidebarActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="icon"
        size="sm"
        onClick={() => void onExportBackup()}
        aria-label="Export notes backup with images"
        title="Export notes backup"
      >
        <DownloadSimpleIcon size={14} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="icon"
        size="sm"
        onClick={() => void onImportBackup()}
        aria-label="Restore notes backup with images"
        title="Restore notes backup"
      >
        <UploadSimpleIcon size={14} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="icon"
        size="sm"
        onClick={() => void onFindOrphans()}
        aria-label="Clean up unused note images"
        title="Clean up unused images"
      >
        <ImageIcon size={14} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="icon"
        size="sm"
        onClick={onOpenTrash}
        aria-label={`Open Notes Trash, ${trashEntryCount} item${trashEntryCount === 1 ? '' : 's'}`}
        title="Open Notes Trash"
      >
        <TrashIcon size={14} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="icon"
        size="sm"
        onClick={() => void onNewTask()}
        aria-label="New task"
        title="New task"
      >
        <CheckCircleIcon size={14} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="icon"
        size="sm"
        onClick={() => void onNew()}
        aria-label="New note"
        title={`New note (${formatShortcut('mod+n')})`}
      >
        <PlusIcon size={14} aria-hidden="true" />
      </Button>
    </div>
  )
}

type FolderPatch = Partial<Pick<ResourceFolder, 'name' | 'defaultLanguage'>>

type NotesSidebarProps = {
  state: NotesWorkspaceState
  updateState: UpdateNotesWorkspaceState
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  taskCounts: ReadonlyMap<TaskView, number>
  completedCount: number
  noteFolders: ResourceFolder[]
  folderCounts: ReadonlyMap<string, number>
  filteredNotes: Note[]
  selected: Note | null
  today: string
  listRef: RefObject<HTMLDivElement | null>
  onCreateFolder: (parentId: string | null) => Promise<ResourceFolder>
  onUpdateFolder: (id: string, patch: FolderPatch) => Promise<void>
  onMoveFolder: (id: string, parentId: string | null, index: number) => Promise<void>
  onTrashFolder: (folder: ResourceFolder) => void
  onTrashCompleted: () => void
  onToggleComplete: (note: Note) => Promise<void>
  onListKeyDown: (event: KeyboardEvent<HTMLButtonElement>, noteId: string) => void
  onNew: () => Promise<void>
}

export function NotesSidebar({
  state,
  updateState,
  search,
  setSearch,
  taskCounts,
  completedCount,
  noteFolders,
  folderCounts,
  filteredNotes,
  selected,
  today,
  listRef,
  onCreateFolder,
  onUpdateFolder,
  onMoveFolder,
  onTrashFolder,
  onTrashCompleted,
  onToggleComplete,
  onListKeyDown,
  onNew,
}: NotesSidebarProps) {
  return (
    <>
      <div className="border-b border-[var(--color-border)] p-2">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search notes"
          aria-label="Search notes"
          clearLabel="Clear notes search"
        />
      </div>
      <nav aria-label="Task views" className="border-b border-[var(--color-border)] px-2 py-2">
        <div className="grid grid-cols-2 gap-1">
          {TASK_VIEWS.map((view) => (
            <Button
              key={view.value}
              type="button"
              variant="ghost"
              size="xs"
              aria-pressed={state.taskView === view.value}
              onClick={() => updateState({ taskView: view.value })}
              className={`w-full justify-between px-2 py-1 text-left text-2xs ${
                state.taskView === view.value
                  ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                  : ''
              }`}
            >
              <span>{view.label}</span>
              <span aria-label={`${taskCounts.get(view.value) ?? 0} items`}>
                {taskCounts.get(view.value) ?? 0}
              </span>
            </Button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-pressed={state.hideCompleted}
            onClick={() => updateState({ hideCompleted: !state.hideCompleted })}
            className="p-0 text-2xs hover:bg-transparent"
          >
            {state.hideCompleted ? 'Show completed' : 'Hide completed'}
          </Button>
          {completedCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onTrashCompleted}
              className="p-0 text-2xs text-[var(--color-error)] hover:bg-transparent hover:text-[var(--color-error)] hover:underline"
            >
              Trash completed
            </Button>
          )}
        </div>
      </nav>
      <ResourceFolderTree
        folders={noteFolders}
        selectedFolderId={state.selectedFolderId}
        onSelect={(selectedFolderId) => updateState({ selectedFolderId })}
        onCreate={onCreateFolder}
        onUpdate={onUpdateFolder}
        onMove={onMoveFolder}
        onTrash={onTrashFolder}
        itemCounts={folderCounts}
        label="Note folders"
      />
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        role="listbox"
        aria-label="Notes"
      >
        {filteredNotes.map((note) => {
          const active = note.id === selected?.id
          return (
            <div key={note.id} className="relative border-b border-[var(--color-border)]">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                role="option"
                aria-selected={active}
                data-notes-workspace-id={note.id}
                onClick={() => updateState({ selectedId: note.id })}
                onKeyDown={(event) => onListKeyDown(event, note.id)}
                className={`h-auto w-full flex-col items-stretch justify-start rounded-none px-3 py-2.5 text-left ${
                  note.taskStatus ? 'pr-10' : ''
                } ${
                  active ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <div className="flex w-full items-center gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-xs font-semibold text-[var(--color-text)] ${
                      note.taskStatus === 'done' ? 'line-through opacity-70' : ''
                    }`}
                  >
                    {note.title || 'Untitled note'}
                  </span>
                  {note.pinned && (
                    <PushPinIcon
                      size={12}
                      weight="fill"
                      aria-label="Pinned"
                      className="shrink-0 text-[var(--color-accent)]"
                    />
                  )}
                </div>
                {note.taskStatus ? (
                  <p className="mt-1 truncate text-2xs text-[var(--color-text-muted)]">
                    {taskStatusLabel(note.taskStatus)}
                    {note.taskPriority ? ` · ${note.taskPriority} priority` : ''}
                    {note.taskDueDate ? ` · ${dueDateLabel(note.taskDueDate, today)}` : ''}
                  </p>
                ) : (
                  <p className="mt-1 truncate text-2xs text-[var(--color-text-muted)]">
                    {notePreview(note.content) || 'Empty note'}
                  </p>
                )}
                <p className="mt-1 text-2xs text-[var(--color-text-muted)]">
                  {timeAgo(note.updatedAt)}
                </p>
              </Button>
              {note.taskStatus && (
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={() => void onToggleComplete(note)}
                  aria-label={
                    note.taskStatus === 'done'
                      ? `Reopen ${note.title || 'Untitled task'}`
                      : `Complete ${note.title || 'Untitled task'}`
                  }
                  aria-pressed={note.taskStatus === 'done'}
                  className={`absolute right-2 top-2.5 ${
                    note.taskStatus === 'done'
                      ? 'text-[var(--color-success)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-success)]'
                  }`}
                >
                  <CheckCircleIcon
                    size={17}
                    weight={note.taskStatus === 'done' ? 'fill' : 'regular'}
                    aria-hidden="true"
                  />
                </Button>
              )}
            </div>
          )
        })}
        {filteredNotes.length === 0 && (
          <EmptyState
            icon={NoteIcon}
            size="sm"
            title={
              search
                ? 'No matching notes'
                : state.taskView === 'notes'
                  ? 'Capture your first note'
                  : 'No matching tasks'
            }
            description={
              search
                ? 'Try a different search term.'
                : state.taskView === 'notes'
                  ? 'Create a note to begin.'
                  : 'No tasks match this view.'
            }
            action={
              search || state.taskView !== 'notes' ? undefined : (
                <Button variant="primary" size="sm" onClick={() => void onNew()}>
                  New note
                </Button>
              )
            }
          />
        )}
      </div>
    </>
  )
}
