import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  EXTENSION_TOOL_IDS,
  FALLBACK_OPEN_FILE_TOOL,
  extensionOf,
  openFileInTool,
  toolIdForFile,
} from '@/lib/file-routing'
import { OPEN_FILE_TOOL_IDS } from '@/app/tool-registry'
import { claimPendingToolAction, clearPendingToolActions } from '@/lib/tool-actions'
import { useWorkspaceStore } from '@/stores/workspace.store'

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
  loadToolState: vi.fn().mockResolvedValue(null),
  saveToolState: vi.fn().mockResolvedValue(undefined),
  deleteToolState: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  vi.clearAllMocks()
  clearPendingToolActions()
  useWorkspaceStore.setState({ tabs: [], activeTabId: null, activeTool: '', tabMru: [] })
})

describe('extensionOf', () => {
  it('reads the extension from a path', () => {
    expect(extensionOf('/Users/me/data/report.CSV')).toBe('csv')
    expect(extensionOf('C:\\Users\\me\\notes.md')).toBe('md')
  })

  it('returns empty for a file with no extension', () => {
    expect(extensionOf('/usr/local/bin/devdrivr')).toBe('')
  })

  it('treats a dotfile as a name, not an extension', () => {
    expect(extensionOf('.gitignore')).toBe('')
  })

  it('uses the last extension of a multi-part name', () => {
    expect(extensionOf('archive.tar.json')).toBe('json')
  })
})

describe('toolIdForFile', () => {
  it('routes a known extension to its tool', () => {
    expect(toolIdForFile('schema.json')).toBe('json-tools')
    expect(toolIdForFile('/tmp/diagram.mmd')).toBe('mermaid-editor')
    expect(toolIdForFile('READ.ME.markdown')).toBe('markdown-editor')
    expect(toolIdForFile('/var/log/app.LOG')).toBe('log-viewer')
  })

  it('falls back for an unknown extension', () => {
    expect(toolIdForFile('notes.rtf')).toBe(FALLBACK_OPEN_FILE_TOOL)
    expect(toolIdForFile('Makefile')).toBe(FALLBACK_OPEN_FILE_TOOL)
  })

  it('ignores case', () => {
    expect(toolIdForFile('Data.JSON')).toBe('json-tools')
  })

  it('only ever names a tool that accepts file content', () => {
    for (const toolId of [...Object.values(EXTENSION_TOOL_IDS), FALLBACK_OPEN_FILE_TOOL]) {
      expect(OPEN_FILE_TOOL_IDS.has(toolId), `${toolId} must set supportsOpenFile`).toBe(true)
    }
  })
})

describe('bundle file associations', () => {
  // An association the OS offers but nothing routes would open in the fallback tool, which is a
  // worse result than the user expects from picking devdrivr for a `.yaml` file.
  it('routes every extension the bundle claims', () => {
    const config = JSON.parse(
      readFileSync(resolve(__dirname, '../../../src-tauri/tauri.conf.json'), 'utf8')
    ) as { bundle: { fileAssociations: Array<{ ext: string[] }> } }

    const declared = config.bundle.fileAssociations.flatMap((entry) => entry.ext)
    expect(declared.length).toBeGreaterThan(0)
    for (const ext of declared) {
      expect(EXTENSION_TOOL_IDS[ext], `${ext} has no route`).toBeDefined()
    }
  })
})

describe('openFileInTool', () => {
  it('opens the routed tool and queues the file for it', () => {
    const toolId = openFileInTool({
      content: 'a,b\n1,2\n',
      filename: 'people.csv',
      path: '/tmp/people.csv',
    })

    expect(toolId).toBe('csv-tools')
    const { tabs, activeTool } = useWorkspaceStore.getState()
    expect(activeTool).toBe('csv-tools')

    expect(claimPendingToolAction(tabs[0]!.stateKey!)).toEqual({
      type: 'open-file',
      content: 'a,b\n1,2\n',
      filename: 'people.csv',
      path: '/tmp/people.csv',
    })
  })

  it('addresses the tab it focuses, not the bare tool id', () => {
    // Only a scoped tab survives, so a queue keyed on `json-tools` would never be claimed.
    useWorkspaceStore.getState().openTab('json-tools')
    const firstId = useWorkspaceStore.getState().tabs[0]!.id
    useWorkspaceStore.getState().openTabInstance('json-tools')
    useWorkspaceStore.getState().closeTab(firstId)

    const survivor = useWorkspaceStore.getState().tabs[0]!
    expect(survivor.stateKey).toBe(`json-tools#${survivor.id}`)

    openFileInTool({ content: '{}', filename: 'a.json', path: '/tmp/a.json' })

    expect(claimPendingToolAction('json-tools')).toBeNull()
    expect(claimPendingToolAction(survivor.stateKey!)).toMatchObject({ filename: 'a.json' })
  })

  it('drops a queued file when its tab closes', () => {
    openFileInTool({ content: '{}', filename: 'a.json', path: '/tmp/a.json' })
    const tab = useWorkspaceStore.getState().tabs[0]!

    useWorkspaceStore.getState().closeTab(tab.id)

    // Reopening the tool takes the same bare key. The dismissed file must not come back with it.
    useWorkspaceStore.getState().openTab('json-tools')
    expect(claimPendingToolAction(useWorkspaceStore.getState().tabs[0]!.stateKey!)).toBeNull()
  })

  it('gives a second file of the same type its own tab', () => {
    openFileInTool({ content: '{"a":1}', filename: 'a.json', path: '/tmp/a.json' })
    openFileInTool({ content: '{"b":2}', filename: 'b.json', path: '/tmp/b.json' })

    // The first file was still queued, so replacing it would lose a document the user chose.
    const tabs = useWorkspaceStore.getState().tabs
    expect(tabs).toHaveLength(2)
    expect(claimPendingToolAction(tabs[0]!.stateKey!)).toMatchObject({ filename: 'a.json' })
    expect(claimPendingToolAction(tabs[1]!.stateKey!)).toMatchObject({ filename: 'b.json' })
  })

  it('reuses the tab once its file has been taken', () => {
    openFileInTool({ content: '{"a":1}', filename: 'a.json', path: '/tmp/a.json' })
    const tab = useWorkspaceStore.getState().tabs[0]!
    claimPendingToolAction(tab.stateKey!)

    openFileInTool({ content: '{"b":2}', filename: 'b.json', path: '/tmp/b.json' })

    expect(useWorkspaceStore.getState().tabs).toHaveLength(1)
    expect(claimPendingToolAction(tab.stateKey!)).toMatchObject({ filename: 'b.json' })
  })

  it('gives a second file its own tab even when the first was taken at once', () => {
    openFileInTool({ content: '{"a":1}', filename: 'a.json', path: '/tmp/a.json' })
    const first = useWorkspaceStore.getState().tabs[0]!
    // A tool that was already mounted claims its file before the next one finishes reading, so
    // nothing is left queued to reveal the collision.
    claimPendingToolAction(first.stateKey!)

    openFileInTool(
      { content: '{"b":2}', filename: 'b.json', path: '/tmp/b.json' },
      { forceNewTab: true }
    )

    const tabs = useWorkspaceStore.getState().tabs
    expect(tabs).toHaveLength(2)
    expect(claimPendingToolAction(tabs[1]!.stateKey!)).toMatchObject({ filename: 'b.json' })
  })

  it('routes source files to a tool that can save them back', () => {
    expect(toolIdForFile('main.ts')).toBe('text-editor')
    expect(toolIdForFile('App.tsx')).toBe('text-editor')
    expect(toolIdForFile('script.py')).toBe('text-editor')
  })

  it('keeps two files apart when they route to different tools', () => {
    openFileInTool({ content: '{}', filename: 'a.json', path: '/tmp/a.json' })
    openFileInTool({ content: '# b', filename: 'b.md', path: '/tmp/b.md' })

    const { tabs } = useWorkspaceStore.getState()
    const json = tabs.find((tab) => tab.toolId === 'json-tools')!
    const markdown = tabs.find((tab) => tab.toolId === 'markdown-editor')!

    expect(claimPendingToolAction(json.stateKey!)).toMatchObject({ filename: 'a.json' })
    expect(claimPendingToolAction(markdown.stateKey!)).toMatchObject({ filename: 'b.md' })
  })
})
