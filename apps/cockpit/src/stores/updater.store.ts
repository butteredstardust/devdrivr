import { create } from 'zustand'
import { fetch } from '@tauri-apps/plugin-http'
import { writeFile, mkdir } from '@tauri-apps/plugin-fs'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { downloadDir } from '@tauri-apps/api/path'
import { getSetting, setSetting } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

const MANIFEST_URL =
  'https://github.com/butteredstardust/devdrivr/releases/latest/download/latest.json'

const CHECK_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

type PlatformKey = 'darwin-aarch64' | 'darwin-x86_64' | 'linux-x86_64' | 'windows-x86_64'

type PlatformEntry = {
  url: string
}

type UpdateManifest = {
  version: string
  notes: string
  pub_date: string
  platforms: Partial<Record<PlatformKey, PlatformEntry>>
}

export type UpdateInfo = {
  version: string
  notes: string
  pub_date: string
  url: string
  platformKey: PlatformKey
}

type UpdaterStore = {
  updateInfo: UpdateInfo | null
  isChecking: boolean
  isDownloading: boolean
  dismissed: boolean
  lastCheckedAt: number | null
  checkForUpdate: () => Promise<void>
  downloadUpdate: (savePath?: string) => Promise<void>
  dismiss: () => void
}

function resolvePlatformKey(os: string, arch: string): PlatformKey | null {
  if (os === 'macos' && arch === 'aarch64') return 'darwin-aarch64'
  if (os === 'macos' && arch === 'x86_64') return 'darwin-x86_64'
  if (os === 'linux' && arch === 'x86_64') return 'linux-x86_64'
  if (os === 'windows' && arch === 'x86_64') return 'windows-x86_64'
  return null
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Strip any path separators from a URL-derived filename to prevent traversal. */
function sanitizeFilename(raw: string): string {
  return raw.replace(/[/\\]/g, '_').replace(/^\.+/, '_')
}

/** Shared download helper: fetches URL and writes to destPath. */
async function downloadToPath(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, { method: 'GET' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const buffer = await response.arrayBuffer()
  await writeFile(destPath, new Uint8Array(buffer))
}

export const useUpdaterStore = create<UpdaterStore>()((set, get) => ({
  updateInfo: null,
  isChecking: false,
  isDownloading: false,
  dismissed: false,
  lastCheckedAt: null,

  checkForUpdate: async () => {
    const { isChecking } = get()
    if (isChecking) return

    // Respect cooldown — read persisted lastCheckedAt from DB
    const persistedLastChecked = await getSetting<number | null>('updaterLastCheckedAt', null)
    if (persistedLastChecked !== null && Date.now() - persistedLastChecked < CHECK_COOLDOWN_MS) {
      set({ lastCheckedAt: persistedLastChecked })
      return
    }

    set({ isChecking: true })
    try {
      const [os, arch] = await invoke<[string, string]>('get_platform_info')
      const platformKey = resolvePlatformKey(os, arch)
      const now = Date.now()

      if (!platformKey) {
        await setSetting('updaterLastCheckedAt', now)
        set({ isChecking: false, lastCheckedAt: now })
        useUiStore.getState().addToast('Automatic updates are not supported on your platform', 'info')
        return
      }

      const response = await fetch(MANIFEST_URL, { method: 'GET' })
      if (!response.ok) {
        await setSetting('updaterLastCheckedAt', now)
        set({ isChecking: false, lastCheckedAt: now })
        return
      }

      const manifest = (await response.json()) as UpdateManifest
      const currentVersion = await getVersion()

      await setSetting('updaterLastCheckedAt', now)
      set({ lastCheckedAt: now })

      if (compareVersions(manifest.version, currentVersion) <= 0) {
        set({ isChecking: false })
        return
      }

      const platformEntry = manifest.platforms[platformKey]
      if (!platformEntry) {
        set({ isChecking: false })
        useUiStore.getState().addToast('Update available but no installer for your platform', 'info')
        return
      }

      set({
        updateInfo: {
          version: manifest.version,
          notes: manifest.notes,
          pub_date: manifest.pub_date,
          url: platformEntry.url,
          platformKey,
        },
        isChecking: false,
        dismissed: false,
      })
    } catch {
      // Silent fail — network issues should not disrupt the user
      set({ isChecking: false })
    }
  },

  downloadUpdate: async (savePath?: string) => {
    const { updateInfo, isDownloading } = get()
    if (!updateInfo || isDownloading) return

    set({ isDownloading: true })
    const addToast = useUiStore.getState().addToast

    try {
      let destPath = savePath
      if (!destPath) {
        const rawFilename = updateInfo.url.split('/').pop() ?? 'devdrivr-installer'
        const filename = sanitizeFilename(rawFilename)
        const chosen = await saveDialog({
          defaultPath: filename,
          title: 'Save installer',
        })
        if (!chosen) {
          set({ isDownloading: false })
          return
        }
        destPath = chosen
      }

      await downloadToPath(updateInfo.url, destPath)
      set({ isDownloading: false })
      addToast(`Installer saved to ${destPath}`, 'success')
    } catch (err) {
      set({ isDownloading: false })
      const msg = err instanceof Error ? err.message : String(err)
      addToast(`Download failed: ${msg}`, 'error')
    }
  },

  dismiss: () => set({ dismissed: true }),
}))

/**
 * Download update automatically to the user's Downloads folder.
 * Called from providers.tsx when downloadUpdatesAutomatically is enabled.
 */
export async function autoDownloadUpdate(updateInfo: UpdateInfo): Promise<void> {
  const addToast = useUiStore.getState().addToast
  try {
    const dlDir = await downloadDir()
    const rawFilename = updateInfo.url.split('/').pop() ?? 'devdrivr-installer'
    const filename = sanitizeFilename(rawFilename)
    const destPath = `${dlDir}/${filename}`

    await mkdir(dlDir, { recursive: true })
    await downloadToPath(updateInfo.url, destPath)

    addToast(`Update downloaded to ${destPath}`, 'success')
    useUpdaterStore.getState().dismiss()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    addToast(`Auto-download failed: ${msg}`, 'error')
  }
}
