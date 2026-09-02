import { useCallback, useEffect, useState } from 'react'
import {
  closeNativeWindow,
  getNativeWindowState,
  minimizeNativeWindow,
  toggleNativeWindowFullscreen,
  toggleNativeWindowMaximize,
} from '@/lib/native-window'

export interface UseWindowControlsResult {
  isMaximized: boolean
  isFullscreen: boolean
  isFocused: boolean
  minimize: () => void
  toggleFullscreen: () => void
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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isFocused, setIsFocused] = useState(() => document.hasFocus())

  useEffect(() => {
    let cancelled = false
    let reconcileTimer: ReturnType<typeof setTimeout> | undefined
    let reconcileInFlight = false
    let reconcilePending = false

    const reconcileWindowState = () => {
      if (cancelled) return
      if (reconcileInFlight) {
        reconcilePending = true
        return
      }
      reconcileInFlight = true
      reconcilePending = false
      void getNativeWindowState()
        .then((state) => {
          if (!cancelled) {
            setIsMaximized(state.isMaximized)
            setIsFullscreen(state.isFullscreen)
          }
        })
        .catch((err) => console.error('[useWindowControls] getState failed:', err))
        .finally(() => {
          reconcileInFlight = false
          if (reconcilePending && !cancelled) reconcileWindowState()
        })
    }

    const scheduleReconcile = () => {
      if (reconcileTimer) clearTimeout(reconcileTimer)
      reconcileTimer = setTimeout(() => {
        reconcileTimer = undefined
        reconcileWindowState()
      }, RESIZE_RECONCILE_MS)
    }

    const handleFocus = () => setIsFocused(true)
    const handleBlur = () => setIsFocused(false)

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('resize', scheduleReconcile)
    reconcileWindowState()

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
      .then((state) => {
        setIsMaximized(state.isMaximized)
        setIsFullscreen(state.isFullscreen)
      })
      .catch((err) => console.error('[useWindowControls] toggleMaximize failed:', err))
  }, [])

  const toggleFullscreen = useCallback(() => {
    void toggleNativeWindowFullscreen()
      .then((state) => {
        setIsMaximized(state.isMaximized)
        setIsFullscreen(state.isFullscreen)
      })
      .catch((err) => console.error('[useWindowControls] toggleFullscreen failed:', err))
  }, [])

  const close = useCallback(() => {
    void closeNativeWindow().catch((err) => console.error('[useWindowControls] close failed:', err))
  }, [])

  return {
    isMaximized,
    isFullscreen,
    isFocused,
    minimize,
    toggleFullscreen,
    toggleMaximize,
    close,
  }
}
