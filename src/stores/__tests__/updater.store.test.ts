import { beforeEach, describe, expect, it, vi } from 'vitest'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getSetting, setSetting } from '@/lib/db'
import { useUpdaterStore } from '@/stores/updater.store'

vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }))
vi.mock('@/lib/db', () => ({ getSetting: vi.fn(), setSetting: vi.fn() }))

const addToast = vi.fn()
vi.mock('@/stores/ui.store', () => ({
  useUiStore: { getState: () => ({ addToast: (...args: unknown[]) => addToast(...args) }) },
}))

const mockCheck = vi.mocked(check)
const mockRelaunch = vi.mocked(relaunch)

/** A stand-in for the plugin's live `Update` handle. */
function makeUpdate(version: string) {
  let release!: () => void
  const downloadFinished = new Promise<void>((r) => {
    release = r
  })
  return {
    version,
    body: '',
    date: '2026-04-15',
    // Resolves only when the test says so, so a download can be held open mid-flight.
    download: vi.fn(async () => await downloadFinished),
    install: vi.fn(async () => {}),
    finishDownload: () => release(),
  }
}

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: a test that asserts `check` was *not* called leaves its
  // unconsumed mockResolvedValueOnce queued, and the next test would then receive the wrong handle.
  vi.resetAllMocks()
  vi.mocked(getSetting).mockResolvedValue(null)
  vi.mocked(setSetting).mockResolvedValue(undefined)
  useUpdaterStore.setState({
    updateInfo: null,
    isChecking: false,
    isDownloading: false,
    isReady: false,
    isInstalling: false,
    progress: null,
    dismissed: false,
    lastCheckedAt: null,
  })
})

describe('updater store lifecycle', () => {
  it('refuses to check while a download is in flight', async () => {
    const a = makeUpdate('0.2.0')
    mockCheck.mockResolvedValueOnce(a as never)
    await useUpdaterStore.getState().checkForUpdate(true)
    expect(useUpdaterStore.getState().updateInfo?.version).toBe('0.2.0')

    const downloading = useUpdaterStore.getState().downloadUpdate()
    expect(useUpdaterStore.getState().isDownloading).toBe(true)

    // The bug: this check would swap `pendingUpdate` to B, and A finishing would then mark B ready.
    const b = makeUpdate('0.3.0')
    mockCheck.mockResolvedValueOnce(b as never)
    await useUpdaterStore.getState().checkForUpdate(true)

    expect(mockCheck).toHaveBeenCalledTimes(1)
    expect(useUpdaterStore.getState().updateInfo?.version).toBe('0.2.0')

    a.finishDownload()
    await downloading

    // Restarting must install the handle that was actually downloaded.
    await useUpdaterStore.getState().restartToUpdate()
    expect(a.install).toHaveBeenCalledTimes(1)
    expect(b.install).not.toHaveBeenCalled()
  })

  it('refuses to check once an update is staged, and says why', async () => {
    const a = makeUpdate('0.2.0')
    mockCheck.mockResolvedValueOnce(a as never)
    await useUpdaterStore.getState().checkForUpdate(true)

    const downloading = useUpdaterStore.getState().downloadUpdate()
    a.finishDownload()
    await downloading
    expect(useUpdaterStore.getState().isReady).toBe(true)

    await useUpdaterStore.getState().checkForUpdate(true)

    expect(mockCheck).toHaveBeenCalledTimes(1)
    expect(addToast).toHaveBeenCalledWith('Update already downloaded — restart to install', 'info')
  })

  it('installs once however many times restart is clicked', async () => {
    const a = makeUpdate('0.2.0')
    mockCheck.mockResolvedValueOnce(a as never)
    await useUpdaterStore.getState().checkForUpdate(true)

    const downloading = useUpdaterStore.getState().downloadUpdate()
    a.finishDownload()
    await downloading

    await Promise.all([
      useUpdaterStore.getState().restartToUpdate(),
      useUpdaterStore.getState().restartToUpdate(),
      useUpdaterStore.getState().restartToUpdate(),
    ])

    expect(a.install).toHaveBeenCalledTimes(1)
    expect(mockRelaunch).toHaveBeenCalledTimes(1)
  })

  it('does not start a second download for the same update', async () => {
    const a = makeUpdate('0.2.0')
    mockCheck.mockResolvedValueOnce(a as never)
    await useUpdaterStore.getState().checkForUpdate(true)

    const first = useUpdaterStore.getState().downloadUpdate()
    await useUpdaterStore.getState().downloadUpdate()
    a.finishDownload()
    await first

    expect(a.download).toHaveBeenCalledTimes(1)
  })

  it('clears installing state so a failed install can be retried', async () => {
    const a = makeUpdate('0.2.0')
    a.install.mockRejectedValueOnce(new Error('disk full'))
    mockCheck.mockResolvedValueOnce(a as never)
    await useUpdaterStore.getState().checkForUpdate(true)

    const downloading = useUpdaterStore.getState().downloadUpdate()
    a.finishDownload()
    await downloading

    await useUpdaterStore.getState().restartToUpdate()
    expect(addToast).toHaveBeenCalledWith('Install failed: disk full', 'error')
    expect(useUpdaterStore.getState().isInstalling).toBe(false)

    await useUpdaterStore.getState().restartToUpdate()
    expect(a.install).toHaveBeenCalledTimes(2)
  })
})
