import { Sidebar } from '@/components/shell/Sidebar'
import { Workspace } from '@/components/shell/Workspace'
import { NotesDrawer } from '@/components/shell/NotesDrawer'
import { StatusBar } from '@/components/shell/StatusBar'
import { CommandPalette } from '@/components/shell/CommandPalette'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'

export function App() {
  useGlobalShortcuts()

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Workspace />
        </main>
        <NotesDrawer />
      </div>
      <StatusBar />
      <CommandPalette />
    </div>
  )
}
