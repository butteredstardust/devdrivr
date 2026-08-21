import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import { useSnippetsStore } from '@/stores/snippets.store'
import SnippetsManager from '@/tools/snippets/SnippetsManager'

const favoriteSnippet = {
  id: 'favorite',
  title: 'Favorite snippet',
  content: 'const favorite = true',
  language: 'javascript',
  tags: ['⭐'],
  favorite: true,
  folder: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

beforeEach(() => {
  useSnippetsStore.setState({
    snippets: [],
    initialized: true,
    saving: false,
    activeFolder: '',
  })
})

describe('SnippetsManager editor toolbar', () => {
  it('exposes discoverable actions for the selected snippet', async () => {
    useSnippetsStore.setState({ snippets: [favoriteSnippet] })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('Favorite snippet')

    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy snippet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duplicate snippet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save snippet as file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show snippet details' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete snippet' })).toBeInTheDocument()
  })

  it('communicates favorite state in both the list and editor', async () => {
    useSnippetsStore.setState({ snippets: [favoriteSnippet] })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('Favorite snippet')

    expect(screen.getByLabelText('Favorite')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument()
  })

  it('announces active saves without a legacy command bar', async () => {
    useSnippetsStore.setState({ snippets: [favoriteSnippet] })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('Favorite snippet')

    act(() => useSnippetsStore.setState({ saving: true }))
    expect(screen.getByText('Saving changes…')).toBeInTheDocument()

    act(() => useSnippetsStore.setState({ saving: false }))
    expect(screen.queryByText('Saving changes…')).not.toBeInTheDocument()
  })

  it('opens explicit delete confirmation from the retained F8 shortcut', async () => {
    useSnippetsStore.setState({ snippets: [favoriteSnippet] })
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('Favorite snippet')

    fireEvent.keyDown(window, { key: 'F8' })

    expect(screen.getByRole('dialog', { name: 'Delete snippet?' })).toBeInTheDocument()
  })
})
