import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen, fireEvent, render } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import MermaidEditor from '@/tools/mermaid-editor/MermaidEditor'
import { useSettingsStore } from '@/stores/settings.store'
import { DEFAULT_SETTINGS } from '@/types/models'

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}))

vi.mock('mermaid', () => ({
  default: mermaidMock,
}))

function deferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  const resolve = (value: T | PromiseLike<T>) => resolvePromise(value)
  return { promise, resolve }
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  useSettingsStore.setState(DEFAULT_SETTINGS)
})

describe('MermaidEditor', () => {
  it('renders editor', () => {
    renderTool(MermaidEditor)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('renders mode tabs: Edit, Split, Preview', () => {
    renderTool(MermaidEditor)
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Split')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('renders zoom badge showing 100%', () => {
    renderTool(MermaidEditor)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('always shows ↺ reset button in zoom badge', () => {
    renderTool(MermaidEditor)
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument()
  })

  it('shows persistent interaction hint', () => {
    renderTool(MermaidEditor)
    expect(screen.getByText('Scroll · Drag · Double-click to reset')).toBeInTheDocument()
  })

  it('ignores stale async renders after rapid edits', async () => {
    vi.useFakeTimers()
    const oldRender = deferred<{ svg: string }>()
    const newRender = deferred<{ svg: string }>()
    mermaidMock.render.mockImplementation((_id: string, source: string) => {
      if (source.includes('New')) return newRender.promise
      return oldRender.promise
    })

    const { container } = renderTool(MermaidEditor)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: 'flowchart TD\nOld' },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(mermaidMock.render).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: 'flowchart TD\nNew' },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(mermaidMock.render).toHaveBeenCalledTimes(2)

    await act(async () => {
      newRender.resolve({ svg: '<svg><text>new diagram</text></svg>' })
      await Promise.resolve()
    })
    expect(container.innerHTML).toContain('new diagram')

    await act(async () => {
      oldRender.resolve({ svg: '<svg><text>old diagram</text></svg>' })
      await Promise.resolve()
    })

    expect(container.innerHTML).toContain('new diagram')
    expect(container.innerHTML).not.toContain('old diagram')
  })

  it('uses the light Mermaid theme when the app theme is light', async () => {
    vi.useFakeTimers()
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, theme: 'github-light' })
    mermaidMock.render.mockResolvedValue({ svg: '<svg><text>diagram</text></svg>' })

    renderTool(MermaidEditor)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(mermaidMock.initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      theme: 'default',
    })
  })

  it('keeps the rendered preview interactive instead of disabling pointer events', async () => {
    vi.useFakeTimers()
    mermaidMock.render.mockResolvedValue({ svg: '<svg><a href="#node">Node</a></svg>' })

    renderTool(MermaidEditor)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(screen.getByTestId('mermaid-preview-content').parentElement).not.toHaveStyle({
      pointerEvents: 'none',
    })
  })
})

describe('MermaidEditor — Templates dropdown', () => {
  it('renders Templates button', () => {
    renderTool(MermaidEditor)
    expect(screen.getByText('Templates')).toBeInTheDocument()
  })

  it('opens dropdown on click and shows all template names', () => {
    renderTool(MermaidEditor)
    fireEvent.click(screen.getByText('Templates'))
    expect(screen.getByText('flowchart')).toBeInTheDocument()
    expect(screen.getByText('sequence')).toBeInTheDocument()
    expect(screen.getByText('er')).toBeInTheDocument()
    expect(screen.getByText('gantt')).toBeInTheDocument()
  })

  it('closes dropdown on outside click', () => {
    render(
      <div>
        <button data-testid="outside">outside</button>
        <MermaidEditor />
      </div>
    )
    fireEvent.click(screen.getByText('Templates'))
    expect(screen.getByText('flowchart')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('flowchart')).toBeNull()
  })

  it('opens from the keyboard and closes with Escape', () => {
    renderTool(MermaidEditor)
    const button = screen.getByRole('button', { name: 'Templates' })

    fireEvent.keyDown(button, { key: 'ArrowDown' })
    expect(screen.getByRole('menu', { name: 'Mermaid templates' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('menu', { name: 'Mermaid templates' }), { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Mermaid templates' })).toBeNull()
    expect(button).toHaveFocus()
  })
})

describe('MermaidEditor — Export dropdown', () => {
  it('renders Export button', () => {
    renderTool(MermaidEditor)
    expect(screen.getByText('Export')).toBeInTheDocument()
  })

  it('opens dropdown on click and shows all export actions', () => {
    renderTool(MermaidEditor)
    fireEvent.click(screen.getByText('Export'))
    expect(screen.getByText('Copy SVG')).toBeInTheDocument()
    expect(screen.getByText('Download SVG')).toBeInTheDocument()
    expect(screen.getByText('Copy PNG (2×)')).toBeInTheDocument()
    expect(screen.getByText('Download PNG (2×)')).toBeInTheDocument()
    expect(screen.getByText('Copy Source')).toBeInTheDocument()
  })

  it('shows PNG resolution picker with all scales in the dropdown', () => {
    renderTool(MermaidEditor)
    fireEvent.click(screen.getByText('Export'))
    expect(screen.getByTitle('Export PNG at 1× resolution')).toBeInTheDocument()
    expect(screen.getByTitle('Export PNG at 2× resolution')).toBeInTheDocument()
    expect(screen.getByTitle('Export PNG at 3× resolution')).toBeInTheDocument()
    expect(screen.getByTitle('Export PNG at 4× resolution')).toBeInTheDocument()
  })

  it('defaults to 2× export scale', () => {
    renderTool(MermaidEditor)
    fireEvent.click(screen.getByText('Export'))
    const btn2x = screen.getByTitle('Export PNG at 2× resolution')
    expect(btn2x.className).toContain('text-[var(--color-accent)]')
  })

  it('all diagram-dependent actions are disabled when there is no diagram', () => {
    renderTool(MermaidEditor)
    fireEvent.click(screen.getByText('Export'))
    expect(screen.getByText('Copy SVG')).toBeDisabled()
    expect(screen.getByText('Download SVG')).toBeDisabled()
    expect(screen.getByText('Copy PNG (2×)')).toBeDisabled()
    expect(screen.getByText('Download PNG (2×)')).toBeDisabled()
  })

  it('closes dropdown on outside click', () => {
    render(
      <div>
        <button data-testid="outside">outside</button>
        <MermaidEditor />
      </div>
    )
    fireEvent.click(screen.getByText('Export'))
    expect(screen.getByText('Copy SVG')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Copy SVG')).toBeNull()
  })

  it('opens the export menu from the keyboard and closes it with Escape', () => {
    renderTool(MermaidEditor)
    const button = screen.getByRole('button', { name: 'Export' })

    fireEvent.keyDown(button, { key: 'ArrowDown' })
    expect(screen.getByRole('menu', { name: 'Mermaid export actions' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('menu', { name: 'Mermaid export actions' }), {
      key: 'Escape',
    })
    expect(screen.queryByRole('menu', { name: 'Mermaid export actions' })).toBeNull()
    expect(button).toHaveFocus()
  })
})
