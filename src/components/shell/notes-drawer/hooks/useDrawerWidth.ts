import { useCallback, useEffect, useRef, useState } from 'react'
import { useEdgeResize } from '@/hooks/useEdgeResize'
import { useShellWidth } from '@/hooks/useShellWidth'
import { registerFlusher } from '@/lib/flush-on-exit'
import {
  clampNotesDrawerWidth as clampWidth,
  fitShellPanels,
  maxNotesDrawerWidth,
} from '@/lib/shell-layout'

type UseDrawerWidthOptions = {
  drawerOpen: boolean
  savedWidth: number
  sidebarCollapsed: boolean
  sidebarWidth: number
  updateSetting: (key: 'notesDrawerWidth', value: number) => Promise<unknown>
}

export function useDrawerWidth({
  drawerOpen,
  savedWidth,
  sidebarCollapsed,
  sidebarWidth,
  updateSetting,
}: UseDrawerWidthOptions) {
  const [width, setWidth] = useState(() => clampWidth(savedWidth))

  // `width` is what the user asked for; `renderedWidth` is what the row can spare once the
  // workspace has taken its floor. The drawer is the last panel asked to give ground — the
  // sidebar rails first — so this differs from `width` only below the minimum window size.
  // See lib/shell-layout.ts.
  const shellWidth = useShellWidth()
  const renderedWidth = fitShellPanels({
    shellWidth,
    sidebarWidth,
    sidebarCollapsed,
    notesDrawerWidth: width,
    notesDrawerOpen: drawerOpen,
  }).notesDrawerWidth
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingWidth = useRef<number | null>(null)

  useEffect(() => setWidth(clampWidth(savedWidth)), [savedWidth])

  // Read at pointer-down only; keeps the gesture from re-subscribing on every pixel of a drag.
  // A gesture starts from the rendered width, not the stored one. When the row has narrowed the
  // drawer below the stored width, starting from the stored width gives the user a dead zone: the
  // first pixels of the drag close a gap they cannot see before the edge moves.
  const widthRef = useRef(renderedWidth)
  widthRef.current = renderedWidth > 0 ? renderedWidth : width

  const flushPendingWidth = useCallback(async () => {
    clearTimeout(saveTimer.current)
    saveTimer.current = undefined
    const next = pendingWidth.current
    pendingWidth.current = null
    if (next !== null) await updateSetting('notesDrawerWidth', next)
  }, [updateSetting])
  useEffect(() => registerFlusher(flushPendingWidth), [flushPendingWidth])
  useEffect(() => () => void flushPendingWidth(), [flushPendingWidth])

  const persistWidth = useCallback(
    (final: number) => {
      clearTimeout(saveTimer.current)
      pendingWidth.current = final
      saveTimer.current = setTimeout(() => void flushPendingWidth(), 500)
    },
    [flushPendingWidth]
  )

  // The drawer may take whatever the measured row can spare, so the ceiling moves with the
  // window. Read it through a ref: a drag reads the limit at pointer-down and must not
  // re-subscribe as the row is measured.
  const drawerMax = maxNotesDrawerWidth(shellWidth)
  const clampToShell = useCallback((value: number) => clampWidth(value, shellWidth), [shellWidth])

  // Keyboard resizing, so the drawer edge isn't pointer-only. The handle is on the drawer's left
  // edge, so ArrowLeft widens it — the width grows in the direction the key points.
  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step =
        event.key === 'ArrowLeft'
          ? 16
          : event.key === 'ArrowRight'
            ? -16
            : // Home takes the value to its minimum and End to its maximum, as SplitPane and the
              // master-detail divider do. The drawer grows leftward, but the value is a width.
              event.key === 'Home'
              ? -drawerMax
              : event.key === 'End'
                ? drawerMax
                : null
      if (step === null) return
      event.preventDefault()
      const next = clampToShell(widthRef.current + step)
      setWidth(next)
      persistWidth(next)
    },
    [clampToShell, drawerMax, persistWidth]
  )

  const { resizing, onPointerDown: handleDragStart } = useEdgeResize({
    direction: -1,
    getWidth: () => widthRef.current,
    clamp: clampToShell,
    onResize: setWidth,
    onCommit: persistWidth,
  })

  return { drawerMax, handleDragStart, handleResizeKeyDown, renderedWidth, resizing }
}
