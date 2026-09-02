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

export interface NativeWindowState {
  isFullscreen: boolean
  isMaximized: boolean
}

export function focusNativeWindow(): Promise<void> {
  return invoke('window_focus')
}

export function getNativeWindowState(): Promise<NativeWindowState> {
  return invoke('window_get_state')
}

export function minimizeNativeWindow(): Promise<void> {
  return invoke('window_minimize')
}

export function toggleNativeWindowMaximize(): Promise<NativeWindowState> {
  return invoke('window_toggle_maximize')
}

export function toggleNativeWindowFullscreen(): Promise<NativeWindowState> {
  return invoke('window_toggle_fullscreen')
}

export function closeNativeWindow(): Promise<void> {
  return invoke('window_close')
}

export function startNativeWindowResize(direction: WindowResizeDirection): Promise<void> {
  return invoke('window_start_resize', { direction })
}
