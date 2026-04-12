import { useState, useCallback } from 'react'
import { Sidebar } from '@/components/shell/Sidebar'
import { Workspace } from '@/components/shell/Workspace'
import { NotesDrawer } from '@/components/shell/NotesDrawer'
import { StatusBar } from '@/components/shell/StatusBar'
import { CommandPalette } from '@/components/shell/CommandPalette'
import { ToastContainer } from '@/components/shared/Toast'
import { SendToMenu, SendToContext } from '@/components/shared/SendToMenu'
import { SettingsPanel } from '@/components/shell/SettingsPanel'
import { ShortcutsModal } from '@/components/shell/ShortcutsModal'
import { UpdateNotification } from '@/components/shell/UpdateNotification'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'

export function App() {
  useGlobalShortcuts()

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
      <div className="flex h-full flex-col">
        <UpdateNotification />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <Workspace />
          </main>
          <NotesDrawer />
        </div>
        <StatusBar />
        <CommandPalette />
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
