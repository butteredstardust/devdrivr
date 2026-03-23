import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
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

  it('renders export and import buttons', () => {
    renderTool(SnippetsManager)
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Import')).toBeInTheDocument()
  })
})
