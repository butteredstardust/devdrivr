import { describe, expect, it, afterEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { renderTool } from './test-utils'
import { useSnippetsStore } from '@/stores/snippets.store'
import SnippetsManager from '../snippets/SnippetsManager'

describe('SnippetsManager Command Bar', () => {
  afterEach(() => {
    act(() => {
      useSnippetsStore.setState({
        snippets: [],
        initialized: false,
        saving: false,
      })
    })
  })

  it('renders command bar with correct labels', () => {
    renderTool(SnippetsManager)
    expect(screen.getByText('[F5: NEW]')).toBeInTheDocument()
    expect(screen.getByText('[F6: DUP]')).toBeInTheDocument()
    expect(screen.getByText('[F8: DEL]')).toBeInTheDocument()
    expect(screen.getByText('[F9: EXP]')).toBeInTheDocument()
    expect(screen.getByText('[F10: IMP]')).toBeInTheDocument()
  })

  it('shows [FAV] indicator for favorite snippets', () => {
    act(() => {
      useSnippetsStore.setState({
        snippets: [
          { id: '1', title: 'Fav Snippet', content: '...', language: 'javascript', tags: ['⭐'], createdAt: Date.now(), updatedAt: Date.now() },
        ],
        initialized: true,
      })
    })
    renderTool(SnippetsManager)
    
    // Select the snippet
    const item = screen.getByText('Fav Snippet').closest('button')
    fireEvent.click(item!)
    
    expect(screen.getByText('[FAV]')).toBeInTheDocument()
  })

  it('shows [SAVING...] indicator when saving is true', () => {
    renderTool(SnippetsManager)
    
    act(() => {
      useSnippetsStore.setState({ saving: true })
    })
    
    expect(screen.getByText('[SAVING...]')).toBeInTheDocument()
    
    act(() => {
      useSnippetsStore.setState({ saving: false })
    })
    expect(screen.queryByText('[SAVING...]')).not.toBeInTheDocument()
  })

  it('shows [CONFIRM?] when delete is clicked once', () => {
    act(() => {
      useSnippetsStore.setState({
        snippets: [
          { id: '1', title: 'Delete Me', content: '...', language: 'javascript', tags: [], createdAt: Date.now(), updatedAt: Date.now() },
        ],
        initialized: true,
      })
    })
    renderTool(SnippetsManager)
    
    // Select the snippet
    const item = screen.getByText('Delete Me').closest('button')
    fireEvent.click(item!)
    
    const deleteBtn = screen.getByText('[F8: DEL]')
    fireEvent.click(deleteBtn)
    
    expect(screen.getByText('[CONFIRM?]')).toBeInTheDocument()
  })
})
