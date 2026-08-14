import { invoke } from '@tauri-apps/api/core'

export type WindowResizeDirection =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'NorthEast'
  | 'NorthWest'
  | 'SouthEast'
  | 'SouthWest'

export function focusNativeWindow(): Promise<void> {
  return invoke('window_focus')
}

export function isNativeWindowMaximized(): Promise<boolean> {
  return invoke('window_is_maximized')
}

export function minimizeNativeWindow(): Promise<void> {
  return invoke('window_minimize')
}

export function toggleNativeWindowMaximize(): Promise<boolean> {
  return invoke('window_toggle_maximize')
}

export function closeNativeWindow(): Promise<void> {
  return invoke('window_close')
}

export function startNativeWindowResize(direction: WindowResizeDirection): Promise<void> {
  return invoke('window_start_resize', { direction })
}
