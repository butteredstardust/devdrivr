import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Fuse from 'fuse.js'
import { descendantFolderIds, foldersForKind } from '@/lib/resource-folders'
import { useFoldersStore } from '@/stores/folders.store'
import { useNotesStore } from '@/stores/notes.store'
import { useUiStore } from '@/stores/ui.store'
import type {
  NotesWorkspaceState,
  UpdateNotesWorkspaceState,
} from '@/tools/notes/notes-workspace-model'
import { sortTasks, taskMatchesView, TASK_VIEWS, type TaskView } from '@/tools/notes/task-model'
import type { Note } from '@/types/models'

type UseNotesLibraryInput = {
  state: NotesWorkspaceState
  updateState: UpdateNotesWorkspaceState
  today: string
}

export function useNotesLibrary({ state, updateState, today }: UseNotesLibraryInput) {
  const notes = useNotesStore((store) => store.notes)
  const addNote = useNotesStore((store) => store.add)
  const updateTask = useNotesStore((store) => store.updateTask)
  const folders = useFoldersStore((store) => store.folders)
  const createFolder = useFoldersStore((store) => store.create)
  const updateFolder = useFoldersStore((store) => store.update)
  const moveFolder = useFoldersStore((store) => store.move)
  const setLastAction = useUiStore((store) => store.setLastAction)
  const [search, setSearch] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const fuse = useMemo(
    () =>
      new Fuse(notes, {
        keys: ['title', 'content', 'tags'],
        threshold: 0.3,
      }),
    [notes]
  )
  const noteFolders = useMemo(() => foldersForKind(folders, 'notes'), [folders])
  const selectedFolderIds = useMemo(
    () =>
      state.selectedFolderId ? descendantFolderIds(noteFolders, state.selectedFolderId) : null,
    [noteFolders, state.selectedFolderId]
  )
  const filteredNotes = useMemo(() => {
    let candidates = search.trim() ? fuse.search(search.trim()).map((result) => result.item) : notes
    candidates = candidates.filter(
      (note) =>
        taskMatchesView(note, state.taskView, today) &&
        (!state.hideCompleted || state.taskView === 'completed' || note.taskStatus !== 'done')
    )
    const inFolder = selectedFolderIds
      ? candidates.filter((note) => note.folderId && selectedFolderIds.has(note.folderId))
      : candidates
    return state.taskView === 'notes' ? inFolder : sortTasks(inFolder)
  }, [fuse, notes, search, selectedFolderIds, state.hideCompleted, state.taskView, today])
  const taskCounts = useMemo(() => {
    const counts = new Map<TaskView, number>()
    for (const view of TASK_VIEWS) {
      counts.set(
        view.value,
        notes.filter(
          (note) =>
            taskMatchesView(note, view.value, today) &&
            // Match the list filter, so a count never exceeds the visible rows.
            (!state.hideCompleted || view.value === 'completed' || note.taskStatus !== 'done')
        ).length
      )
    }
    return counts
  }, [notes, state.hideCompleted, today])
  const completedCount = taskCounts.get('completed') ?? 0
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of notes) {
      if (note.folderId) counts.set(note.folderId, (counts.get(note.folderId) ?? 0) + 1)
    }
    return counts
  }, [notes])

  const handleNew = useCallback(async () => {
    try {
      const note = await addNote(
        'Untitled note',
        '',
        'yellow',
        state.selectedFolderId ?? 'notes-inbox'
      )
      updateState({ selectedId: note.id })
      setLastAction('Note created', 'success')
    } catch {
      setLastAction('Failed to create note', 'error')
    }
  }, [addNote, setLastAction, state.selectedFolderId, updateState])

  const handleNewTask = useCallback(async () => {
    try {
      const note = await addNote(
        'Untitled task',
        '',
        'yellow',
        state.selectedFolderId ?? 'notes-inbox',
        { status: 'todo', priority: 'medium' }
      )
      updateState({ selectedId: note.id, taskView: 'all' })
      setLastAction('Task created', 'success')
    } catch {
      setLastAction('Failed to create task', 'error')
    }
  }, [addNote, setLastAction, state.selectedFolderId, updateState])

  const handleToggleComplete = useCallback(
    async (note: Note) => {
      if (!note.taskStatus) return
      try {
        await updateTask(note.id, { status: note.taskStatus === 'done' ? 'todo' : 'done' })
        setLastAction(note.taskStatus === 'done' ? 'Task reopened' : 'Task completed', 'success')
      } catch {
        setLastAction('Failed to update task', 'error')
      }
    },
    [setLastAction, updateTask]
  )

  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, noteId: string) => {
      const index = filteredNotes.findIndex((note) => note.id === noteId)
      if (index < 0) return
      const nextIndex =
        event.key === 'ArrowDown'
          ? Math.min(index + 1, filteredNotes.length - 1)
          : event.key === 'ArrowUp'
            ? Math.max(index - 1, 0)
            : null
      if (nextIndex === null) return
      event.preventDefault()
      const next = filteredNotes[nextIndex]
      if (!next) return
      updateState({ selectedId: next.id })
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-notes-workspace-id="${next.id}"]`)
        ?.focus()
    },
    [filteredNotes, updateState]
  )

  return {
    notes,
    folders,
    search,
    setSearch,
    listRef,
    noteFolders,
    filteredNotes,
    taskCounts,
    completedCount,
    folderCounts,
    createFolder,
    updateFolder,
    moveFolder,
    handleNew,
    handleNewTask,
    handleToggleComplete,
    handleListKeyDown,
  }
}
