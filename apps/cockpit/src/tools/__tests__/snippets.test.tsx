import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import { useSnippetsStore } from '@/stores/snippets.store'
import SnippetsManager from '../snippets/SnippetsManager'

describe('SnippetsManager', () => {
  it('renders search input and new button', () => {
    renderTool(SnippetsManager)
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
    expect(screen.getByText('+')).toBeInTheDocument()
  })

  it('shows empty state when no snippets', () => {
    renderTool(SnippetsManager)
    expect(screen.getByText(/no snippets yet/i)).toBeInTheDocument()
  })

  it('shows snippet when store has data', () => {
    useSnippetsStore.setState({
      snippets: [
        { id: '1', title: 'Test Snippet', content: 'console.log("hi")', language: 'javascript', tags: ['test'], createdAt: Date.now(), updatedAt: Date.now() },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    expect(screen.getByText('Test Snippet')).toBeInTheDocument()
  })

  it('uses ASCII markers for favorites in the list', () => {
    useSnippetsStore.setState({
      snippets: [
        { id: '1', title: 'Fav Snippet', content: '...', language: 'javascript', tags: ['⭐'], createdAt: Date.now(), updatedAt: Date.now() },
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
        { id: '1', title: 'JS Snippet', content: '...', language: 'javascript', tags: [], createdAt: Date.now(), updatedAt: Date.now() },
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
        { id: '1', title: 'Snippet 1', content: '...', language: 'javascript', tags: [], createdAt: Date.now(), updatedAt: Date.now() },
        { id: '2', title: 'Snippet 2', content: '...', language: 'typescript', tags: [], createdAt: Date.now(), updatedAt: Date.now() },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    
    const item1 = screen.getByText('Snippet 1').closest('button')
    fireEvent.click(item1!)
    
    expect(item1).toHaveClass('bg-[var(--color-accent)]')
    expect(item1).toHaveClass('text-[var(--color-bg)]')
  })

  it('renders export and import buttons', () => {
    renderTool(SnippetsManager)
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Import')).toBeInTheDocument()
  })
})
