import { create } from 'zustand'
import { getSetting, setSetting } from '@/lib/db'

/**
 * The files the Text Editor opened or saved most recently, newest first.
 *
 * WARNING: the list loads lazily. `record` and `remove` wait for the load, so a change made before
 * it finishes cannot write a short list over the stored one. When the load fails, they change
 * nothing.
 */

export const RECENT_FILES_SETTING = 'textEditorRecentFiles'
export const MAX_RECENT_FILES = 10

/** Moves `path` to the front, removes its duplicate, and keeps the newest entries. */
export function withRecentFile(paths: readonly string[], path: string): string[] {
  return [path, ...paths.filter((item) => item !== path)].slice(0, MAX_RECENT_FILES)
}

function isPathList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

type RecentFilesStore = {
  paths: string[]
  /** Resolves `false` when the stored list cannot be read. The next call tries again. */
  load: () => Promise<boolean>
  record: (path: string) => Promise<void>
  remove: (path: string) => Promise<void>
  clear: () => Promise<void>
}

let loading: Promise<boolean> | null = null

export const useRecentFilesStore = create<RecentFilesStore>((set, get) => {
  const change = async (next: (paths: string[]) => string[]) => {
    // Without the stored list, a save would write a short list over it.
    if (!(await get().load())) return
    const paths = next(get().paths)
    set({ paths })
    await setSetting(RECENT_FILES_SETTING, paths).catch((error: unknown) => {
      console.warn('[recent-files] unable to save the list', error)
    })
  }

  return {
    paths: [],
    load: () => {
      loading ??= getSetting<unknown>(RECENT_FILES_SETTING, [])
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
  }
})

/** Forgets the loaded list. For tests only. */
export function resetRecentFilesStore(): void {
  loading = null
  useRecentFilesStore.setState({ paths: [] })
}
