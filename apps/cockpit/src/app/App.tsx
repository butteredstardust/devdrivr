import { useState, useCallback } from 'react'
import { Sidebar } from '@/components/shell/Sidebar'
import { Workspace } from '@/components/shell/Workspace'
import { NotesDrawer } from '@/components/shell/NotesDrawer'
import { StatusBar } from '@/components/shell/StatusBar'
import { TitleBar } from '@/components/shell/TitleBar'
import { ToastContainer } from '@/components/shared/Toast'
import { SendToMenu, SendToContext } from '@/components/shared/SendToMenu'
import { SettingsPanel } from '@/components/shell/SettingsPanel'
import { ShortcutsModal } from '@/components/shell/ShortcutsModal'
import { UpdateNotification } from '@/components/shell/UpdateNotification'
import { WindowResizeHandles } from '@/components/shell/WindowResizeHandles'
import { useExternalLinks } from '@/hooks/useExternalLinks'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'
import { useSettingsStore } from '@/stores/settings.store'

export function App() {
  useGlobalShortcuts()
  useExternalLinks()
  const shellStyle = useSettingsStore((s) => s.shellStyle)

  const [sendTo, setSendTo] = useState<{
    content: string
    position: { x: number; y: number }
  } | null>(null)

  const showSendTo = useCallback((content: string, position: { x: number; y: number }) => {
    setSendTo({ content, position })
  }, [])

  const closeSendTo = useCallback(() => setSendTo(null), [])

  return (
    <SendToContext.Provider value={{ showSendTo }}>
      {/* `data-shell` is the single switch for the shell's layout mode; everything it
          changes is in styles/shell.css, scoped to the hook classes below. */}
      <div data-shell={shellStyle} className="shell-canvas flex h-full flex-col">
        <TitleBar />
        <WindowResizeHandles />
        <UpdateNotification />
        <div className="shell-row flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="shell-panel flex-1 overflow-hidden">
            <Workspace />
          </main>
          <NotesDrawer />
        </div>
        <StatusBar />
        <ToastContainer />
        <SettingsPanel />
        <ShortcutsModal />
      </div>
      {sendTo && (
        <SendToMenu content={sendTo.content} position={sendTo.position} onClose={closeSendTo} />
      )}
    </SendToContext.Provider>
  )
}
