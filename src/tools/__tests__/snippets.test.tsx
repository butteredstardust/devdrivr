import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { installNarrowToolbarLayout, renderTool } from '@/tools/__tests__/test-utils'
import { exportFile, openFileDialog } from '@/lib/file-io'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useUiStore } from '@/stores/ui.store'
import { useFoldersStore } from '@/stores/folders.store'
import type { ResourceFolder, Snippet, SnippetFragment } from '@/types/models'
import SnippetsManager, {
  hasRegisteredDocumentFormatter,
  runRegisteredDocumentFormatter,
} from '@/tools/snippets/SnippetsManager'
import { ToolInstanceContext } from '@/app/tool-instance'
import { sendToTool } from '@/lib/tool-handoff'

vi.mock('@/lib/file-io', async () => {
  const actual = await vi.importActual<typeof import('@/lib/file-io')>('@/lib/file-io')
  return {
    ...actual,
    exportFile: vi.fn(),
    openFileDialog: vi.fn(),
  }
})

vi.mock('@/lib/tool-handoff', () => ({ sendToTool: vi.fn() }))

const realActions = {
  add: useSnippetsStore.getState().add,
  update: useSnippetsStore.getState().update,
  remove: useSnippetsStore.getState().remove,
}

function snippet(overrides: Partial<Snippet> & Pick<Snippet, 'id' | 'title'>): Snippet {
  return {
    content: 'console.log("hello")',
    language: 'javascript',
    tags: [],
    favorite: false,
    folder: '',
    folderId: overrides.folder ? `folder-${overrides.folder}` : 'snippets-inbox',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

function fragment(
  id: string,
  name: string,
  content: string,
  language: string,
  sortOrder: number
): SnippetFragment {
  return { id, name, content, language, sortOrder, createdAt: 1, updatedAt: 1 }
}

const snippetFolders: ResourceFolder[] = ['Inbox', 'work', 'personal'].map((name, index) => ({
  id: index === 0 ? 'snippets-inbox' : `folder-${name}`,
  name,
  parentId: null,
  kind: 'snippets',
  sortOrder: index,
  createdAt: 0,
  updatedAt: 0,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(exportFile).mockResolvedValue(null)
  vi.mocked(openFileDialog).mockResolvedValue(null)
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    },
  })
  useSnippetsStore.setState({
    snippets: [],
    trashedSnippets: [],
    initialized: true,
    saving: false,
    activeFolder: '',
    ...realActions,
    restore: vi.fn().mockResolvedValue(undefined),
    permanentlyDelete: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    importBatch: vi.fn().mockResolvedValue(undefined),
  })
  useFoldersStore.setState({
    folders: snippetFolders,
    trashedFolders: [],
    initialized: true,
    create: vi.fn().mockImplementation(async ({ name, kind, parentId = null }) => ({
      id: `folder-${name}`,
      name,
      kind,
      parentId,
      sortOrder: 100,
      createdAt: 0,
      updatedAt: 0,
    })),
    update: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    trash: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    permanentlyDelete: vi.fn().mockResolvedValue(undefined),
    emptyTrash: vi.fn().mockResolvedValue(undefined),
  })
  useUiStore.setState({ lastAction: null })
})

afterEach(() => {
  useSnippetsStore.setState(realActions)
})

describe('SnippetsManager — library experience', () => {
  it('opens durable Trash and restores a snippet', async () => {
    const restore = vi.fn().mockResolvedValue(undefined)
    useSnippetsStore.setState({
      trashedSnippets: [snippet({ id: 'trashed-snippet', title: 'Archived helper', deletedAt: 2 })],
      restore,
    })
    renderTool(SnippetsManager)

    fireEvent.click(screen.getByRole('button', { name: 'Open Snippets Trash, 1 item' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore Archived helper' }))

    await waitFor(() => expect(restore).toHaveBeenCalledWith('trashed-snippet'))
  })

  it('presents the primary library actions with accessible labels', () => {
    renderTool(SnippetsManager)

    expect(screen.getByRole('heading', { name: 'Snippets' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search snippets' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import snippets from JSON' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export snippets as JSON' })).toBeDisabled()
  })

  it('offers useful first-run actions when the library is empty', () => {
    renderTool(SnippetsManager)

    expect(screen.getByText('No snippets yet')).toBeInTheDocument()
    expect(screen.getByText('Build your snippet library')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New snippet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import JSON' })).toBeInTheDocument()
  })

  it('automatically opens the most recently edited snippet', async () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({ id: 'older', title: 'Older', updatedAt: 1 }),
        snippet({ id: 'newer', title: 'Newer', updatedAt: 2 }),
      ],
    })

    renderTool(SnippetsManager)

    await waitFor(() => expect(screen.getByLabelText('Snippet title')).toHaveValue('Newer'))
    expect(screen.getByRole('option', { name: /Newer/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('searches title, language, folder, tags, and content', () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({ id: 'api', title: 'Fetch user', language: 'typescript', folder: 'work' }),
        snippet({ id: 'sql', title: 'Schema', language: 'sql', tags: ['database'] }),
      ],
    })
    renderTool(SnippetsManager)
    const search = screen.getByRole('searchbox', { name: 'Search snippets' })

    fireEvent.change(search, { target: { value: 'typescript' } })
    expect(screen.getByRole('option', { name: /Fetch user/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Schema/ })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'database' } })
    expect(screen.getByRole('option', { name: /Schema/ })).toBeInTheDocument()
  })

  it('searches descriptions and every fragment, not only the primary fragment', () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({
          id: 'multi',
          title: 'Component bundle',
          description: 'Keyboard interaction details',
          fragments: [
            fragment('primary', 'view.tsx', 'export function View() {}', 'typescript', 0),
            fragment('secondary', 'theme.css', '.focus-ring {}', 'css', 1),
          ],
        }),
        snippet({ id: 'other', title: 'Other' }),
      ],
    })
    renderTool(SnippetsManager)
    const search = screen.getByRole('searchbox', { name: 'Search snippets' })

    fireEvent.change(search, { target: { value: 'focus-ring' } })
    expect(screen.getByRole('option', { name: /Component bundle/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Other/ })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'Keyboard interaction' } })
    expect(screen.getByRole('option', { name: /Component bundle/ })).toBeInTheDocument()
  })

  it('combines favorite, folder, and tag filters and clears them together', () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({ id: 'one', title: 'Favorite API', folder: 'work', tags: ['api', '⭐'] }),
        snippet({ id: 'two', title: 'Other work', folder: 'work', tags: ['utils'] }),
        snippet({ id: 'three', title: 'Personal API', folder: 'personal', tags: ['api', '⭐'] }),
      ],
    })
    renderTool(SnippetsManager)

    fireEvent.click(screen.getByRole('button', { name: 'work, 2 items' }))
    fireEvent.change(screen.getByLabelText('Filter by tag'), { target: { value: 'api' } })
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }))

    expect(screen.getByRole('option', { name: /Favorite API/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Other work/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Personal API/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(
      within(screen.getByRole('listbox', { name: 'Snippets' })).getAllByRole('option')
    ).toHaveLength(3)
  })

  it('sorts the visible library by title', () => {
    useSnippetsStore.setState({
      snippets: [snippet({ id: 'z', title: 'Zulu' }), snippet({ id: 'a', title: 'Alpha' })],
    })
    renderTool(SnippetsManager)

    fireEvent.change(screen.getByLabelText('Sort snippets'), { target: { value: 'title' } })

    expect(
      within(screen.getByRole('listbox', { name: 'Snippets' }))
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([expect.stringContaining('Alpha'), expect.stringContaining('Zulu')])
  })

  it('supports arrow-key navigation through the snippet list', async () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({ id: 'one', title: 'One', updatedAt: 2 }),
        snippet({ id: 'two', title: 'Two', updatedAt: 1 }),
      ],
    })
    renderTool(SnippetsManager)
    const first = screen.getByRole('option', { name: /One/ })

    await waitFor(() => expect(first).toHaveAttribute('aria-selected', 'true'))
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })

    expect(screen.getByRole('option', { name: /Two/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Snippet title')).toHaveValue('Two')
  })
})

describe('SnippetsManager — editor and details', () => {
  beforeEach(() => {
    useSnippetsStore.setState({
      snippets: [
        snippet({
          id: 'snippet-1',
          title: 'API helper',
          content: 'const value = 1\nconsole.log(value)',
          language: 'typescript',
          folder: 'work',
          tags: ['api'],
        }),
      ],
    })
  })

  it('keeps editing focused and reveals metadata on demand', async () => {
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('API helper')

    expect(screen.queryByLabelText('Snippet details')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show snippet details' }))

    const details = screen.getByLabelText('Snippet details')
    expect(within(details).getByRole('combobox', { name: 'Snippet folder' })).toHaveValue(
      'folder-work'
    )
    expect(within(details).getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide snippet details' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('edits, reorders, duplicates, and guardedly deletes fragments with accessible tabs', async () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({
          id: 'snippet-1',
          title: 'API helper',
          description: 'Use both fragments together.',
          fragments: [
            fragment('client', 'client.ts', 'fetch(url)', 'typescript', 0),
            fragment('styles', 'styles.css', '.root {}', 'css', 1),
          ],
        }),
      ],
    })
    renderTool(SnippetsManager)

    const clientTab = await screen.findByRole('tab', { name: 'client.ts' })
    const stylesTab = screen.getByRole('tab', { name: 'styles.css' })
    expect(clientTab).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(stylesTab)
    expect(screen.getByTestId('monaco-editor')).toHaveValue('.root {}')
    expect(screen.getByLabelText('Snippet language')).toHaveValue('css')

    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: '.card {}' } })
    await waitFor(() =>
      expect(
        useSnippetsStore
          .getState()
          .snippets[0]?.fragments?.find((candidate) => candidate.id === 'styles')?.content
      ).toBe('.card {}')
    )

    fireEvent.click(screen.getByRole('button', { name: 'Move fragment left' }))
    await waitFor(() =>
      expect(useSnippetsStore.getState().snippets[0]?.fragments?.[0]?.id).toBe('styles')
    )

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate fragment' }))
    await screen.findByRole('tab', { name: 'styles.css copy' })
    expect(screen.getAllByRole('tab')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Delete fragment' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete fragment?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete fragment' }))
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByLabelText('Snippet description')).toHaveValue('Use both fragments together.')
  })

  it('uses a correctly wired tag combobox and preserves focus on suggestion selection', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    useSnippetsStore.setState({
      snippets: [
        snippet({ id: 'snippet-1', title: 'API helper', tags: [] }),
        snippet({ id: 'snippet-2', title: 'Tagged', tags: ['api', 'auth'] }),
      ],
      update,
    })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('API helper')
    fireEvent.click(screen.getByRole('button', { name: 'Show snippet details' }))
    const input = screen.getByRole('combobox', { name: 'Add tag' })

    expect(input).not.toHaveAttribute('aria-controls')
    fireEvent.change(input, { target: { value: 'a' } })
    const suggestionsId = input.getAttribute('aria-controls')
    expect(suggestionsId).toBeTruthy()
    expect(document.getElementById(suggestionsId!)).toHaveAttribute('role', 'listbox')
    fireEvent.mouseDown(screen.getByRole('option', { name: 'api' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith('snippet-1', { tags: ['api'] }))
    expect(document.activeElement).toBe(input)
  })

  it('generates distinct tag relationship ids for each mounted instance', async () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({ id: 'snippet-1', title: 'API helper', updatedAt: 2 }),
        snippet({ id: 'snippet-2', title: 'Tagged', tags: ['api'], updatedAt: 1 }),
      ],
    })
    render(
      <>
        <SnippetsManager />
        <SnippetsManager />
      </>
    )
    await screen.findAllByDisplayValue('API helper')
    for (const button of screen.getAllByRole('button', { name: 'Show snippet details' })) {
      fireEvent.click(button)
    }
    const snippetOptions = screen.getAllByRole('option', { name: /API helper/ })
    const tagInputs = screen.getAllByRole('combobox', { name: 'Add tag' })
    fireEvent.change(tagInputs[0]!, { target: { value: 'a' } })
    fireEvent.change(tagInputs[1]!, { target: { value: 'a' } })

    const suggestionIds = tagInputs.map((input) => input.getAttribute('aria-controls'))
    expect(new Set(snippetOptions.map((option) => option.id)).size).toBe(2)
    expect(new Set(suggestionIds).size).toBe(2)
    for (const id of suggestionIds) {
      expect(id).toBeTruthy()
      expect(document.getElementById(id!)).not.toBeNull()
    }
  })

  it('lets only the active instance handle global shortcuts', async () => {
    render(
      <>
        <ToolInstanceContext.Provider
          value={{ tabId: 'left', toolId: 'snippets', stateKey: 'snippets', isActive: false }}
        >
          <SnippetsManager />
        </ToolInstanceContext.Provider>
        <ToolInstanceContext.Provider
          value={{
            tabId: 'right',
            toolId: 'snippets',
            stateKey: 'snippets#right',
            isActive: true,
          }}
        >
          <SnippetsManager />
        </ToolInstanceContext.Provider>
      </>
    )
    const searches = screen.getAllByRole('searchbox', { name: 'Search snippets' })

    fireEvent.keyDown(window, { key: 'f', metaKey: true })

    await waitFor(() => expect(document.activeElement).toBe(searches[1]))
  })

  it('toggles favorites through the editor toolbar', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    useSnippetsStore.setState({ update })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('API helper')

    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }))

    expect(update).toHaveBeenCalledWith('snippet-1', { tags: ['api'], favorite: true })
  })

  it('keeps Trash reachable through the toolbar overflow menu', async () => {
    const restoreLayout = installNarrowToolbarLayout()
    try {
      renderTool(SnippetsManager)
      await screen.findByDisplayValue('API helper')

      const toolbar = screen.getByRole('toolbar', { name: 'Snippet actions' })
      fireEvent.click(within(toolbar).getByRole('button', { name: 'More actions' }))
      const menu = screen.getByRole('dialog', { name: 'More actions' })
      fireEvent.click(within(menu).getByRole('button', { name: 'Move snippet to Trash' }))

      expect(screen.getByRole('dialog', { name: 'Move snippet to Trash?' })).toBeInTheDocument()
    } finally {
      restoreLayout()
    }
  })

  it('uses an explicit, focus-safe confirmation dialog for deletion', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    useSnippetsStore.setState({ remove })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('API helper')

    fireEvent.click(screen.getByRole('button', { name: 'Move snippet to Trash' }))

    const dialog = screen.getByRole('dialog', { name: 'Move snippet to Trash?' })
    expect(within(dialog).getByText(/restored from Trash/)).toBeInTheDocument()
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }))

    await waitFor(() => expect(remove).toHaveBeenCalledWith('snippet-1'))
  })

  it('keeps the dialog open and reports a failed delete', async () => {
    useSnippetsStore.setState({ remove: vi.fn().mockRejectedValue(new Error('locked')) })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('API helper')
    fireEvent.click(screen.getByRole('button', { name: 'Move snippet to Trash' }))
    const dialog = screen.getByRole('dialog', { name: 'Move snippet to Trash?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to Trash' }))

    await waitFor(() =>
      expect(useUiStore.getState().lastAction?.message).toBe('Failed to move snippet to Trash')
    )
    expect(screen.getByRole('dialog', { name: 'Move snippet to Trash?' })).toBeInTheDocument()
  })

  it('surfaces duplicate failures without an unhandled rejection', async () => {
    useSnippetsStore.setState({ add: vi.fn().mockRejectedValue(new Error('locked')) })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('API helper')

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate snippet' }))

    await waitFor(() => expect(useUiStore.getState().lastAction?.message).toBe('Duplicate failed'))
  })
})

describe('SnippetsManager — native import and export', () => {
  it('exports the complete library to a JSON file', async () => {
    const items = [snippet({ id: 'one', title: 'One' })]
    useSnippetsStore.setState({ snippets: items })
    vi.mocked(exportFile).mockResolvedValue('/tmp/snippets-backup.json')
    renderTool(SnippetsManager)

    fireEvent.click(screen.getByRole('button', { name: 'Export snippets as JSON' }))

    await waitFor(() =>
      expect(exportFile).toHaveBeenCalledWith(
        JSON.stringify({ version: 3, folders: snippetFolders, snippets: items }, null, 2),
        'snippets-backup.json'
      )
    )
    expect(useUiStore.getState().lastAction?.message).toBe('Exported 1 snippet')
  })

  it('imports valid snippets from a JSON file and preserves metadata', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    useSnippetsStore.setState({ refresh })
    useFoldersStore.setState({ refresh })
    vi.mocked(openFileDialog).mockResolvedValue({
      path: '/tmp/snippets.json',
      filename: 'snippets.json',
      content: JSON.stringify([
        {
          title: 'Imported',
          content: 'SELECT 1;',
          language: 'sql',
          tags: ['database'],
          folder: 'work',
        },
      ]),
    })
    renderTool(SnippetsManager)

    fireEvent.click(screen.getByRole('button', { name: 'Import snippets from JSON' }))

    await waitFor(() =>
      expect(useSnippetsStore.getState().importBatch).toHaveBeenCalledWith(
        [],
        [
          expect.objectContaining({
            title: 'Imported',
            content: 'SELECT 1;',
            language: 'sql',
            tags: ['database'],
            folderId: 'folder-work',
            fragments: [
              expect.objectContaining({ name: 'main', content: 'SELECT 1;', language: 'sql' }),
            ],
          }),
        ]
      )
    )
    expect(useUiStore.getState().lastAction?.message).toBe('Imported 1 snippet')
  })

  it('round-trips version 3 descriptions and ordered fragments', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    useSnippetsStore.setState({ refresh })
    useFoldersStore.setState({ refresh })
    vi.mocked(openFileDialog).mockResolvedValue({
      path: '/tmp/snippets-v3.json',
      filename: 'snippets-v3.json',
      content: JSON.stringify({
        version: 3,
        folders: [],
        snippets: [
          {
            title: 'Bundle',
            content: 'fetch(url)',
            language: 'typescript',
            description: 'Use these together.',
            fragments: [
              { name: 'client.ts', content: 'fetch(url)', language: 'typescript' },
              { name: 'styles.css', content: '.root {}', language: 'css' },
            ],
            tags: [],
            folder: '',
          },
        ],
      }),
    })
    renderTool(SnippetsManager)

    fireEvent.click(screen.getByRole('button', { name: 'Import snippets from JSON' }))

    await waitFor(() =>
      expect(useSnippetsStore.getState().importBatch).toHaveBeenCalledWith(
        [],
        [
          expect.objectContaining({
            title: 'Bundle',
            description: 'Use these together.',
            fragments: [
              expect.objectContaining({
                name: 'client.ts',
                content: 'fetch(url)',
                language: 'typescript',
              }),
              expect.objectContaining({ name: 'styles.css', content: '.root {}', language: 'css' }),
            ],
          }),
        ]
      )
    )
  })

  it('rejects malformed backups with an actionable error', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      path: '/tmp/bad.json',
      filename: 'bad.json',
      content: '{}',
    })
    renderTool(SnippetsManager)

    fireEvent.click(screen.getByRole('button', { name: 'Import snippets from JSON' }))

    await waitFor(() =>
      expect(useUiStore.getState().lastAction?.message).toMatch(/choose a valid snippets JSON file/)
    )
  })

  it('downloads the selected snippet with a sanitized language extension', async () => {
    useSnippetsStore.setState({
      snippets: [snippet({ id: 'one', title: 'my snippet', language: 'javascript' })],
    })
    vi.mocked(exportFile).mockResolvedValue('/tmp/my_snippet.js')
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('my snippet')

    fireEvent.click(screen.getByRole('button', { name: 'Save snippet as file' }))

    await waitFor(() =>
      expect(exportFile).toHaveBeenCalledWith('console.log("hello")', 'my_snippet.js')
    )
  })
})

describe('SnippetsManager — formatting and contextual previews', () => {
  it('uses a registered Monaco document formatter when one is available', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const editor = {
      getAction: vi.fn(() => ({ isSupported: () => true, run })),
    }
    expect(hasRegisteredDocumentFormatter(editor as never)).toBe(true)
    await expect(runRegisteredDocumentFormatter(editor as never)).resolves.toBe(true)
    expect(run).toHaveBeenCalledOnce()
  })

  it('falls back to the existing formatter worker and updates only the active fragment', async () => {
    const update = vi.fn().mockImplementation(realActions.update)
    useSnippetsStore.setState({
      snippets: [
        snippet({
          id: 'format-me',
          title: 'Formatter',
          content: 'const value={ok:true}',
          language: 'javascript',
          fragments: [
            fragment('main', 'main.js', 'const value={ok:true}', 'javascript', 0),
            fragment('other', 'other.txt', 'leave me', 'text', 1),
          ],
        }),
      ],
      update,
    })
    renderTool(SnippetsManager)
    const formatButton = await screen.findByRole('button', { name: 'Format snippet fragment' })
    await waitFor(() => expect(formatButton).toBeEnabled())
    fireEvent.click(formatButton)

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        'format-me',
        expect.objectContaining({
          fragments: [
            expect.objectContaining({ id: 'main', content: 'const value = { ok: true }\n' }),
            expect.objectContaining({ id: 'other', content: 'leave me' }),
          ],
        })
      )
    )
    expect(useUiStore.getState().lastAction?.message).toBe('Formatted main.js')
  })

  it('does not overwrite edits made while fallback formatting is in flight', async () => {
    useSnippetsStore.setState({
      snippets: [snippet({ id: 'typing', title: 'Typing', content: 'const value={ok:true}' })],
    })
    renderTool(SnippetsManager)
    const formatButton = await screen.findByRole('button', { name: 'Format snippet fragment' })
    await waitFor(() => expect(formatButton).toBeEnabled())
    fireEvent.click(formatButton)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: 'const userTyping = true' },
    })

    await waitFor(() =>
      expect(useUiStore.getState().lastAction?.message).toBe(
        'Fragment changed while formatting — format again'
      )
    )
    expect(useSnippetsStore.getState().snippets[0]?.content).toBe('const userTyping = true')
  })

  it('shows formatter syntax errors without changing the fragment', async () => {
    useSnippetsStore.setState({
      snippets: [snippet({ id: 'broken-js', title: 'Broken JS', content: 'const =' })],
    })
    renderTool(SnippetsManager)
    const formatButton = await screen.findByRole('button', { name: 'Format snippet fragment' })
    await waitFor(() => expect(formatButton).toBeEnabled())
    fireEvent.click(formatButton)

    expect(await screen.findByRole('alert')).toHaveTextContent(/unexpected token|parse/i)
    expect(useSnippetsStore.getState().snippets[0]?.content).toBe('const =')
  })

  it('explains unsupported formatting and previews', async () => {
    useSnippetsStore.setState({
      snippets: [snippet({ id: 'python', title: 'Python', language: 'python' })],
    })
    renderTool(SnippetsManager)
    const formatButton = await screen.findByRole('button', { name: 'Format snippet fragment' })
    expect(formatButton).toBeDisabled()
    expect(formatButton).toHaveAttribute('title', 'No formatter is available for python')
    const previewButton = screen.getByRole('button', { name: 'Preview HTML and CSS fragments' })
    expect(previewButton).toBeDisabled()
    expect(previewButton).toHaveAttribute(
      'title',
      'Preview supports JSON or snippets containing an HTML fragment'
    )
  })

  it('opens a composed HTML/CSS preview without changing fragment selection', async () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({
          id: 'web',
          title: 'Card',
          content: '<article>Card</article>',
          language: 'html',
          fragments: [
            fragment('html', 'card.html', '<article>Card</article>', 'html', 0),
            fragment('css', 'card.css', 'article { display: grid }', 'css', 1),
          ],
        }),
      ],
    })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('Card')
    const activeTab = screen.getByRole('tab', { name: 'card.html' })
    expect(activeTab).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Preview HTML and CSS fragments' }))

    const frame = await screen.findByTitle('Rendered snippet preview')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame.getAttribute('srcdoc')).toContain('<article>Card</article>')
    expect(frame.getAttribute('srcdoc')).toContain('article { display: grid }')
    expect(activeTab).toHaveAttribute('aria-selected', 'true')
  })

  it('hands valid JSON to the existing tree view and rejects invalid JSON locally', async () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({
          id: 'json',
          title: 'Payload',
          content: 'notes',
          language: 'text',
          fragments: [
            fragment('readme', 'readme.txt', 'notes', 'text', 0),
            fragment('payload', 'payload.json', '{"ok":true}', 'json', 1),
          ],
        }),
      ],
    })
    const view = renderTool(SnippetsManager)
    fireEvent.click(await screen.findByRole('tab', { name: 'payload.json' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Preview JSON fragment' }))
    expect(sendToTool).toHaveBeenCalledWith(
      'json-tools',
      { input: '{"ok":true}', view: 'tree' },
      // The fragment is a whole document, so JSON Tools must not lose what it already holds.
      { documentKeys: ['input'] }
    )
    expect(screen.getByRole('tab', { name: 'payload.json' })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    view.unmount()
    vi.mocked(sendToTool).mockClear()
    useSnippetsStore.setState({
      snippets: [snippet({ id: 'bad-json', title: 'Broken', content: '{', language: 'json' })],
    })
    renderTool(SnippetsManager)
    fireEvent.click(await screen.findByRole('button', { name: 'Preview JSON fragment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('JSON preview unavailable')
    expect(sendToTool).not.toHaveBeenCalled()
  })

  it('exposes keyboard commands for formatting and web preview', async () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({
          id: 'shortcuts',
          title: 'Shortcuts',
          content: '<main>Preview</main>',
          language: 'html',
        }),
      ],
    })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('Shortcuts')

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true, shiftKey: true })
    expect(await screen.findByTitle('Rendered snippet preview')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close snippet preview' }))

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true, shiftKey: true })
    await waitFor(() =>
      expect(useUiStore.getState().lastAction?.message).toMatch(/Formatted|already formatted/)
    )
  })
})

describe('SnippetsManager — keyboard workflow', () => {
  it('focuses search with the platform search shortcut', () => {
    renderTool(SnippetsManager)

    fireEvent.keyDown(window, { key: 'f', metaKey: true })

    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search snippets' }))
  })

  it('creates a snippet with the new-snippet shortcut', async () => {
    const created = snippet({ id: 'new', title: 'Untitled snippet' })
    const add = vi.fn().mockImplementation(async () => {
      useSnippetsStore.setState({ snippets: [created] })
      return created
    })
    useSnippetsStore.setState({ add })
    renderTool(SnippetsManager)

    fireEvent.keyDown(window, { key: 'n', metaKey: true })

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(
        'Untitled snippet',
        '',
        'javascript',
        [],
        '',
        false,
        'snippets-inbox'
      )
    )
    const title = await screen.findByLabelText('Snippet title')
    expect(document.activeElement).toBe(title)
    expect(title).toHaveProperty('selectionStart', 0)
    expect(title).toHaveProperty('selectionEnd', 'Untitled snippet'.length)
  })
})
