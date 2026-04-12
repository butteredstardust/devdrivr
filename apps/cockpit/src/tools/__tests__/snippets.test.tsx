import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import { useSnippetsStore } from '@/stores/snippets.store'
import SnippetsManager from '../snippets/SnippetsManager'

describe('SnippetsManager', () => {
  it('renders search input and new button', () => {
    renderTool(SnippetsManager)
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
    expect(screen.getByText('[F5: NEW]')).toBeInTheDocument()
  })

  it('shows empty state when no snippets', () => {
    renderTool(SnippetsManager)
    expect(screen.getByText(/no snippets yet/i)).toBeInTheDocument()
  })

  it('shows snippet when store has data', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Test Snippet',
          content: 'console.log("hi")',
          language: 'javascript',
          tags: ['test'],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    expect(screen.getByText('Test Snippet')).toBeInTheDocument()
  })

  it('uses ASCII markers for favorites in the list', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Fav Snippet',
          content: '...',
          language: 'javascript',
          tags: ['⭐'],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    expect(screen.getByText(/\[\*\]/)).toBeInTheDocument()
    expect(screen.queryByText('⭐')).not.toBeInTheDocument()
  })

  it('shows uppercased language shorthand in brackets', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'JS Snippet',
          content: '...',
          language: 'javascript',
          tags: [],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    // javascript shorthand is 'js', should be '[JS]'
    expect(screen.getByText('[JS]')).toBeInTheDocument()
  })

  it('applies high-contrast active state to selected snippet', async () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Snippet 1',
          content: '...',
          language: 'javascript',
          tags: [],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: '2',
          title: 'Snippet 2',
          content: '...',
          language: 'typescript',
          tags: [],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)

    const item1 = screen.getByText('Snippet 1').closest('button')
    fireEvent.click(item1!)

    expect(item1).toHaveClass('bg-[var(--color-accent)]')
    expect(item1).toHaveClass('text-[var(--color-bg)]')
  })

  it('shows the correct editor header with title and extension', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'db_init',
          content: 'SELECT 1;',
          language: 'sql',
          tags: [],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)

    // Select the snippet
    const item = screen.getByText('db_init').closest('button')
    fireEvent.click(item!)

    expect(screen.getByText(/\[ 02-EDIT: db_init.sql \]/)).toBeInTheDocument()
  })

  it('falls back to txt for unknown languages in the header', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'test',
          content: '...',
          language: 'unknown',
          tags: [],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)

    // Select the snippet
    const item = screen.getByText('test').closest('button')
    fireEvent.click(item!)

    expect(screen.getByText(/\[ 02-EDIT: test.txt \]/)).toBeInTheDocument()
  })

  it('renders export and import buttons', () => {
    renderTool(SnippetsManager)
    expect(screen.getByText('[F9: EXP]')).toBeInTheDocument()
    expect(screen.getByText('[F10: IMP]')).toBeInTheDocument()
  })
})
