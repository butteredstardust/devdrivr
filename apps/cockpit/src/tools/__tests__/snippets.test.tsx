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

  it('shows language shorthand as a pill (no brackets)', () => {
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
    // Language pill shows uppercased shorthand without brackets
    expect(screen.getByText('js')).toBeInTheDocument()
    expect(screen.queryByText('[JS]')).not.toBeInTheDocument()
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

describe('SnippetsManager — search highlighting', () => {
  it('renders title text normally when no search is active', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'My Snippet',
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
    expect(screen.getByText('My Snippet')).toBeInTheDocument()
  })

  it('still shows snippet in list after typing a search query', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'fetchUserData',
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
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'fetch' } })
    // Title may be split into <mark> + text nodes due to highlighting; check full text content
    const titleSpan = document.querySelector('.flex-1.truncate.text-xs.font-bold')
    expect(titleSpan?.textContent).toBe('fetchUserData')
  })
})

describe('SnippetsManager — collapsible sections', () => {
  it('shows folder section header when folders exist', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Snippet',
          content: '...',
          language: 'javascript',
          tags: [],
          folder: 'work',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    expect(screen.getByText('FOLDERS')).toBeInTheDocument()
  })

  it('collapses folder section when FOLDERS header is clicked', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Snippet',
          content: '...',
          language: 'javascript',
          tags: [],
          folder: 'work',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    const foldersBtn = screen.getByText('FOLDERS').closest('button')!
    // Should start expanded
    expect(foldersBtn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(foldersBtn)
    expect(foldersBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows tag section header when tags exist', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Snippet',
          content: '...',
          language: 'javascript',
          tags: ['api'],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    expect(screen.getByText('TAGS')).toBeInTheDocument()
  })

  it('collapses tag section when TAGS header is clicked', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Snippet',
          content: '...',
          language: 'javascript',
          tags: ['api'],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    const tagsBtn = screen.getByText('TAGS').closest('button')!
    expect(tagsBtn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(tagsBtn)
    expect(tagsBtn).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('SnippetsManager — empty meta pane shortcuts card', () => {
  it('shows shortcuts card when no snippet is selected', () => {
    renderTool(SnippetsManager)
    expect(screen.getByText('Shortcuts')).toBeInTheDocument()
  })

  it('lists key shortcut entries in the card', () => {
    renderTool(SnippetsManager)
    expect(screen.getByText('New snippet')).toBeInTheDocument()
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
  })

  it('hides shortcuts card when a snippet is selected', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'My Snippet',
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
    fireEvent.click(screen.getByText('My Snippet').closest('button')!)
    expect(screen.queryByText('Shortcuts')).not.toBeInTheDocument()
  })
})

describe('SnippetsManager — tag autocomplete', () => {
  it('shows tag suggestions when typing a matching query', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Snippet A',
          content: '...',
          language: 'javascript',
          tags: ['api', 'auth'],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: '2',
          title: 'Snippet B',
          content: '...',
          language: 'javascript',
          tags: ['utils'],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    // Select snippet B (has 'utils' tag; 'api' and 'auth' should suggest)
    fireEvent.click(screen.getByText('Snippet B').closest('button')!)
    fireEvent.change(screen.getByPlaceholderText('+ Add tag...'), { target: { value: 'a' } })
    const suggestions = screen.getByTestId('tag-suggestions')
    expect(suggestions).toBeInTheDocument()
    // Both 'api' and 'auth' should appear inside the suggestions dropdown
    expect(suggestions).toHaveTextContent('api')
    expect(suggestions).toHaveTextContent('auth')
  })

  it('does not show suggestions for tags already on the snippet', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Snippet A',
          content: '...',
          language: 'javascript',
          tags: ['api'],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    fireEvent.click(screen.getByText('Snippet A').closest('button')!)
    // 'api' is already on this snippet — should not appear in suggestions
    fireEvent.change(screen.getByPlaceholderText('+ Add tag...'), { target: { value: 'api' } })
    expect(screen.queryByTestId('tag-suggestions')).not.toBeInTheDocument()
  })

  it('hides suggestions when input is cleared', () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Snippet A',
          content: '...',
          language: 'javascript',
          tags: ['api'],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: '2',
          title: 'Snippet B',
          content: '...',
          language: 'javascript',
          tags: ['utils'],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    fireEvent.click(screen.getByText('Snippet B').closest('button')!)
    const tagInput = screen.getByPlaceholderText('+ Add tag...')
    fireEvent.change(tagInput, { target: { value: 'a' } })
    expect(screen.getByTestId('tag-suggestions')).toBeInTheDocument()
    fireEvent.change(tagInput, { target: { value: '' } })
    expect(screen.queryByTestId('tag-suggestions')).not.toBeInTheDocument()
  })
})
