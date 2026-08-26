import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderTool } from './test-utils'
import MarkdownEditor, {
  prefixMarkdownLines,
  renderMarkdownContent,
} from '@/tools/markdown-editor/MarkdownEditor'
import { markdownEditorProcessor } from '@/lib/markdown'
import { MarkdownPreview } from '@/tools/markdown-editor/MarkdownPreview'
import { LinkModal } from '@/tools/markdown-editor/modals/LinkModal'
import { CodeBlockModal } from '@/tools/markdown-editor/modals/CodeBlockModal'
import { TableModal } from '@/tools/markdown-editor/modals/TableModal'
import { ImageModal } from '@/tools/markdown-editor/modals/ImageModal'
import { useSettingsStore } from '@/stores/settings.store'
import { DEFAULT_SETTINGS } from '@/types/models'
import { dispatchToolAction } from '@/lib/tool-actions'
import { openFileDialog, saveFileDialog, saveFileToPath } from '@/lib/file-io'
import {
  parseListMarker,
  isMarkerContentEmpty,
  nextLineMarker,
  indentLine,
  outdentLine,
  renumberOrderedListAround,
  renumberAroundIndex,
} from '@/tools/markdown-editor/list-editing'
import { toggleTaskAtIndex, countTasks } from '@/tools/markdown-editor/task-list'
import { isUrl, tsvToMarkdownTable } from '@/tools/markdown-editor/paste-helpers'

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
  it('exposes find and replace in the editor toolbar', () => {
    renderTool(MarkdownEditor)
    expect(screen.getByRole('button', { name: /^Find \(/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Find and replace \(/ })).toBeInTheDocument()
  })
  it('renders tab bar with Edit first', () => {
    renderTool(MarkdownEditor)
    const tabs = ['Edit', 'Split', 'Preview'].map((label) => screen.getByText(label))
    expect(tabs[0]).toBeInTheDocument()
    // DOCUMENT_POSITION_FOLLOWING = 4 — confirms Edit precedes Split precedes Preview
    expect(tabs[0]!.compareDocumentPosition(tabs[1]!)).toBe(4)
    expect(tabs[1]!.compareDocumentPosition(tabs[2]!)).toBe(4)
  })

  it('shows the edit-preview switch only in Preview mode', () => {
    renderTool(MarkdownEditor)
    expect(screen.queryByRole('switch', { name: 'Edit preview' })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Preview' }))

    const toggle = screen.getByRole('switch', { name: 'Edit preview' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('radio', { name: 'Split' }))
    expect(screen.queryByRole('switch', { name: 'Edit preview' })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Preview' }))
    expect(screen.getByRole('switch', { name: 'Edit preview' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('edits a rendered block in Preview mode without changing surrounding markdown', async () => {
    renderTool(MarkdownEditor)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '# Original heading\n\nKeep **this** paragraph.' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Preview' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Original heading' })).toBeVisible()
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Edit preview' }))
    const heading = screen.getByRole('heading', { name: 'Original heading' })
    expect(heading).toHaveAttribute('tabindex', '0')
    heading.focus()
    fireEvent.keyDown(heading, { key: 'Enter' })

    const blockEditor = screen.getByRole('textbox', { name: 'Edit markdown block' })
    expect(blockEditor).toHaveValue('# Original heading')
    fireEvent.change(blockEditor, { target: { value: '## Updated heading' } })
    fireEvent.keyDown(blockEditor, { key: 'Escape' })

    fireEvent.click(screen.getByRole('radio', { name: 'Edit' }))
    expect(screen.getByTestId('monaco-editor')).toHaveValue(
      '## Updated heading\n\nKeep **this** paragraph.'
    )
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

  it('renders canonical file actions in the toolbar', () => {
    renderTool(MarkdownEditor)
    const files = screen.getByRole('group', { name: 'File actions' })
    expect(within(files).getByRole('button', { name: 'Open markdown file' })).toBeInTheDocument()
    expect(
      within(files).getByRole('button', { name: 'Save markdown document' })
    ).toBeInTheDocument()
    expect(
      within(files).getByRole('button', { name: 'Save markdown document as' })
    ).toBeInTheDocument()
  })

  it('Open populates content, fileName, and filePath', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: '# From disk',
      filename: 'notes.md',
      path: '/tmp/notes.md',
    })
    renderTool(MarkdownEditor)

    fireEvent.click(screen.getByRole('button', { name: 'Open markdown file' }))

    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue('# From disk'))
    expect(screen.getByTestId('file-name')).toHaveTextContent('notes.md')
  })

  it('Save writes directly to a known filePath without opening the save dialog', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: '# From disk',
      filename: 'notes.md',
      path: '/tmp/notes.md',
    })
    vi.mocked(saveFileToPath).mockResolvedValue(undefined)
    renderTool(MarkdownEditor)

    fireEvent.click(screen.getByRole('button', { name: 'Open markdown file' }))
    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue('# From disk'))

    fireEvent.click(screen.getByRole('button', { name: 'Save markdown document' }))

    await waitFor(() => expect(saveFileToPath).toHaveBeenCalledWith('/tmp/notes.md', '# From disk'))
    expect(saveFileDialog).not.toHaveBeenCalled()
  })

  it('Save falls back to the Save As dialog when no filePath is known', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/document.md')
    renderTool(MarkdownEditor)

    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '# Untitled' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save markdown document' }))

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

    fireEvent.click(screen.getByRole('button', { name: 'Open markdown file' }))
    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue('# From disk'))
    expect(screen.getByTestId('file-name')).toHaveTextContent('notes.md')
    expect(screen.getByText('Saved')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '# Edited' },
    })
    await waitFor(() => expect(screen.getByText('Modified')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Save markdown document' }))

    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
  })

  it('protects unsaved work before starting a new document', () => {
    renderTool(MarkdownEditor)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '# Keep me' } })

    fireEvent.click(screen.getByRole('button', { name: 'New markdown document' }))

    expect(screen.getByRole('dialog', { name: 'Replace unsaved changes?' })).toBeInTheDocument()
    expect(editor).toHaveValue('# Keep me')

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(editor).toHaveValue('')
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('keeps unsaved work when template replacement is cancelled', () => {
    renderTool(MarkdownEditor)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '# In progress' } })

    fireEvent.click(screen.getByText('Templates'))
    fireEvent.click(screen.getByText('README'))
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))

    expect(editor).toHaveValue('# In progress')
    expect(screen.queryByRole('dialog', { name: 'Replace unsaved changes?' })).toBeNull()
  })

  it('exposes an accessible, horizontally scrollable formatting toolbar', () => {
    renderTool(MarkdownEditor)

    const toolbar = screen.getByRole('toolbar', { name: 'Markdown formatting' })
    expect(toolbar).toHaveClass('overflow-x-auto')
    expect(within(toolbar).getByRole('button', { name: /^Bold/ })).toBeInTheDocument()
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

  // Regression: React 19 compares `dangerouslySetInnerHTML` by object identity,
  // so an inline `{ __html }` literal made it rewrite innerHTML on every render
  // and tear down the subtree — destroying any text selection the user had made
  // in the preview. The rendered nodes must survive re-renders that don't change
  // the markup.
  it('preserves preview DOM nodes across re-renders when the html is unchanged', () => {
    const html = '<p>selectable paragraph</p>'
    const { container, rerender } = render(<MarkdownPreview html={html} showToc={false} toc={[]} />)
    const paragraph = container.querySelector('p')
    expect(paragraph).not.toBeNull()

    rerender(<MarkdownPreview html={html} showToc={false} toc={[]} onToggleTask={() => {}} />)

    expect(container.querySelector('p')).toBe(paragraph)
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

  // renderMarkdownContent's error path bakes markup directly into an HTML string
  // consumed via dangerouslySetInnerHTML — it cannot render the shared <Alert>
  // component, so it must carry the same role="alert"/aria-live semantics by hand.
  it('marks markdown render errors with alert semantics', async () => {
    const spy = vi
      .spyOn(markdownEditorProcessor, 'process')
      .mockRejectedValueOnce(new Error('boom'))

    const html = await renderMarkdownContent('# test')

    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-live="assertive"')
    expect(html).toContain('Render error: boom')

    spy.mockRestore()
  })

  it('announces a markdown render error via role="alert" once mounted', async () => {
    const spy = vi
      .spyOn(markdownEditorProcessor, 'process')
      .mockRejectedValueOnce(new Error('boom'))
    const html = await renderMarkdownContent('# test')
    spy.mockRestore()

    render(<MarkdownPreview html={html} showToc={false} toc={[]} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Render error: boom')
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
    fireEvent.click(screen.getByRole('switch', { name: 'Open in new tab (inserts HTML)' }))
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">My Link</a>'
    )
  })

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn()
    render(<LinkModal onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the scrim is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<LinkModal onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.click(container.querySelector('[role="presentation"]') as Element)
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

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn()
    render(<CodeBlockModal onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the scrim is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<CodeBlockModal onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.click(container.querySelector('[role="presentation"]') as Element)
    expect(onClose).toHaveBeenCalled()
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

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn()
    render(<TableModal onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the scrim is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<TableModal onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.click(container.querySelector('[role="presentation"]') as Element)
    expect(onClose).toHaveBeenCalled()
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

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn()
    render(<ImageModal onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the scrim is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<ImageModal onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.click(container.querySelector('[role="presentation"]') as Element)
    expect(onClose).toHaveBeenCalled()
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

describe('list-editing: parseListMarker', () => {
  it('parses a bullet item', () => {
    expect(parseListMarker('- item')).toEqual({
      kind: 'bullet',
      indent: '',
      bulletChar: '-',
      content: 'item',
    })
  })

  it('parses * and + bullets', () => {
    expect(parseListMarker('* item')?.bulletChar).toBe('*')
    expect(parseListMarker('+ item')?.bulletChar).toBe('+')
  })

  it('parses indented bullets', () => {
    expect(parseListMarker('    - item')).toMatchObject({ indent: '    ', content: 'item' })
  })

  it('parses an unchecked task item', () => {
    expect(parseListMarker('- [ ] task')).toEqual({
      kind: 'task',
      indent: '',
      bulletChar: '-',
      checked: false,
      content: 'task',
    })
  })

  it('parses a checked task item, including uppercase X', () => {
    expect(parseListMarker('- [x] task')).toMatchObject({ kind: 'task', checked: true })
    expect(parseListMarker('- [X] task')).toMatchObject({ kind: 'task', checked: true })
  })

  it('parses an ordered item with . or ) delimiter', () => {
    expect(parseListMarker('1. item')).toEqual({
      kind: 'ordered',
      indent: '',
      number: 1,
      delimiter: '.',
      content: 'item',
    })
    expect(parseListMarker('2) item')).toMatchObject({ number: 2, delimiter: ')' })
  })

  it('parses a blockquote, including nested >>', () => {
    expect(parseListMarker('> quote')).toEqual({
      kind: 'quote',
      indent: '',
      quotePrefix: '>',
      content: 'quote',
    })
    expect(parseListMarker('>> nested')).toMatchObject({ quotePrefix: '>>' })
  })

  it('parses empty markers (no content)', () => {
    expect(parseListMarker('- ')).toMatchObject({ kind: 'bullet', content: '' })
    expect(parseListMarker('1. ')).toMatchObject({ kind: 'ordered', content: '' })
    expect(parseListMarker('> ')).toMatchObject({ kind: 'quote', content: '' })
    expect(parseListMarker('- [ ] ')).toMatchObject({ kind: 'task', content: '' })
  })

  it('returns null for non-list lines', () => {
    expect(parseListMarker('plain paragraph text')).toBeNull()
    expect(parseListMarker('')).toBeNull()
    expect(parseListMarker('# Heading')).toBeNull()
  })
})

describe('list-editing: isMarkerContentEmpty', () => {
  it('is true for a bare marker and false when content is present', () => {
    expect(isMarkerContentEmpty(parseListMarker('- ')!)).toBe(true)
    expect(isMarkerContentEmpty(parseListMarker('-   ')!)).toBe(true)
    expect(isMarkerContentEmpty(parseListMarker('- x')!)).toBe(false)
  })
})

describe('list-editing: nextLineMarker', () => {
  it('repeats the bullet character', () => {
    expect(nextLineMarker(parseListMarker('- item')!)).toBe('- ')
    expect(nextLineMarker(parseListMarker('  * item')!)).toBe('  * ')
  })

  it('always continues a task item unchecked, even from a checked one', () => {
    expect(nextLineMarker(parseListMarker('- [x] done')!)).toBe('- [ ] ')
    expect(nextLineMarker(parseListMarker('- [ ] todo')!)).toBe('- [ ] ')
  })

  it('advances the ordered number by one', () => {
    expect(nextLineMarker(parseListMarker('1. item')!)).toBe('2. ')
    expect(nextLineMarker(parseListMarker('9) item')!)).toBe('10) ')
  })

  it('repeats the quote prefix', () => {
    expect(nextLineMarker(parseListMarker('> quote')!)).toBe('> ')
    expect(nextLineMarker(parseListMarker('>> nested')!)).toBe('>> ')
  })
})

describe('list-editing: indentLine / outdentLine', () => {
  it('indents with spaces when insertSpaces is true', () => {
    expect(indentLine('- item', true, 2)).toBe('  - item')
  })

  it('indents with a tab when insertSpaces is false', () => {
    expect(indentLine('- item', false, 4)).toBe('\t- item')
  })

  it('outdents a leading tab regardless of insertSpaces', () => {
    expect(outdentLine('\t- item', true, 2)).toBe('- item')
    expect(outdentLine('\t- item', false, 2)).toBe('- item')
  })

  it('outdents up to tabSize leading spaces', () => {
    expect(outdentLine('    - item', true, 2)).toBe('  - item')
    expect(outdentLine('  - item', true, 2)).toBe('- item')
  })

  it('is a no-op when there is no leading whitespace to remove', () => {
    expect(outdentLine('- item', true, 2)).toBe('- item')
  })
})

describe('list-editing: renumberOrderedListAround', () => {
  it('renumbers a contiguous run after a new item is spliced in', () => {
    const lines = ['1. a', '2. ', '2. b', '3. c']
    expect(renumberOrderedListAround(lines, 1, '')).toEqual(['1. a', '2. ', '3. b', '4. c'])
  })

  it('is a no-op when the anchor line is not an ordered item at the given indent', () => {
    const lines = ['- a', '1. b']
    expect(renumberOrderedListAround(lines, 0, '')).toEqual(lines)
  })

  it('only renumbers the run at the matching indent, not nested sub-lists', () => {
    const lines = ['1. a', '  1. nested', '  2. nested2', '2. b']
    expect(renumberOrderedListAround(lines, 1, '  ')).toEqual(lines)
  })

  it('preserves the run start number rather than resetting to 1', () => {
    const lines = ['5. a', '6. ', '6. b']
    expect(renumberOrderedListAround(lines, 1, '')).toEqual(['5. a', '6. ', '7. b'])
  })
})

describe('list-editing: renumberAroundIndex', () => {
  it('renumbers the run on each side of a line that was just re-indented away', () => {
    // Simulates line 1 having just been indented (moved out of the "" run,
    // which leaves the run below it internally mis-numbered).
    const lines = ['1. a', '  1. removed', '5. b', '5. c']
    expect(renumberAroundIndex(lines, 1, '')).toEqual(['1. a', '  1. removed', '5. b', '6. c'])
  })

  it('is a no-op when neither neighbour is an ordered item at the given indent', () => {
    const lines = ['- a', '  1. b', '- c']
    expect(renumberAroundIndex(lines, 1, '')).toEqual(lines)
  })
})

describe('task-list: toggleTaskAtIndex', () => {
  it('toggles unchecked to checked', () => {
    expect(toggleTaskAtIndex('- [ ] one', 0)).toBe('- [x] one')
  })

  it('toggles checked to unchecked', () => {
    expect(toggleTaskAtIndex('- [x] one', 0)).toBe('- [ ] one')
  })

  it('handles uppercase X as checked', () => {
    expect(toggleTaskAtIndex('- [X] one', 0)).toBe('- [ ] one')
  })

  it('toggles nested/indented tasks', () => {
    const content = '- [ ] parent\n  - [ ] child'
    expect(toggleTaskAtIndex(content, 1)).toBe('- [ ] parent\n  - [x] child')
  })

  it('toggles by source-order index across multiple tasks', () => {
    const content = '- [ ] one\n- [ ] two\n- [x] three'
    expect(toggleTaskAtIndex(content, 1)).toBe('- [ ] one\n- [x] two\n- [x] three')
    expect(toggleTaskAtIndex(content, 2)).toBe('- [ ] one\n- [ ] two\n- [ ] three')
  })

  it('ignores task-like text inside fenced code blocks', () => {
    const content = '- [ ] real task\n```\n- [ ] fake task\n```\n- [ ] another real task'
    // Index 1 should hit "another real task", not the one inside the fence.
    expect(toggleTaskAtIndex(content, 1)).toBe(
      '- [ ] real task\n```\n- [ ] fake task\n```\n- [x] another real task'
    )
  })

  it('does not touch a checkbox-shaped string inside inline code', () => {
    const content = '- `[ ]` not a task\n- [ ] real task'
    expect(toggleTaskAtIndex(content, 0)).toBe('- `[ ]` not a task\n- [x] real task')
  })

  it('leaves content unchanged for an out-of-range index', () => {
    const content = '- [ ] one'
    expect(toggleTaskAtIndex(content, 5)).toBe(content)
    expect(toggleTaskAtIndex(content, -1)).toBe(content)
  })
})

describe('task-list: countTasks', () => {
  it('counts task items and excludes fenced code blocks', () => {
    const content = '- [ ] one\n```\n- [ ] fake\n```\n- [x] two'
    expect(countTasks(content)).toBe(2)
  })

  it('returns 0 when there are no task items', () => {
    expect(countTasks('- bullet\n1. ordered\n> quote')).toBe(0)
  })
})

describe('paste-helpers: isUrl', () => {
  it('accepts bare http/https URLs', () => {
    expect(isUrl('https://example.com')).toBe(true)
    expect(isUrl('http://example.com/path?query=1')).toBe(true)
  })

  it('tolerates surrounding whitespace', () => {
    expect(isUrl('  https://example.com  ')).toBe(true)
  })

  it('rejects non-URL text and unsupported protocols', () => {
    expect(isUrl('not a url')).toBe(false)
    expect(isUrl('ftp://example.com')).toBe(false)
    expect(isUrl('https://example.com has trailing text')).toBe(false)
    expect(isUrl('')).toBe(false)
  })
})

describe('paste-helpers: tsvToMarkdownTable', () => {
  it('converts a 2x2 TSV grid into a GFM table with a header', () => {
    expect(tsvToMarkdownTable('Name\tAge\nAlice\t30\nBob\t25')).toBe(
      '| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |'
    )
  })

  it('escapes pipe characters in cell content', () => {
    expect(tsvToMarkdownTable('A|B\tC\n1\t2|3')).toBe('| A\\|B | C |\n| --- | --- |\n| 1 | 2\\|3 |')
  })

  it('returns null for a single row (no data)', () => {
    expect(tsvToMarkdownTable('Name\tAge')).toBeNull()
  })

  it('returns null for single-column data', () => {
    expect(tsvToMarkdownTable('Name\nAlice\nBob')).toBeNull()
  })

  it('returns null for ragged rows with inconsistent column counts', () => {
    expect(tsvToMarkdownTable('Name\tAge\nAlice\t30\tExtra')).toBeNull()
  })

  it('returns null for a lone URL / plain single-line text', () => {
    expect(tsvToMarkdownTable('https://example.com')).toBeNull()
  })
})

describe('MarkdownPreview task checkbox interaction', () => {
  it('renders checkboxes enabled (not disabled) so they are clickable', () => {
    render(
      <MarkdownPreview
        html={'<ul><li><input type="checkbox"> task</li></ul>'}
        showToc={false}
        toc={[]}
      />
    )
    expect(screen.getByRole('checkbox')).not.toBeDisabled()
  })

  it('calls onToggleTask with the source-order index when a checkbox is clicked', () => {
    const onToggleTask = vi.fn()
    render(
      <MarkdownPreview
        html={
          '<ul><li><input type="checkbox"> one</li>' +
          '<li><input type="checkbox" checked> two</li></ul>'
        }
        showToc={false}
        toc={[]}
        onToggleTask={onToggleTask}
      />
    )
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1]!)
    expect(onToggleTask).toHaveBeenCalledWith(1)
  })

  it('toggles via Enter for keyboard accessibility', () => {
    const onToggleTask = vi.fn()
    render(
      <MarkdownPreview
        html={'<ul><li><input type="checkbox"> task</li></ul>'}
        showToc={false}
        toc={[]}
        onToggleTask={onToggleTask}
      />
    )
    fireEvent.keyDown(screen.getByRole('checkbox'), { key: 'Enter' })
    expect(onToggleTask).toHaveBeenCalledWith(0)
  })
})

describe('MarkdownEditor task checkbox end-to-end', () => {
  it('clicking a checkbox in the preview toggles it in the source content', async () => {
    renderTool(MarkdownEditor)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '- [ ] one\n- [ ] two' },
    })

    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2))
    fireEvent.click(screen.getAllByRole('checkbox')[1]!)

    await waitFor(() =>
      expect(screen.getByTestId('monaco-editor')).toHaveValue('- [ ] one\n- [x] two')
    )
  })
})
