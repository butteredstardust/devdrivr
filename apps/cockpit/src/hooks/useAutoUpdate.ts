import { useCallback, useState } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type UpdateInfo = {
  version: string
  body: string
}

export function useAutoUpdate() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)

  const checkForUpdates = useCallback(async () => {
    setChecking(true)
    try {
      const result = await check()
      if (result) {
        setUpdate({ version: result.version, body: result.body ?? '' })
      } else {
        setUpdate(null)
      }
    } catch (err) {
      console.warn('Update check failed:', err)
    } finally {
      setChecking(false)
    }
  }, [])

  const installUpdate = useCallback(async () => {
    if (!update) return
    setInstalling(true)
    try {
      const result = await check()
      if (result) {
        await result.downloadAndInstall()
        await relaunch()
      }
    } catch (err) {
      console.error('Update install failed:', err)
      setInstalling(false)
    }
  }, [update])

  return { update, checking, installing, checkForUpdates, installUpdate }
}
