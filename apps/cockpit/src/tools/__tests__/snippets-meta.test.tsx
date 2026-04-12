import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import { useSnippetsStore } from '@/stores/snippets.store'
import SnippetsManager from '../snippets/SnippetsManager'

describe('SnippetsManager Meta Pane', () => {
  const setup = () => {
    useSnippetsStore.setState({
      snippets: [
        {
          id: '1',
          title: 'Test Snippet',
          content: 'line1\nline2',
          language: 'javascript',
          tags: ['tag1', 'tag2'],
          folder: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    const item = screen.getByText('Test Snippet').closest('button')
    fireEvent.click(item!)
  }

  it('renders language selector in Meta pane', () => {
    setup()
    const metaPane = screen.getByText('[ 03-META ]').parentElement?.parentElement
    expect(metaPane).toBeInTheDocument()

    // Check if language selector is in Meta pane
    const langSelector = screen.getByDisplayValue('javascript')
    expect(metaPane?.contains(langSelector)).toBe(true)
  })

  it('renders tags in vertical list in Meta pane', () => {
    setup()
    const metaPane = screen.getByText('[ 03-META ]').closest('div')?.parentElement

    // In Meta pane, tags are in a specific list
    const tagsContainer = screen.getByText('Tags').nextElementSibling
    expect(tagsContainer).toHaveTextContent('tag1')
    expect(tagsContainer).toHaveTextContent('tag2')
    expect(metaPane?.contains(tagsContainer!)).toBe(true)
  })

  it('removes tags when clicking [X] button', async () => {
    setup()
    const tagsContainer = screen.getByText('Tags').nextElementSibling
    const removeButtons = tagsContainer?.querySelectorAll('button')
    // There should be remove buttons for tag1 and tag2
    if (!removeButtons || !removeButtons[0]) {
      throw new Error('Remove button not found')
    }
    fireEvent.click(removeButtons[0])

    // tag1 should be gone from the tags container
    expect(tagsContainer).not.toHaveTextContent('tag1')
  })

  it('shows high-density stats block', () => {
    setup()
    // content is 'line1\nline2' -> 2 lines, 11 chars
    // bytes should be same as chars for ASCII
    expect(
      screen.getByText(
        (content) => content.includes('L:2') && content.includes('C:11') && content.includes('B:11')
      )
    ).toBeInTheDocument()
  })

  it('updates stats when content changes', async () => {
    setup()

    // Try updating content via store but wrap in act
    const { act } = await import('react')
    await act(async () => {
      useSnippetsStore.setState((state) => ({
        snippets: state.snippets.map((s) => (s.id === '1' ? { ...s, content: 'new content' } : s)),
      }))
    })

    // 'new content' -> 1 line, 11 chars
    expect(
      screen.getByText(
        (content) => content.includes('L:1') && content.includes('C:11') && content.includes('B:11')
      )
    ).toBeInTheDocument()
  })
})
