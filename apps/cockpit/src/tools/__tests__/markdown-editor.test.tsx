import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import MarkdownEditor from '../markdown-editor/MarkdownEditor'
import { LinkModal } from '../markdown-editor/modals/LinkModal'
import { CodeBlockModal } from '../markdown-editor/modals/CodeBlockModal'
import { TableModal } from '../markdown-editor/modals/TableModal'
import { ImageModal } from '../markdown-editor/modals/ImageModal'

describe('MarkdownEditor', () => {
  it('renders tab bar with Edit first', () => {
    renderTool(MarkdownEditor)
    const tabs = ['Edit', 'Split', 'Preview'].map((label) => screen.getByText(label))
    expect(tabs[0]).toBeInTheDocument()
    // DOCUMENT_POSITION_FOLLOWING = 4 — confirms Edit precedes Split precedes Preview
    expect(tabs[0]!.compareDocumentPosition(tabs[1]!)).toBe(4)
    expect(tabs[1]!.compareDocumentPosition(tabs[2]!)).toBe(4)
  })

  it('renders editor', () => {
    renderTool(MarkdownEditor)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows word count stats', () => {
    renderTool(MarkdownEditor)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'hello world' } })
    expect(screen.getByText(/2w/)).toBeInTheDocument()
  })

  it('renders Export dropdown button', () => {
    renderTool(MarkdownEditor)
    expect(screen.getByText('Export')).toBeInTheDocument()
  })

  it('Export dropdown opens on click and shows all actions', () => {
    renderTool(MarkdownEditor)
    fireEvent.click(screen.getByText('Export'))
    expect(screen.getByText('Copy Markdown')).toBeInTheDocument()
    expect(screen.getByText('Copy HTML')).toBeInTheDocument()
    expect(screen.getByText('Download .md')).toBeInTheDocument()
    expect(screen.getByText('Download .html')).toBeInTheDocument()
    expect(screen.getByText('Print / PDF')).toBeInTheDocument()
  })

  it('Export dropdown closes on outside click', () => {
    render(
      <div>
        <button data-testid="outside">outside</button>
        <MarkdownEditor />
      </div>
    )
    fireEvent.click(screen.getByText('Export'))
    expect(screen.getByText('Copy Markdown')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Copy Markdown')).toBeNull()
  })

  it('Templates dropdown closes on outside click', () => {
    render(
      <div>
        <button data-testid="outside">outside</button>
        <MarkdownEditor />
      </div>
    )
    fireEvent.click(screen.getByText('Templates'))
    expect(screen.getByText('README')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('README')).toBeNull()
  })

  it('toolbar renders Link and Image buttons with icons', () => {
    renderTool(MarkdownEditor)
    expect(screen.getByTitle('Link')).toBeInTheDocument()
    expect(screen.getByTitle('Image')).toBeInTheDocument()
  })
})

describe('LinkModal', () => {
  it('inserts basic markdown link', () => {
    const onInsert = vi.fn()
    render(<LinkModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Link text'), {
      target: { value: 'My Link' },
    })
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('[My Link](https://example.com)')
  })

  it('includes title attribute when provided', () => {
    const onInsert = vi.fn()
    render(<LinkModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Link text'), {
      target: { value: 'My Link' },
    })
    fireEvent.change(screen.getByPlaceholderText('Tooltip text (optional)'), {
      target: { value: 'My Title' },
    })
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('[My Link](https://example.com "My Title")')
  })

  it('inserts HTML anchor for open-in-new-tab', () => {
    const onInsert = vi.fn()
    render(<LinkModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Link text'), {
      target: { value: 'My Link' },
    })
    fireEvent.click(screen.getByLabelText('Open in new tab'))
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">My Link</a>'
    )
  })

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn()
    render(<LinkModal onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('Insert button is disabled when URL is empty', () => {
    render(<LinkModal onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Insert')).toBeDisabled()
  })
})

describe('CodeBlockModal', () => {
  it('inserts fenced code block with selected language', () => {
    const onInsert = vi.fn()
    render(<CodeBlockModal onInsert={onInsert} onClose={vi.fn()} />)
    const input = screen.getByPlaceholderText('Search languages…')
    fireEvent.change(input, { target: { value: 'type' } })
    fireEvent.click(screen.getByText('typescript'))
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('```typescript\ncode\n```')
  })

  it('inserts plain code block when no language selected', () => {
    const onInsert = vi.fn()
    render(<CodeBlockModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('```\ncode\n```')
  })

  it('filters language list by search query', () => {
    render(<CodeBlockModal onInsert={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search languages…'), {
      target: { value: 'py' },
    })
    expect(screen.getByText('python')).toBeInTheDocument()
    expect(screen.queryByText('javascript')).not.toBeInTheDocument()
  })
})

describe('TableModal', () => {
  it('generates a 2×2 table', () => {
    const onInsert = vi.fn()
    render(<TableModal onInsert={onInsert} onClose={vi.fn()} />)
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0]!, { target: { value: '2' } })
    fireEvent.change(inputs[1]!, { target: { value: '2' } })
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith(
      '| Col 1 | Col 2 |\n|-------|-------|\n|   |   |\n|   |   |'
    )
  })

  it('generates a 3×3 table by default', () => {
    const onInsert = vi.fn()
    render(<TableModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith(
      '| Col 1 | Col 2 | Col 3 |\n|-------|-------|-------|\n|   |   |   |\n|   |   |   |\n|   |   |   |'
    )
  })
})

describe('ImageModal', () => {
  it('inserts image with alt text and URL', () => {
    const onInsert = vi.fn()
    render(<ImageModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com/image.png'), {
      target: { value: 'https://example.com/image.png' },
    })
    fireEvent.change(screen.getByPlaceholderText('Alt text'), {
      target: { value: 'My Image' },
    })
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('![My Image](https://example.com/image.png)')
  })

  it('inserts image with empty alt text when not provided', () => {
    const onInsert = vi.fn()
    render(<ImageModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com/image.png'), {
      target: { value: 'https://example.com/image.png' },
    })
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('![](https://example.com/image.png)')
  })

  it('Insert button is disabled when URL is empty', () => {
    render(<ImageModal onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Insert')).toBeDisabled()
  })

  it('shows image preview when valid URL is entered', () => {
    render(<ImageModal onInsert={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com/image.png'), {
      target: { value: 'https://example.com/image.png' },
    })
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/image.png')
  })
})

describe('MarkdownEditor modal integration', () => {
  it('opens link modal when Link toolbar button clicked', async () => {
    renderTool(MarkdownEditor)
    fireEvent.click(screen.getByTitle('Link'))
    await waitFor(() => expect(screen.getByText('Insert Link')).toBeInTheDocument())
  })

  it('opens image modal when Image toolbar button clicked', async () => {
    renderTool(MarkdownEditor)
    fireEvent.click(screen.getByTitle('Image'))
    await waitFor(() => expect(screen.getByText('Insert Image')).toBeInTheDocument())
  })

  it('opens code block modal when Code Block toolbar button clicked', async () => {
    renderTool(MarkdownEditor)
    fireEvent.click(screen.getByTitle('Code Block'))
    await waitFor(() => expect(screen.getByText('Insert Code Block')).toBeInTheDocument())
  })

  it('opens table modal when Table toolbar button clicked', async () => {
    renderTool(MarkdownEditor)
    fireEvent.click(screen.getByTitle('Table'))
    await waitFor(() => expect(screen.getByText('Insert Table')).toBeInTheDocument())
  })
})
