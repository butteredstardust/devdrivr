import { create } from 'zustand'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getSetting, setSetting } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

const CHECK_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

export type UpdateInfo = {
  version: string
  notes: string
  pub_date: string
}

type UpdaterStore = {
  updateInfo: UpdateInfo | null
  isChecking: boolean
  isDownloading: boolean
  /** Downloaded and staged; the new version takes effect on the next launch. */
  isReady: boolean
  /** Install has been handed to the plugin; the app is on its way down. */
  isInstalling: boolean
  /** 0–1 while downloading, or null when the server sends no content length. */
  progress: number | null
  dismissed: boolean
  lastCheckedAt: number | null
  /** force=true bypasses the 1h cooldown (used by the manual "Check Now" button) */
  checkForUpdate: (force?: boolean) => Promise<void>
  downloadUpdate: () => Promise<void>
  restartToUpdate: () => Promise<void>
  dismiss: () => void
}

/**
 * The plugin's `Update` is a live handle to a Rust-side resource, not data — putting it in the
 * store would mean React state holding something it can neither compare nor serialise. The store
 * keeps the plain facts the UI renders; this keeps the handle they refer to.
 */
let pendingUpdate: Update | null = null

export const useUpdaterStore = create<UpdaterStore>()((set, get) => ({
  updateInfo: null,
  isChecking: false,
  isDownloading: false,
  isReady: false,
  isInstalling: false,
  progress: null,
  dismissed: false,
  lastCheckedAt: null,

  checkForUpdate: async (force = false) => {
    // Set isChecking immediately to close the race window before any async work
    const { isChecking, isDownloading, isReady, isInstalling } = get()
    if (isChecking) return

    // A check reassigns `pendingUpdate`, so it must not run while an earlier handle is mid-flight.
    // Otherwise a download in progress finishes and flips isReady on a handle that has since been
    // replaced, and the restart installs an Update that was never downloaded.
    if (isDownloading || isInstalling) return
    if (isReady) {
      if (force) {
        useUiStore.getState().addToast('Update already downloaded — restart to install', 'info')
      }
      return
    }

    set({ isChecking: true })

    try {
      // Respect 1h cooldown unless manually triggered
      if (!force) {
        const persistedLastChecked = await getSetting<number | null>('updaterLastCheckedAt', null)
        if (
          persistedLastChecked !== null &&
          Date.now() - persistedLastChecked < CHECK_COOLDOWN_MS
        ) {
          set({ lastCheckedAt: persistedLastChecked, isChecking: false })
          return
        }
      }

      const update = await check()
      const now = Date.now()
      await setSetting('updaterLastCheckedAt', now)

      if (!update) {
        pendingUpdate = null
        set({ isChecking: false, lastCheckedAt: now, updateInfo: null })
        if (force) {
          useUiStore.getState().addToast('devdrivr is up to date', 'success')
        }
        return
      }

      pendingUpdate = update
      set({
        updateInfo: {
          version: update.version,
          notes: update.body ?? '',
          pub_date: update.date ?? '',
        },
        isChecking: false,
        lastCheckedAt: now,
        isReady: false,
        progress: null,
        dismissed: false,
      })
    } catch {
      // Silent fail on auto-check; show error on manual check
      set({ isChecking: false })
      if (force) {
        useUiStore.getState().addToast('Update check failed', 'error')
      }
    }
  },

  downloadUpdate: async () => {
    const { isDownloading, isReady, isInstalling } = get()
    if (!pendingUpdate || isDownloading || isReady || isInstalling) return

    // Pin the handle for the duration. The guards above should stop `pendingUpdate` being
    // reassigned mid-download, but this keeps the invariant local to the function that depends on
    // it: we only ever report ready for the handle we actually downloaded.
    const handle = pendingUpdate

    set({ isDownloading: true, progress: null })
    const addToast = useUiStore.getState().addToast

    try {
      let downloaded = 0
      let total = 0

      await handle.download((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0
            set({ progress: total > 0 ? 0 : null })
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            if (total > 0) set({ progress: Math.min(downloaded / total, 1) })
            break
          case 'Finished':
            set({ progress: 1 })
            break
        }
      })

      if (pendingUpdate !== handle) {
        // Something replaced the handle while we were downloading. Staying silent is wrong (the
        // user asked for a download) but claiming ready would be worse, because restarting would
        // install a handle with no downloaded payload.
        set({ isDownloading: false, progress: null })
        addToast('Update changed while downloading — check again', 'error')
        return
      }

      set({ isDownloading: false, isReady: true })
      addToast('Update ready — restart to finish installing', 'success')
    } catch (err) {
      set({ isDownloading: false, progress: null })
      const msg = err instanceof Error ? err.message : String(err)
      addToast(`Download failed: ${msg}`, 'error')
    }
  },

  restartToUpdate: async () => {
    // isInstalling latches: install() hands off to the plugin and relaunch() never returns, so
    // without it a second click starts a concurrent install of the same payload.
    if (!pendingUpdate || !get().isReady || get().isInstalling) return
    set({ isInstalling: true })

    try {
      await pendingUpdate.install()
      await relaunch()
    } catch (err) {
      set({ isInstalling: false })
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast(`Install failed: ${msg}`, 'error')
    }
  },

  dismiss: () => set({ dismissed: true }),
}))
