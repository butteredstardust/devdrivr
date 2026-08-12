import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import MarkdownEditor, { prefixMarkdownLines } from '@/tools/markdown-editor/MarkdownEditor'
import { MarkdownPreview } from '@/tools/markdown-editor/MarkdownPreview'
import { LinkModal } from '@/tools/markdown-editor/modals/LinkModal'
import { CodeBlockModal } from '@/tools/markdown-editor/modals/CodeBlockModal'
import { TableModal } from '@/tools/markdown-editor/modals/TableModal'
import { ImageModal } from '@/tools/markdown-editor/modals/ImageModal'
import { useSettingsStore } from '@/stores/settings.store'
import { DEFAULT_SETTINGS } from '@/types/models'
import { dispatchToolAction } from '@/lib/tool-actions'
import { openFileDialog, saveFileDialog, saveFileToPath } from '@/lib/file-io'

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}))

vi.mock('mermaid', () => ({
  default: mermaidMock,
}))

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
  saveFileToPath: vi.fn(),
  openFileDialog: vi.fn(),
  filenameFromPath: (path: string) => path.split(/[\\/]/).pop() || path,
}))

function deferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  const resolve = (value: T | PromiseLike<T>) => resolvePromise(value)
  return { promise, resolve }
}

const originalClipboard = navigator.clipboard

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  useSettingsStore.setState(DEFAULT_SETTINGS)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  })
})

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

  it('opens markdown from a global file action and saves it', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/document.md')
    renderTool(MarkdownEditor)

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: '# Opened document',
        filename: 'opened.md',
      })
    })
    expect(screen.getByTestId('monaco-editor')).toHaveValue('# Opened document')

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() =>
      expect(saveFileDialog).toHaveBeenCalledWith('# Opened document', 'opened.md')
    )
  })

  it('File dropdown renders Open, Save, and Save As entries', () => {
    renderTool(MarkdownEditor)
    fireEvent.click(screen.getByText('File'))
    expect(screen.getByText('Open…')).toBeInTheDocument()
    expect(screen.getByText('Save')).toBeInTheDocument()
    expect(screen.getByText('Save As…')).toBeInTheDocument()
  })

  it('File > Open… populates content, fileName, and filePath', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: '# From disk',
      filename: 'notes.md',
      path: '/tmp/notes.md',
    })
    renderTool(MarkdownEditor)

    fireEvent.click(screen.getByText('File'))
    fireEvent.click(screen.getByText('Open…'))

    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue('# From disk'))
    expect(screen.getByTestId('file-name')).toHaveTextContent('notes.md')
  })

  it('File > Save writes directly to a known filePath without opening the save dialog', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: '# From disk',
      filename: 'notes.md',
      path: '/tmp/notes.md',
    })
    vi.mocked(saveFileToPath).mockResolvedValue(undefined)
    renderTool(MarkdownEditor)

    fireEvent.click(screen.getByText('File'))
    fireEvent.click(screen.getByText('Open…'))
    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue('# From disk'))

    fireEvent.click(screen.getByText('File'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(saveFileToPath).toHaveBeenCalledWith('/tmp/notes.md', '# From disk'))
    expect(saveFileDialog).not.toHaveBeenCalled()
  })

  it('File > Save falls back to the Save As dialog when no filePath is known', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/document.md')
    renderTool(MarkdownEditor)

    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '# Untitled' },
    })
    fireEvent.click(screen.getByText('File'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledWith('# Untitled', 'document.md'))
    expect(saveFileToPath).not.toHaveBeenCalled()
  })

  it('shows a dirty indicator after editing and clears it after saving', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: '# From disk',
      filename: 'notes.md',
      path: '/tmp/notes.md',
    })
    vi.mocked(saveFileToPath).mockResolvedValue(undefined)
    renderTool(MarkdownEditor)

    fireEvent.click(screen.getByText('File'))
    fireEvent.click(screen.getByText('Open…'))
    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue('# From disk'))
    expect(screen.getByTestId('file-name')).toHaveTextContent('notes.md')
    expect(screen.getByTestId('file-name').textContent).not.toContain('•')

    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '# Edited' },
    })
    await waitFor(() => expect(screen.getByTestId('file-name').textContent).toContain('•'))

    fireEvent.click(screen.getByText('File'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(screen.getByTestId('file-name').textContent).not.toContain('•'))
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

  it('copies HTML from current editor content without waiting for preview debounce', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderTool(MarkdownEditor)

    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '# Fresh Export' },
    })
    fireEvent.click(screen.getByText('Export'))
    fireEvent.click(screen.getByText('Copy HTML'))

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText.mock.calls[0]?.[0]).toContain('<h1>Fresh Export</h1>')
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

  it('scrolls duplicate TOC entries to the matching heading occurrence', () => {
    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView
    let scrolledElement: Element | null = null
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: function scrollIntoView() {
        scrolledElement = this
      },
    })

    try {
      render(
        <MarkdownPreview
          html="<h2>Repeat</h2><p>First</p><h2>Repeat</h2><p>Second</p>"
          showToc
          toc={[
            { level: 2, text: 'Repeat', id: 'repeat' },
            { level: 2, text: 'Repeat', id: 'repeat-2' },
          ]}
        />
      )

      fireEvent.click(screen.getAllByRole('button', { name: 'Repeat' })[1]!)

      expect(scrolledElement).toBe(document.querySelectorAll('h2')[1])
    } finally {
      Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
    }
  })

  it('ignores stale async Mermaid renders in the preview', async () => {
    const oldRender = deferred<{ svg: string }>()
    const newRender = deferred<{ svg: string }>()
    mermaidMock.render.mockImplementation((_id: string, source: string) => {
      if (source.includes('New')) return newRender.promise
      return oldRender.promise
    })

    const { container, rerender } = render(
      <MarkdownPreview
        html="<pre><code class='language-mermaid'>flowchart TD&#xA;Old</code></pre>"
        showToc={false}
        toc={[]}
      />
    )

    await waitFor(() => expect(mermaidMock.render).toHaveBeenCalledTimes(1))

    rerender(
      <MarkdownPreview
        html="<pre><code class='language-mermaid'>flowchart TD&#xA;New</code></pre>"
        showToc={false}
        toc={[]}
      />
    )
    await waitFor(() => expect(mermaidMock.render).toHaveBeenCalledTimes(2))

    newRender.resolve({ svg: '<svg><text>new diagram</text></svg>' })
    await waitFor(() => expect(container.innerHTML).toContain('new diagram'))

    oldRender.resolve({ svg: '<svg><text>old diagram</text></svg>' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(container.innerHTML).toContain('new diagram')
    expect(container.innerHTML).not.toContain('old diagram')
  })

  it('uses the light Mermaid theme in preview when the app theme is light', async () => {
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, theme: 'github-light' })
    mermaidMock.render.mockResolvedValue({ svg: '<svg><text>diagram</text></svg>' })

    render(
      <MarkdownPreview
        html="<pre><code class='language-mermaid'>flowchart TD&#xA;A</code></pre>"
        showToc={false}
        toc={[]}
      />
    )

    await waitFor(() =>
      expect(mermaidMock.initialize).toHaveBeenCalledWith({
        startOnLoad: false,
        theme: 'default',
      })
    )
  })

  it('prefixes every selected content line for multiline markdown actions', () => {
    expect(prefixMarkdownLines('alpha\nbeta', '- ')).toBe('- alpha\n- beta')
  })

  it('preserves blank lines when prefixing multiline selections', () => {
    expect(prefixMarkdownLines('alpha\n\nbeta', '> ')).toBe('> alpha\n\n> beta')
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
