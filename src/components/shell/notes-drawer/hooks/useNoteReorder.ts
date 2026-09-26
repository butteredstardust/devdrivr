import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useFrameThrottle } from '@/hooks/useFrameThrottle'
import { useNotesStore } from '@/stores/notes.store'
import { useUiStore } from '@/stores/ui.store'
import type { DragOverNote } from '@/components/shell/notes-drawer/note-helpers'

export function useNoteReorder(noteListRef: RefObject<HTMLDivElement | null>) {
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)
  const [dragOverNote, setDragOverNote] = useState<DragOverNote | null>(null)
  const draggedNoteIdRef = useRef<string | null>(null)

  // Note reordering, on pointer events rather than HTML5 drag-and-drop, for the
  // same reason the workspace tab strip is: the window runs with Tauri's
  // `dragDropEnabled` on (the default), whose native handler both delivers file
  // drops to `useFileDropZone` and swallows in-page `dragover`/`drop`. A
  // `draggable` handle here fired `dragstart` and then nothing, so the note
  // never moved — and because the swallowed drop still reached Tauri as a file
  // drop, a tool with file drop disabled answered the gesture with "File drop
  // is not supported by the active tool". The two features cannot share the
  // flag, and file drops are worth more than the browser's drag ghost.
  //
  // A drag only begins once the pointer has moved past a small threshold, so a
  // plain click on the handle still does nothing and the card's own buttons
  // keep working.
  const dragOrigin = useRef<{ noteId: string; y: number } | null>(null)
  // The gesture's state lives in refs; the `useState` copies exist only to
  // paint it. A pointerup can arrive in the same task as the pointermove before
  // it, ahead of any re-render, so a handler reading the rendered `dragOverNote`
  // would drop the note where it was two moves ago — or, when the first move and
  // the release coincide, default to 'before' and appear to do nothing at all.
  const dropTargetRef = useRef<DragOverNote | null>(null)

  // Hit-testing walks every rendered card and measures it, so it is the whole per-move cost of
  // a drag. The answer can only change once per frame, and a pointer delivers several moves in
  // that time, so it runs at most once per frame.
  const {
    run: scheduleDropTarget,
    flush: flushDropTarget,
    cancel: cancelDropTarget,
  } = useFrameThrottle((clientY: number, sourceNoteId: string) => {
    // Hit-test the rendered cards rather than relying on the pointer being over one: the list
    // shifts as the placeholder moves, and a pointer that has run past the end of a section
    // still has a meaningful answer.
    const list = noteListRef.current
    if (!list) return
    const nodes = [...list.querySelectorAll<HTMLElement>('[data-note-id]')]
    const sourcePinned = nodes.find((node) => node.dataset.noteId === sourceNoteId)?.dataset.pinned
    let target: DragOverNote | null = null
    for (const node of nodes) {
      const id = node.dataset.noteId
      // Pinned and unpinned notes are separate ordering groups — `reorder` refuses to move a
      // note across the boundary, so offering it as a drop target would only draw an indicator
      // that does nothing.
      if (!id || id === sourceNoteId || node.dataset.pinned !== sourcePinned) continue
      const rect = node.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        target = { id, position: 'before' }
        break
      }
      target = { id, position: 'after' }
    }

    // The pointer spends most of a drag over the same half of the same card, so the indicator
    // is usually unchanged. Setting state anyway re-renders an unvirtualized note list for a
    // drop marker that has not moved.
    const previous = dropTargetRef.current
    if (previous?.id === target?.id && previous?.position === target?.position) return
    dropTargetRef.current = target
    setDragOverNote(target)
  })

  const handleNotePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, noteId: string) => {
      if (event.button !== 0) return
      dragOrigin.current = { noteId, y: event.clientY }
    },
    []
  )

  useEffect(() => {
    const DRAG_THRESHOLD = 4

    const endGesture = () => {
      // A pending hit-test would repaint an indicator for a drag that is over.
      cancelDropTarget()
      dragOrigin.current = null
      draggedNoteIdRef.current = null
      dropTargetRef.current = null
      setDraggedNoteId(null)
      setDragOverNote(null)
    }

    // A drag that ends over one of the card's buttons would otherwise fire that
    // button's click on top of the reorder the gesture already performed. One
    // that ends elsewhere produces no click at all, so a suppressor armed at
    // pointerup and left waiting would sit armed and eat the user's next,
    // unrelated click. It has to expire on its own.
    let suppressorTimer: number | undefined
    const swallowTrailingClick = (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
    }
    const disarmSuppressor = () => {
      window.clearTimeout(suppressorTimer)
      window.removeEventListener('click', swallowTrailingClick, { capture: true })
    }
    const armSuppressor = () => {
      disarmSuppressor()
      window.addEventListener('click', swallowTrailingClick, { capture: true, once: true })
      suppressorTimer = window.setTimeout(disarmSuppressor, 0)
    }

    const onMove = (event: PointerEvent) => {
      const origin = dragOrigin.current
      if (!origin) return
      if (!draggedNoteIdRef.current && Math.abs(event.clientY - origin.y) < DRAG_THRESHOLD) return
      if (!draggedNoteIdRef.current) {
        draggedNoteIdRef.current = origin.noteId
        setDraggedNoteId(origin.noteId)
      }

      scheduleDropTarget(event.clientY, origin.noteId)
    }

    const onUp = () => {
      // The drop reads dropTargetRef, so a frame still pending here holds the answer for the
      // last move. Without this flush, releasing between frames drops the note where it was a
      // move ago.
      flushDropTarget()
      const dragging = draggedNoteIdRef.current
      const target = dropTargetRef.current
      if (!dragOrigin.current || !dragging) {
        endGesture()
        return
      }
      armSuppressor()

      if (target && target.id !== dragging) {
        // Read the store at drop time: a note may have been added or deleted
        // while the pointer was down.
        const { setLastAction: setAction } = useUiStore.getState()
        void useNotesStore
          .getState()
          .reorder(dragging, target.id, target.position)
          .then(() => setAction('Note moved', 'success'))
          .catch(() => setAction('Failed to move note', 'error'))
      }
      endGesture()
    }

    // A cancelled pointer, or a window that loses focus mid-gesture, must not
    // leave the drawer believing a drag is still in flight — the button comes up
    // somewhere we never hear about, and the next plain click would be read as
    // the end of the old drag.
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', endGesture)
    window.addEventListener('blur', endGesture)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', endGesture)
      window.removeEventListener('blur', endGesture)
      disarmSuppressor()
    }
  }, [scheduleDropTarget, flushDropTarget, cancelDropTarget, noteListRef])

  return { draggedNoteId, dragOverNote, handleNotePointerDown }
}
