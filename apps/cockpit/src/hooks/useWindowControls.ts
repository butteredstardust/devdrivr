import { useCallback, useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface UseWindowControlsResult {
  /** Whether the window is currently maximized. Kept in sync via the resize event. */
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
 * Exposes window-control state and actions for a client-side-decorated title bar.
 *
 * All window access goes through `getCurrentWindow()`, matching `src/app/providers.tsx`.
 * There is no dedicated "maximized changed" event in the Tauri 2 window API, so maximized
 * state is re-read (not polled on a timer) each time the resize event fires — that is the
 * only event that can change it short of the window-control buttons themselves, which update
 * state locally after calling their own API.
 */
export function useWindowControls(): UseWindowControlsResult {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isFocused, setIsFocused] = useState(true)

  useEffect(() => {
    let cancelled = false
    const cleanups: Array<() => void> = []
    const win = getCurrentWindow()

    async function bootstrap() {
      try {
        const [maximized, focused] = await Promise.all([win.isMaximized(), win.isFocused()])
        if (!cancelled) {
          setIsMaximized(maximized)
          setIsFocused(focused)
        }
      } catch {
        // Window may not be ready yet — listeners below will still catch up.
      }

      const unlistenResized = await win.onResized(() => {
        win
          .isMaximized()
          .then((maximized) => setIsMaximized(maximized))
          .catch(() => {})
      })
      if (cancelled) {
        unlistenResized()
        return
      }
      cleanups.push(unlistenResized)

      const unlistenFocus = await win.onFocusChanged(({ payload }) => {
        setIsFocused(payload)
      })
      if (cancelled) {
        unlistenFocus()
        return
      }
      cleanups.push(unlistenFocus)
    }

    bootstrap()

    return () => {
      cancelled = true
      cleanups.forEach((unlisten) => unlisten())
    }
  }, [])

  const minimize = useCallback(() => {
    void getCurrentWindow().minimize()
  }, [])

  const toggleMaximize = useCallback(() => {
    void getCurrentWindow().toggleMaximize()
  }, [])

  const close = useCallback(() => {
    void getCurrentWindow().close()
  }, [])

  return { isMaximized, isFocused, minimize, toggleMaximize, close }
}
