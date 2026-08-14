import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import { exportFile, openFileDialog } from '@/lib/file-io'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useUiStore } from '@/stores/ui.store'
import type { Snippet } from '@/types/models'
import SnippetsManager from '@/tools/snippets/SnippetsManager'

vi.mock('@/lib/file-io', async () => {
  const actual = await vi.importActual<typeof import('@/lib/file-io')>('@/lib/file-io')
  return {
    ...actual,
    exportFile: vi.fn(),
    openFileDialog: vi.fn(),
  }
})

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
    folder: '',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

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
    initialized: true,
    saving: false,
    activeFolder: '',
    ...realActions,
  })
  useUiStore.setState({ lastAction: null })
})

afterEach(() => {
  useSnippetsStore.setState(realActions)
})

describe('SnippetsManager — library experience', () => {
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

  it('combines favorite, folder, and tag filters and clears them together', () => {
    useSnippetsStore.setState({
      snippets: [
        snippet({ id: 'one', title: 'Favorite API', folder: 'work', tags: ['api', '⭐'] }),
        snippet({ id: 'two', title: 'Other work', folder: 'work', tags: ['utils'] }),
        snippet({ id: 'three', title: 'Personal API', folder: 'personal', tags: ['api', '⭐'] }),
      ],
    })
    renderTool(SnippetsManager)

    fireEvent.change(screen.getByLabelText('Filter by folder'), { target: { value: 'work' } })
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
    expect(within(details).getByDisplayValue('work')).toBeInTheDocument()
    expect(within(details).getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide snippet details' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
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
    expect(input).toHaveAttribute('aria-controls', 'tag-suggestions')
    fireEvent.mouseDown(screen.getByRole('option', { name: 'api' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith('snippet-1', { tags: ['api'] }))
    expect(document.activeElement).toBe(input)
  })

  it('toggles favorites through the editor toolbar', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    useSnippetsStore.setState({ update })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('API helper')

    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }))

    expect(update).toHaveBeenCalledWith('snippet-1', { tags: ['api', '⭐'] })
  })

  it('uses an explicit, focus-safe confirmation dialog for deletion', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    useSnippetsStore.setState({ remove })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('API helper')

    fireEvent.click(screen.getByRole('button', { name: 'Delete snippet' }))

    const dialog = screen.getByRole('dialog', { name: 'Delete snippet?' })
    expect(within(dialog).getByText(/permanently removed/)).toBeInTheDocument()
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete snippet' }))

    await waitFor(() => expect(remove).toHaveBeenCalledWith('snippet-1'))
  })

  it('keeps the dialog open and reports a failed delete', async () => {
    useSnippetsStore.setState({ remove: vi.fn().mockRejectedValue(new Error('locked')) })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('API helper')
    fireEvent.click(screen.getByRole('button', { name: 'Delete snippet' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete snippet?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete snippet' }))

    await waitFor(() => expect(useUiStore.getState().lastAction?.message).toBe('Delete failed'))
    expect(screen.getByRole('dialog', { name: 'Delete snippet?' })).toBeInTheDocument()
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
        JSON.stringify(items, null, 2),
        'snippets-backup.json'
      )
    )
    expect(useUiStore.getState().lastAction?.message).toBe('Exported 1 snippet')
  })

  it('imports valid snippets from a JSON file and preserves metadata', async () => {
    const add = vi.fn().mockResolvedValue(snippet({ id: 'created', title: 'Imported' }))
    useSnippetsStore.setState({ add })
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
      expect(add).toHaveBeenCalledWith('Imported', 'SELECT 1;', 'sql', ['database'], 'work')
    )
    expect(useUiStore.getState().lastAction?.message).toBe('Imported 1 snippets')
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
      expect(add).toHaveBeenCalledWith('Untitled snippet', '', 'javascript', [], '')
    )
    const title = await screen.findByLabelText('Snippet title')
    expect(document.activeElement).toBe(title)
    expect(title).toHaveProperty('selectionStart', 0)
    expect(title).toHaveProperty('selectionEnd', 'Untitled snippet'.length)
  })
})
