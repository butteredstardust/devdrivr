import { useState, useCallback, useRef } from 'react'
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
import { ShellWidthContext, useElementWidth } from '@/hooks/useShellWidth'
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

  // The row is measured here, once, and read by both side panels. Measuring the window instead
  // would be wrong in the shell styles that inset the row (see styles/shell.css).
  const shellRowRef = useRef<HTMLDivElement | null>(null)
  const shellWidth = useElementWidth(shellRowRef)

  return (
    <SendToContext.Provider value={{ showSendTo }}>
      {/* `data-shell` is the single switch for the shell's layout mode; everything it
          changes is in styles/shell.css, scoped to the hook classes below. */}
      <div data-shell={shellStyle} className="shell-canvas flex h-full flex-col">
        <TitleBar />
        <WindowResizeHandles />
        <UpdateNotification />
        <ShellWidthContext.Provider value={shellWidth}>
          <div ref={shellRowRef} className="shell-row flex flex-1 overflow-hidden">
            <Sidebar />
            {/* `min-w-0` is explicit rather than inherited from `overflow-hidden` because the
                floor that matters is enforced upstream, in fitShellPanels: the side panels are
                sized so this column always has MIN_WORKSPACE_WIDTH left over. */}
            <main className="shell-panel min-w-0 flex-1 overflow-hidden">
              <Workspace />
            </main>
            <NotesDrawer />
          </div>
        </ShellWidthContext.Provider>
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
