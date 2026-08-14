import { useCallback, useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface UseWindowControlsResult {
  /** Whether the window is currently maximized. */
  isMaximized: boolean
  /** Whether the window currently has OS focus. Drives dimmed/grey control states. */
  isFocused: boolean
  /** Minimizes the window. */
  minimize: () => void
  /** Toggles the window between maximized and restored. */
  toggleMaximize: () => void
  /** Closes the window. */
  close: () => void
}

/**
 * Trailing-edge delay before reconciling maximized state after a burst of resize events.
 *
 * This debounce is load-bearing, not a nicety. macOS emits a continuous stream of resize events
 * during a zoom animation or a live edge-drag; issuing one `isMaximized()` IPC round trip per
 * event floods Tauri's plugin command dispatch and permanently deadlocks it. Once wedged, *every*
 * subsequent `plugin:window|*` and `plugin:sql|*` invoke never resolves — window controls go dead
 * and, far worse, the app silently stops persisting to SQLite, while custom `#[tauri::command]`s
 * keep working so the UI still looks healthy. Measured: one click on a traffic light took plugin
 * IPC from ~1ms to never-responds, and stayed there for the life of the process.
 *
 * See documentation/NATIVE_UI_HARNESS.md for the repro.
 */
const RESIZE_RECONCILE_MS = 200

/**
 * Exposes window-control state and actions for a client-side-decorated title bar.
 *
 * All window access goes through `getCurrentWindow()`, matching `src/app/providers.tsx`.
 * There is no dedicated "maximized changed" event in the Tauri 2 window API, so maximized state
 * is tracked locally (flipped optimistically by `toggleMaximize`) and reconciled against the real
 * window on the trailing edge of a resize burst — never once per resize event.
 */
export function useWindowControls(): UseWindowControlsResult {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isFocused, setIsFocused] = useState(true)

  useEffect(() => {
    let cancelled = false
    const cleanups: Array<() => void> = []
    const win = getCurrentWindow()

    let reconcileTimer: ReturnType<typeof setTimeout> | undefined
    let reconcileInFlight = false
    let reconcilePending = false

    const reconcileMaximized = () => {
      if (cancelled) return
      if (reconcileInFlight) {
        reconcilePending = true
        return
      }
      reconcileInFlight = true
      reconcilePending = false
      win
        .isMaximized()
        .then((maximized) => {
          if (!cancelled) setIsMaximized(maximized)
        })
        .catch((err) => console.error('[useWindowControls] isMaximized failed:', err))
        .finally(() => {
          reconcileInFlight = false
          if (reconcilePending && !cancelled) reconcileMaximized()
        })
    }

    const scheduleReconcile = () => {
      if (reconcileTimer) clearTimeout(reconcileTimer)
      reconcileTimer = setTimeout(() => {
        reconcileTimer = undefined
        reconcileMaximized()
      }, RESIZE_RECONCILE_MS)
    }

    const keepListener = (unlisten: () => void) => {
      if (cancelled) unlisten()
      else cleanups.push(unlisten)
    }

    // Each listener is registered independently. A stalled or rejected native call must not
    // prevent the other listener from attaching.
    void win
      .onResized(scheduleReconcile)
      .then(keepListener)
      .catch((err) => console.error('[useWindowControls] onResized failed:', err))

    void win
      .onFocusChanged(({ payload }) => {
        if (!cancelled) setIsFocused(payload)
      })
      .then(keepListener)
      .catch((err) => console.error('[useWindowControls] onFocusChanged failed:', err))

    void Promise.all([win.isMaximized(), win.isFocused()])
      .then(([maximized, focused]) => {
        if (!cancelled) {
          setIsMaximized(maximized)
          setIsFocused(focused)
        }
      })
      .catch(() => {
        // Window may not be ready yet — the listeners above will catch up.
      })

    return () => {
      cancelled = true
      if (reconcileTimer) clearTimeout(reconcileTimer)
      cleanups.forEach((unlisten) => unlisten())
    }
  }, [])

  const minimize = useCallback(() => {
    getCurrentWindow()
      .minimize()
      .catch((err) => console.error('[useWindowControls] minimize failed:', err))
  }, [])

  const toggleMaximize = useCallback(() => {
    // Flipped optimistically so the button label/icon updates without a read-back round trip;
    // the authoritative value arrives via the debounced resize reconcile.
    setIsMaximized((maximized) => !maximized)
    getCurrentWindow()
      .toggleMaximize()
      .catch((err) => {
        // Undo this attempt's optimistic flip. Multiple failed attempts still compose correctly:
        // each rejected native toggle removes exactly one local inversion.
        setIsMaximized((maximized) => !maximized)
        console.error('[useWindowControls] toggleMaximize failed:', err)
      })
  }, [])

  const close = useCallback(() => {
    getCurrentWindow()
      .close()
      .catch((err) => console.error('[useWindowControls] close failed:', err))
  }, [])

  return { isMaximized, isFocused, minimize, toggleMaximize, close }
}
