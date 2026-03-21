import { type ReactNode, useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useHistoryStore } from '@/stores/history.store'

export function Providers({ children }: { children: ReactNode }) {
  const init = useSettingsStore((s) => s.init)
  const initialized = useSettingsStore((s) => s.initialized)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    init().then(() => {
      useNotesStore.getState().init()
      useSnippetsStore.getState().init()
      useHistoryStore.getState().init()
    }).catch((err) => {
      console.error('Failed to initialize settings:', err)
      setError(String(err))
    })
  }, [init])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-[var(--color-error)]">Failed to initialize: {error}</div>
      </div>
    )
  }

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="font-pixel text-sm text-[var(--color-accent)]">Loading...</div>
      </div>
    )
  }

  return <>{children}</>
}
