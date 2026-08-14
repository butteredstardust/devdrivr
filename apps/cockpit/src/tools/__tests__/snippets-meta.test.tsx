import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import { useSnippetsStore } from '@/stores/snippets.store'
import SnippetsManager from '@/tools/snippets/SnippetsManager'

const testSnippet = {
  id: 'snippet-1',
  title: 'Test snippet',
  content: 'line1\nline2',
  language: 'javascript',
  tags: ['tag1', 'tag2'],
  folder: 'work',
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

beforeEach(() => {
  useSnippetsStore.setState({
    snippets: [testSnippet],
    initialized: true,
    saving: false,
    activeFolder: '',
  })
})

async function openDetails() {
  renderTool(SnippetsManager)
  await screen.findByDisplayValue('Test snippet')
  fireEvent.click(screen.getByRole('button', { name: 'Show snippet details' }))
  return screen.getByLabelText('Snippet details')
}

describe('SnippetsManager details inspector', () => {
  it('keeps language available in the editor and metadata behind an on-demand inspector', async () => {
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('Test snippet')

    expect(screen.getByLabelText('Snippet language')).toHaveValue('javascript')
    expect(screen.queryByLabelText('Snippet details')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show snippet details' }))
    expect(screen.getByLabelText('Snippet details')).toBeInTheDocument()
  })

  it('renders folder and tags in the details inspector', async () => {
    const details = await openDetails()

    expect(within(details).getByDisplayValue('work')).toBeInTheDocument()
    expect(within(details).getByText('tag1')).toBeInTheDocument()
    expect(within(details).getByText('tag2')).toBeInTheDocument()
  })

  it('removes a tag through a clearly labelled control', async () => {
    const update = vi.fn().mockImplementation(async (id, patch) => {
      useSnippetsStore.setState((state) => ({
        snippets: state.snippets.map((snippet) =>
          snippet.id === id ? { ...snippet, ...patch } : snippet
        ),
      }))
    })
    useSnippetsStore.setState({ update })
    const details = await openDetails()

    fireEvent.click(within(details).getByRole('button', { name: 'Remove tag1 tag' }))

    expect(update).toHaveBeenCalledWith('snippet-1', { tags: ['tag2'] })
    expect(within(details).queryByText('tag1')).not.toBeInTheDocument()
  })

  it('shows readable line, character, and byte statistics', async () => {
    const details = await openDetails()

    expect(within(details).getByText('Lines')).toBeInTheDocument()
    expect(within(details).getByText('Characters')).toBeInTheDocument()
    expect(within(details).getByText('Bytes')).toBeInTheDocument()
    expect(within(details).getByText('2')).toBeInTheDocument()
    expect(within(details).getAllByText('11')).toHaveLength(2)
  })

  it('updates statistics when snippet content changes', async () => {
    const details = await openDetails()

    act(() => {
      useSnippetsStore.setState((state) => ({
        snippets: state.snippets.map((snippet) =>
          snippet.id === 'snippet-1' ? { ...snippet, content: 'new content' } : snippet
        ),
      }))
    })

    expect(within(details).getByText('1')).toBeInTheDocument()
    expect(within(details).getAllByText('11')).toHaveLength(2)
  })
})
