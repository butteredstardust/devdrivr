import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import MermaidEditor from '@/tools/mermaid-editor/MermaidEditor'
import {
  TEMPLATES,
  countStatements,
  detectDiagramType,
  exportFileName,
  fitScale,
  parseMermaidError,
  sourceLineForReportedLine,
  svgSize,
  svgWithExplicitSize,
  templateById,
  withSourceLine,
} from '@/tools/mermaid-editor/mermaid-helpers'
import { useSettingsStore } from '@/stores/settings.store'
import { DEFAULT_SETTINGS } from '@/types/models'
import { dispatchToolAction, supportsToolFileAction } from '@/lib/tool-actions'
import { openFileDialog, saveFileDialog } from '@/lib/file-io'

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}))

vi.mock('mermaid', () => ({ default: mermaidMock }))

const recordMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useToolHistory', () => ({
  useToolHistory: () => ({
    record: recordMock,
    recordEdited: recordMock,
    markUserEdit: vi.fn(),
  }),
}))

vi.mock('@/lib/file-io', () => ({
  openFileDialog: vi.fn(),
  saveFileDialog: vi.fn(),
  saveFileToPath: vi.fn(),
  exportFile: vi.fn(),
  filenameFromPath: (path: string) => path.split(/[\\/]/).pop() || path,
}))

function deferred<T>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: (value: T | PromiseLike<T>) => resolvePromise(value) }
}

const originalClipboard = navigator.clipboard

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText, write: vi.fn().mockResolvedValue(undefined) },
  })
  return writeText
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  useSettingsStore.setState(DEFAULT_SETTINGS)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  })
})

function editor() {
  return screen.getByTestId('monaco-editor') as HTMLTextAreaElement
}

function type(value: string) {
  fireEvent.change(editor(), { target: { value } })
}

/** Runs the 500ms render debounce and lets the mocked promise settle. */
async function flushRender() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('mermaid-helpers', () => {
  it('reads the diagram type off the first real line, not a comment or directive', () => {
    const source = `%%{init: {"theme":"dark"}}%%\n%% a note\n\nsequenceDiagram\n  A->>B: hi`

    expect(detectDiagramType(source)).toBe('Sequence diagram')
  })

  it('falls back to a generic label for an unknown keyword and null for nothing', () => {
    expect(detectDiagramType('somethingNew\n  a --> b')).toBe('Diagram')
    expect(detectDiagramType('   \n\n')).toBeNull()
  })

  it('counts only lines that say something', () => {
    expect(countStatements('flowchart TD\n\n  %% comment\n  A --> B\n')).toBe(2)
  })

  it('every template is retrievable by id and starts with its own keyword', () => {
    for (const template of TEMPLATES) {
      expect(templateById(template.id)).toBe(template)
      expect(detectDiagramType(template.content)).not.toBeNull()
    }
    expect(templateById('nope')).toBeUndefined()
  })

  it('pulls the line number out of a Mermaid parse error and drops the caret block', () => {
    const raw = `Parse error on line 3:\n...flowchart TD\n A --< B\n------------^\nExpecting 'ARROW'`

    expect(parseMermaidError(new Error(raw))).toEqual({
      line: 3,
      // The caret block goes; the `Expecting …` line is the part worth reading.
      message: "Parse error on line 3 — Expecting 'ARROW'",
    })
  })

  it('reports no line when Mermaid does not name one', () => {
    expect(parseMermaidError(new Error('Diagram type is not supported')).line).toBeNull()
    expect(parseMermaidError('boom').message).toBe('boom')
  })

  it('maps a reported line back through stripped comments and front matter', () => {
    const source = `---\ntitle: Flow\n---\n%% a note\nflowchart TD\n  A --< B`

    // Mermaid parses `flowchart TD\n  A --< B`, so its "line 2" is line 6 here.
    expect(sourceLineForReportedLine(source, 1)).toBe(5)
    expect(sourceLineForReportedLine(source, 2)).toBe(6)
    // A line beyond the stripped copy still has to land somewhere sensible.
    expect(sourceLineForReportedLine(source, 9)).toBe(6)
    expect(sourceLineForReportedLine('flowchart TD\n  A --> B', 2)).toBe(2)
  })

  it('rewrites the message when the reported line moves', () => {
    const source = `%% header\nflowchart TD\n  A --< B`
    const error = { line: 2, message: 'Parse error on line 2 — Expecting ARROW' }

    expect(withSourceLine(error, source)).toEqual({
      line: 3,
      message: 'Parse error on line 3 — Expecting ARROW',
    })
    expect(withSourceLine({ line: null, message: 'boom' }, source)).toEqual({
      line: null,
      message: 'boom',
    })
  })

  it('sizes an SVG from its viewBox rather than its max-width style', () => {
    const svg = '<svg viewBox="0 0 640 480" style="max-width: 640px;"></svg>'

    // The old export read `img.width`, which is 300×150 for this SVG — every
    // PNG came out cropped to that box.
    expect(svgSize(svg)).toEqual({ width: 640, height: 480 })
  })

  it('falls back to width/height attributes, then to a default', () => {
    expect(svgSize('<svg width="120" height="60"></svg>')).toEqual({ width: 120, height: 60 })
    expect(svgSize('<svg></svg>')).toEqual({ width: 800, height: 600 })
  })

  it('pins explicit pixel dimensions and strips the max-width style', () => {
    const out = svgWithExplicitSize(
      '<svg id="d" width="100%" style="max-width: 640px; background: red;"></svg>',
      { width: 640, height: 480 }
    )

    expect(out).toContain('width="640"')
    expect(out).toContain('height="480"')
    expect(out).not.toContain('max-width')
    expect(out).toContain('background: red')
  })

  it('fits a large diagram and never enlarges a small one', () => {
    expect(fitScale({ width: 1000, height: 500 }, { width: 532, height: 1000 })).toBeCloseTo(0.5)
    expect(fitScale({ width: 10, height: 10 }, { width: 500, height: 500 })).toBe(1)
  })

  it('names exports after the source file without doubling the extension', () => {
    expect(exportFileName('architecture.mmd', 'svg')).toBe('architecture.svg')
    expect(exportFileName(null, 'png')).toBe('diagram.png')
  })
})

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

describe('MermaidEditor', () => {
  it('renders the editor, the mode control, and the starter diagram name', () => {
    renderTool(MermaidEditor)

    expect(editor()).toBeInTheDocument()
    for (const label of ['Edit', 'Split', 'Preview']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByTestId('file-name')).toHaveTextContent('Untitled diagram')
  })

  it('reports the diagram type and line count in the status bar', async () => {
    vi.useFakeTimers()
    mermaidMock.render.mockResolvedValue({ svg: '<svg viewBox="0 0 10 10"></svg>' })
    renderTool(MermaidEditor)

    type('sequenceDiagram\n  Alice->>Bob: hi\n  Bob-->>Alice: hello')
    await flushRender()

    expect(screen.getByTestId('diagram-status')).toHaveTextContent(
      'Sequence diagram · 3 lines · Rendered'
    )
  })

  it('ignores stale async renders after rapid edits', async () => {
    vi.useFakeTimers()
    const oldRender = deferred<{ svg: string }>()
    const newRender = deferred<{ svg: string }>()
    mermaidMock.render.mockImplementation((_id: string, source: string) =>
      source.includes('New') ? newRender.promise : oldRender.promise
    )

    const { container } = renderTool(MermaidEditor)
    type('flowchart TD\nOld')
    await flushRender()
    type('flowchart TD\nNew')
    await flushRender()

    await act(async () => {
      newRender.resolve({ svg: '<svg><text>new diagram</text></svg>' })
      await Promise.resolve()
    })
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
    mermaidMock.render.mockResolvedValue({ svg: '<svg></svg>' })

    renderTool(MermaidEditor)
    await flushRender()

    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, theme: 'default' })
    )
  })

  it('renders SVG text instead of foreignObject HTML so PNG export is not blank', async () => {
    vi.useFakeTimers()
    mermaidMock.render.mockResolvedValue({ svg: '<svg></svg>' })

    renderTool(MermaidEditor)
    await flushRender()

    // WebKit will not rasterise a `<foreignObject>` from an SVG data URL.
    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        flowchart: { htmlLabels: false },
        class: { htmlLabels: false },
      })
    )
  })

  it('keeps the rendered preview interactive instead of disabling pointer events', async () => {
    vi.useFakeTimers()
    mermaidMock.render.mockResolvedValue({ svg: '<svg><a href="#node">Node</a></svg>' })

    renderTool(MermaidEditor)
    await flushRender()

    expect(screen.getByTestId('mermaid-preview-content').parentElement).not.toHaveStyle({
      pointerEvents: 'none',
    })
  })

  it('records history for a diagram the user typed but not for restored state', async () => {
    vi.useFakeTimers()
    mermaidMock.render.mockResolvedValue({ svg: '<svg></svg>' })

    renderTool(MermaidEditor)
    // The starter diagram renders on mount; `useToolState` hydrates
    // asynchronously, so a restored buffer must not look like user input.
    await flushRender()
    expect(recordMock).not.toHaveBeenCalled()

    type('pie title Votes\n  "Yes" : 1')
    await flushRender()

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, output: expect.stringContaining('Pie chart') })
    )
  })
})

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe('MermaidEditor — errors', () => {
  it('shows a one-line message with the failing line and keeps the last good diagram', async () => {
    vi.useFakeTimers()
    mermaidMock.render.mockResolvedValue({ svg: '<svg><text>good</text></svg>' })
    const { container } = renderTool(MermaidEditor)
    type('flowchart TD\n  A --> B')
    await flushRender()

    mermaidMock.render.mockRejectedValue(
      new Error('Parse error on line 2:\n A --< B\n-----^\nExpecting ARROW')
    )
    type('flowchart TD\n  A --< B')
    await flushRender()

    const alert = screen.getByRole('alert')
    // Mermaid names the line itself, so the banner does not prefix it again.
    expect(alert).toHaveTextContent('Parse error on line 2 — Expecting ARROW')
    expect(alert).not.toHaveTextContent('Line 2: Parse error')
    expect(alert).not.toHaveTextContent('-----^')
    expect(screen.getByRole('button', { name: /Go to line 2/ })).toBeInTheDocument()
    // A blanked preview on every half-typed line was the old behaviour.
    expect(container.innerHTML).toContain('good')
    expect(recordMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Parse error') })
    )
  })

  it('points at the source line, not the line in Mermaid’s stripped copy', async () => {
    vi.useFakeTimers()
    mermaidMock.render.mockRejectedValue(
      new Error('Parse error on line 2:\n A --< B\n-----^\nExpecting ARROW')
    )
    renderTool(MermaidEditor)
    type('%% a note about this diagram\nflowchart TD\n  A --< B')
    await flushRender()

    // Mermaid strips the comment before parsing, so its line 2 is line 3 here.
    expect(screen.getByRole('button', { name: /Go to line 3/ })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Parse error on line 3')
  })

  it('cleans up the scratch nodes Mermaid leaves behind when a render fails', async () => {
    vi.useFakeTimers()
    // Mermaid appends `div#d<id>` to measure text and only removes it on the
    // success path, so every failed keystroke used to leak a DOM subtree.
    mermaidMock.render.mockImplementation((id: string) => {
      const scratch = document.createElement('div')
      scratch.id = `d${id}`
      document.body.appendChild(scratch)
      return Promise.reject(new Error('Parse error on line 1:\n^\nExpecting ARROW'))
    })

    renderTool(MermaidEditor)
    type('flowchart TD\n  A --< B')
    await flushRender()
    type('flowchart TD\n  A --<< B')
    await flushRender()

    expect(document.querySelectorAll('[id^="dmermaid-preview-"]')).toHaveLength(0)
  })

  it('omits the jump button when Mermaid names no line', async () => {
    vi.useFakeTimers()
    mermaidMock.render.mockRejectedValue(new Error('Diagram type is not supported'))
    renderTool(MermaidEditor)
    type('nonsense diagram')
    await flushRender()

    expect(screen.getByRole('alert')).toHaveTextContent('Diagram type is not supported')
    expect(screen.queryByRole('button', { name: /Go to line/ })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Templates and buffer safety
// ---------------------------------------------------------------------------

describe('MermaidEditor — templates', () => {
  it('lists every template with a human-readable label', () => {
    renderTool(MermaidEditor)
    const select = screen.getByRole('combobox', { name: 'Diagram template' })

    for (const template of TEMPLATES) {
      expect(select).toHaveTextContent(template.label)
    }
  })

  it('loads a template straight away when nothing is unsaved', () => {
    renderTool(MermaidEditor)

    fireEvent.change(screen.getByRole('combobox', { name: 'Diagram template' }), {
      target: { value: 'pie' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))

    expect(editor().value).toContain('pie title')
    // A template is where the buffer starts, so nothing has been modified yet —
    // and loading a second one must not claim there is work to discard.
    expect(screen.getByText('All changes saved')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Diagram template' }), {
      target: { value: 'gantt' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(screen.queryByText('Replace unsaved changes?')).toBeNull()
    expect(editor().value).toContain('gantt')
  })

  it('asks before a template overwrites unsaved work, and keeps it if declined', () => {
    renderTool(MermaidEditor)
    type('flowchart TD\n  Precious --> Work')

    fireEvent.change(screen.getByRole('combobox', { name: 'Diagram template' }), {
      target: { value: 'gantt' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))

    // The old dropdown replaced the buffer with no warning and no undo.
    expect(screen.getByText('Replace unsaved changes?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(editor().value).toContain('Precious')

    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(editor().value).toContain('gantt')
  })

  it('asks before a new diagram discards unsaved work', () => {
    renderTool(MermaidEditor)
    type('flowchart TD\n  A --> B')

    fireEvent.click(screen.getByRole('button', { name: 'New diagram' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(editor().value).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Files and export
// ---------------------------------------------------------------------------

describe('MermaidEditor — files and export', () => {
  it('is registered for the global open and save shortcuts', () => {
    expect(supportsToolFileAction('mermaid-editor', 'open-file')).toBe(true)
    expect(supportsToolFileAction('mermaid-editor', 'save-file')).toBe(true)
  })

  it('opens a diagram from a global file action and saves it back', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/architecture.mmd')
    renderTool(MermaidEditor)

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'flowchart TD\n  Opened --> Diagram',
        filename: 'architecture.mmd',
      })
    })
    expect(editor()).toHaveValue('flowchart TD\n  Opened --> Diagram')
    expect(screen.getByTestId('file-name')).toHaveTextContent('architecture.mmd')

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() =>
      expect(saveFileDialog).toHaveBeenCalledWith(
        'flowchart TD\n  Opened --> Diagram',
        'architecture.mmd'
      )
    )
  })

  it('opens from the toolbar and marks the buffer saved', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: 'pie title Votes',
      filename: 'votes.mmd',
      path: '/tmp/votes.mmd',
    })
    renderTool(MermaidEditor)

    fireEvent.click(screen.getByRole('button', { name: 'Open Mermaid file' }))

    await waitFor(() => expect(screen.getByTestId('file-name')).toHaveTextContent('votes.mmd'))
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
  })

  it('marks the buffer modified as soon as it is edited', () => {
    renderTool(MermaidEditor)
    type('flowchart TD\n  A --> B')

    expect(screen.getByText('Modified')).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('disables the image actions until something has rendered', () => {
    mermaidMock.render.mockRejectedValue(new Error('nope'))
    renderTool(MermaidEditor)

    expect(screen.getByRole('button', { name: /Copy SVG/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled()
  })

  it('copies the SVG with explicit pixel dimensions so it survives outside the app', async () => {
    vi.useFakeTimers()
    const writeText = mockClipboard()
    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 640 480" style="max-width: 640px;"><text>d</text></svg>',
    })
    renderTool(MermaidEditor)
    await flushRender()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copy SVG/ }))
    })

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('width="640"'))
    expect(writeText).toHaveBeenCalledWith(expect.not.stringContaining('max-width'))
  })

  it('copies the source through the global copy-output action', async () => {
    const writeText = mockClipboard()
    renderTool(MermaidEditor)
    type('flowchart TD\n  A --> B')

    await act(async () => {
      dispatchToolAction({ type: 'copy-output' })
    })

    expect(writeText).toHaveBeenCalledWith('flowchart TD\n  A --> B')
  })

  it('reveals the resolution and background choices only for PNG', () => {
    renderTool(MermaidEditor)
    expect(screen.queryByRole('combobox', { name: 'PNG resolution' })).toBeNull()

    fireEvent.change(screen.getByRole('combobox', { name: 'Export format' }), {
      target: { value: 'png' },
    })

    expect(screen.getByRole('combobox', { name: 'PNG resolution' })).toHaveValue('2')
    expect(screen.getByRole('switch', { name: 'Transparent' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })
})

// ---------------------------------------------------------------------------
// Preview canvas
// ---------------------------------------------------------------------------

describe('MermaidEditor — preview canvas', () => {
  it('zooms and pans from the keyboard and resets to 100%', () => {
    renderTool(MermaidEditor)
    const canvas = screen.getByTestId('mermaid-canvas')

    expect(screen.getByText('100%')).toBeInTheDocument()
    fireEvent.keyDown(canvas, { key: '+' })
    expect(screen.getByText('120%')).toBeInTheDocument()
    fireEvent.keyDown(canvas, { key: '-' })
    expect(screen.getByText('100%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('120%')).toBeInTheDocument()
    fireEvent.keyDown(canvas, { key: '0' })
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('keeps a zoom the user set when the diagram re-renders', async () => {
    vi.useFakeTimers()
    mermaidMock.render.mockResolvedValue({ svg: '<svg viewBox="0 0 10 10"><text>a</text></svg>' })
    renderTool(MermaidEditor)
    await flushRender()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('120%')).toBeInTheDocument()

    // Auto-fitting on every render used to throw away the view mid-edit.
    mermaidMock.render.mockResolvedValue({ svg: '<svg viewBox="0 0 20 20"><text>b</text></svg>' })
    type('flowchart TD\n  A --> B')
    await flushRender()

    expect(screen.getByText('120%')).toBeInTheDocument()
  })

  it('offers the empty preview a way to get started', () => {
    renderTool(MermaidEditor)
    type('')

    expect(screen.getByText('No diagram yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load template' }))
    expect(editor().value).toContain('flowchart')
  })
})
