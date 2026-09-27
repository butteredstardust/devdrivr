import { create, type UseBoundStore, type StoreApi } from 'zustand'
import { getSetting, setSetting } from '@/lib/db'

/**
 * The files that a tool opened or saved most recently, newest first. Each tool that has a Recent
 * menu keeps its own list in its own setting.
 *
 * WARNING: a list loads lazily. `record` and `remove` wait for the load, so a change made before
 * it finishes cannot write a short list over the stored one. When the load fails, they change
 * nothing.
 */

export const RECENT_FILES_SETTING = 'textEditorRecentFiles'
export const RECENT_LOGS_SETTING = 'logViewerRecentFiles'
export const MAX_RECENT_FILES = 10

/** Moves `path` to the front, removes its duplicate, and keeps the newest entries. */
export function withRecentFile(paths: readonly string[], path: string): string[] {
  return [path, ...paths.filter((item) => item !== path)].slice(0, MAX_RECENT_FILES)
}

function isPathList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export type RecentFilesStore = {
  paths: string[]
  /** Resolves `false` when the stored list cannot be read. The next call tries again. */
  load: () => Promise<boolean>
  record: (path: string) => Promise<void>
  remove: (path: string) => Promise<void>
  clear: () => Promise<void>
  /** Forgets the loaded list. For tests only. */
  reset: () => void
}

export type RecentFilesHook = UseBoundStore<StoreApi<RecentFilesStore>>

function createRecentFilesStore(setting: string): RecentFilesHook {
  let loading: Promise<boolean> | null = null

  return create<RecentFilesStore>((set, get) => {
    const change = async (next: (paths: string[]) => string[]) => {
      // Without the stored list, a save would write a short list over it.
      if (!(await get().load())) return
      const paths = next(get().paths)
      set({ paths })
      await setSetting(setting, paths).catch((error: unknown) => {
        console.warn('[recent-files] unable to save the list', error)
      })
    }

    return {
      paths: [],
      load: () => {
        loading ??= getSetting<unknown>(setting, [])
          .then((stored) => {
            if (isPathList(stored)) set({ paths: stored.slice(0, MAX_RECENT_FILES) })
            return true
          })
          .catch((error: unknown) => {
            console.warn('[recent-files] unable to load the list', error)
            loading = null
            return false
          })
        return loading
      },
      record: (path) => change((paths) => withRecentFile(paths, path)),
      remove: (path) => change((paths) => paths.filter((item) => item !== path)),
      clear: () => change(() => []),
      reset: () => {
        loading = null
        set({ paths: [] })
      },
    }
  })
}

/** The Text Editor list. */
export const useRecentFilesStore = createRecentFilesStore(RECENT_FILES_SETTING)

/** The Log Viewer list. */
export const useRecentLogsStore = createRecentFilesStore(RECENT_LOGS_SETTING)

/** Forgets every loaded list. For tests only. */
export function resetRecentFilesStore(): void {
  useRecentFilesStore.getState().reset()
  useRecentLogsStore.getState().reset()
}
