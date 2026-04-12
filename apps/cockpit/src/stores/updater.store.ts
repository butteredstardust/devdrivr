import { create } from 'zustand'
import { fetch } from '@tauri-apps/plugin-http'
import { writeFile, mkdir } from '@tauri-apps/plugin-fs'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { downloadDir } from '@tauri-apps/api/path'
import { useUiStore } from '@/stores/ui.store'

const MANIFEST_URL =
  'https://github.com/butteredstardust/devdrivr/releases/latest/download/latest.json'

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
  downloadProgress: number
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

export const useUpdaterStore = create<UpdaterStore>()((set, get) => ({
  updateInfo: null,
  isChecking: false,
  isDownloading: false,
  downloadProgress: 0,
  dismissed: false,
  lastCheckedAt: null,

  checkForUpdate: async () => {
    const { isChecking } = get()
    if (isChecking) return

    set({ isChecking: true })
    try {
      const [os, arch] = await invoke<[string, string]>('get_platform_info')
      const platformKey = resolvePlatformKey(os, arch)
      if (!platformKey) {
        set({ isChecking: false, lastCheckedAt: Date.now() })
        return
      }

      const response = await fetch(MANIFEST_URL, { method: 'GET' })
      if (!response.ok) {
        set({ isChecking: false, lastCheckedAt: Date.now() })
        return
      }

      const manifest = (await response.json()) as UpdateManifest
      const currentVersion = await getVersion()

      if (compareVersions(manifest.version, currentVersion) <= 0) {
        set({ isChecking: false, lastCheckedAt: Date.now() })
        return
      }

      const platformEntry = manifest.platforms[platformKey]
      if (!platformEntry) {
        set({ isChecking: false, lastCheckedAt: Date.now() })
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
        lastCheckedAt: Date.now(),
        dismissed: false,
      })
    } catch {
      // Silent fail — network issues should not disrupt the user
      set({ isChecking: false, lastCheckedAt: Date.now() })
    }
  },

  downloadUpdate: async (savePath?: string) => {
    const { updateInfo, isDownloading } = get()
    if (!updateInfo || isDownloading) return

    set({ isDownloading: true, downloadProgress: 0 })
    const addToast = useUiStore.getState().addToast

    try {
      let destPath = savePath
      if (!destPath) {
        // User-chosen path via save dialog
        const filename = updateInfo.url.split('/').pop() ?? `devdrivr-installer`
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

      const response = await fetch(updateInfo.url, { method: 'GET' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const buffer = await response.arrayBuffer()
      set({ downloadProgress: 90 })

      await writeFile(destPath, new Uint8Array(buffer))
      set({ downloadProgress: 100, isDownloading: false })
      addToast(`Installer saved to ${destPath}`, 'success')
    } catch (err) {
      set({ isDownloading: false, downloadProgress: 0 })
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
    const filename = updateInfo.url.split('/').pop() ?? `devdrivr-installer`
    const destPath = `${dlDir}/${filename}`

    await mkdir(dlDir, { recursive: true })

    const response = await fetch(updateInfo.url, { method: 'GET' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const buffer = await response.arrayBuffer()
    await writeFile(destPath, new Uint8Array(buffer))
    addToast(`Update downloaded to ${destPath}`, 'success')
    useUpdaterStore.getState().dismiss()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    addToast(`Auto-download failed: ${msg}`, 'error')
  }
}
