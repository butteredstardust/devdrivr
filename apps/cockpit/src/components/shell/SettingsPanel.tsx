/**
 * The Settings dialog shell: which tab is showing, and nothing else.
 *
 * This file was 1,285 lines and mixed pure helpers, persistence, four unrelated tab bodies and the
 * dialog itself, so a change to the MCP token field shared a merge surface with the theme picker.
 * The tabs now live beside it in `settings/`, and the controls they share in
 * `settings/SettingControls`.
 */
import { useState } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { TOOLS } from '@/app/tool-registry'
import {
  CodeIcon,
  DatabaseIcon,
  GearSixIcon,
  HeartIcon,
  IdentificationBadgeIcon,
  PlugsConnectedIcon,
} from '@phosphor-icons/react'
import { AboutTab } from '@/components/shell/AboutTab'
import { GeneralTab } from '@/components/shell/settings/GeneralTab'
import { EditorTab } from '@/components/shell/settings/EditorTab'
import { DataTab } from '@/components/shell/settings/DataTab'
import { McpTab } from '@/components/shell/settings/McpTab'
import { AcknowledgmentsTab } from '@/components/shell/AcknowledgmentsTab'
import { TabBar, TabPanel } from '@/components/shared/TabBar'
import { Dialog } from '@/components/shared/Dialog'

// ─── Constants ───────────────────────────────────────────────────────

type TabId = 'general' | 'editor' | 'data' | 'mcp' | 'about' | 'acknowledgments'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <GearSixIcon size={14} /> },
  { id: 'editor', label: 'Editor', icon: <CodeIcon size={14} /> },
  { id: 'data', label: 'Data', icon: <DatabaseIcon size={14} /> },
  { id: 'mcp', label: 'MCP', icon: <PlugsConnectedIcon size={14} /> },
  { id: 'about', label: 'About', icon: <IdentificationBadgeIcon size={14} /> },
  { id: 'acknowledgments', label: 'Acknowledgments', icon: <HeartIcon size={14} /> },
]

// ─── Main Panel ─────────────────────────────────────────────────────

export function SettingsPanel() {
  const open = useUiStore((s) => s.settingsPanelOpen)
  const setOpen = useUiStore((s) => s.setSettingsPanelOpen)
  const [activeTab, setActiveTab] = useState<TabId>('general')

  if (!open) return null

  return (
    <Dialog
      title="Settings"
      onClose={() => setOpen(false)}
      closeLabel="Close settings"
      // `xl` since About and Acknowledgments joined: six tabs no longer fit across 35rem, and the
      // acknowledgments list is two columns of text per row that wrapped at the narrower step.
      size="xl"
      // The dialog is already a flex column capped at 90vh, so the body only has
      // to opt into filling it. It previously carried a hard `max-h-[60vh]` on the
      // tab content, which scrolled a three-wide theme grid of 20+ swatches
      // through a keyhole while ~30vh of the dialog sat unused below it.
      bodyClassName="flex min-h-0 flex-col p-0"
      titleClassName="text-[var(--color-accent)]"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-2xs text-[var(--color-text-muted)]">
            {TOOLS.length} tools loaded
          </span>
          <span className="text-2xs text-[var(--color-text-muted)]">
            Changes saved automatically
          </span>
        </div>
      }
    >
      {/* Tab bar — pinned; only the panel below it scrolls. It scrolls horizontally rather than
          squashing, so a narrow window loses the trailing tabs to a swipe instead of crushing six
          labels into unreadable slivers. The shared primitive owns the roles, the roving tabindex
          and the arrow/Home/End keys, and links each tab to its panel. */}
      <TabBar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        baseId="settings"
        aria-label="Settings sections"
        className="no-scrollbar shrink-0"
      />

      {/* Tab content */}
      <TabPanel
        baseId="settings"
        tabId={activeTab}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'editor' && <EditorTab />}
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'mcp' && <McpTab />}
        {activeTab === 'about' && <AboutTab />}
        {activeTab === 'acknowledgments' && <AcknowledgmentsTab />}
      </TabPanel>
    </Dialog>
  )
}
