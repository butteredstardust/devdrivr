import { useCallback, useEffect, useState } from 'react'
import {
  closeNativeWindow,
  isNativeWindowMaximized,
  minimizeNativeWindow,
  toggleNativeWindowMaximize,
} from '@/lib/native-window'

export interface UseWindowControlsResult {
  isMaximized: boolean
  isFocused: boolean
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
}

const RESIZE_RECONCILE_MS = 200

/**
 * Window state for the client-side title bar.
 *
 * Native mutations use dedicated Rust commands instead of the window plugin. The plugin path can
 * deadlock when resize events and state reads overlap on macOS; browser focus/resize events keep
 * this hook independent of that channel while retaining accurate control state.
 */
export function useWindowControls(): UseWindowControlsResult {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isFocused, setIsFocused] = useState(() => document.hasFocus())

  useEffect(() => {
    let cancelled = false
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
      void isNativeWindowMaximized()
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

    const handleFocus = () => setIsFocused(true)
    const handleBlur = () => setIsFocused(false)

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('resize', scheduleReconcile)
    reconcileMaximized()

    return () => {
      cancelled = true
      if (reconcileTimer) clearTimeout(reconcileTimer)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('resize', scheduleReconcile)
    }
  }, [])

  const minimize = useCallback(() => {
    void minimizeNativeWindow().catch((err) =>
      console.error('[useWindowControls] minimize failed:', err)
    )
  }, [])

  const toggleMaximize = useCallback(() => {
    void toggleNativeWindowMaximize()
      .then(setIsMaximized)
      .catch((err) => console.error('[useWindowControls] toggleMaximize failed:', err))
  }, [])

  const close = useCallback(() => {
    void closeNativeWindow().catch((err) => console.error('[useWindowControls] close failed:', err))
  }, [])

  return { isMaximized, isFocused, minimize, toggleMaximize, close }
}
