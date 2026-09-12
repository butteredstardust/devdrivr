import { getCurrentWindow } from '@tauri-apps/api/window'
import { useSettingsStore } from '@/stores/settings.store'

/** Keep the native pin state and its persisted setting in sync. */
export async function setAlwaysOnTop(next: boolean): Promise<void> {
  const settings = useSettingsStore.getState()
  const previous = settings.alwaysOnTop
  const win = getCurrentWindow()

  await win.setAlwaysOnTop(next)
  const persisted = await settings.update('alwaysOnTop', next)
  if (persisted) return

  try {
    await win.setAlwaysOnTop(previous)
  } catch {
    // The settings store already restored its value. Native rollback is best effort.
  }
  throw new Error('Failed to save window pin state')
}
