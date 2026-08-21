import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import DiffViewer, { describeDiff, parseDiffStats } from '../diff-viewer/DiffViewer'
import { useUiStore } from '@/stores/ui.store'
import { exportFile } from '@/lib/file-io'
import { dispatchToolAction } from '@/lib/tool-actions'
import { supportsToolFileAction } from '@/lib/tool-actions'

vi.mock('@/lib/file-io', () => ({
  exportFile: vi.fn(),
  buildExportFilename: (base: string, extension: string) => `${base}.${extension}`,
}))

beforeEach(() => {
  vi.mocked(exportFile).mockReset().mockResolvedValue('/tmp/changes.patch')
})

function pressCompareShortcut() {
  fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
}

function editors() {
  return screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
}

function fillBothSides(left = 'line one\nline two\n', right = 'line one\nline TWO\n') {
  const [a, b] = editors()
  fireEvent.change(a!, { target: { value: left } })
  fireEvent.change(b!, { target: { value: right } })
}

function openOptions() {
  fireEvent.click(screen.getByRole('button', { name: /Options/ }))
}

describe('DiffViewer', () => {
  it('renders both editor panels', () => {
    renderTool(DiffViewer)
    expect(screen.getByText('Left')).toBeInTheDocument()
    expect(screen.getByText('Right')).toBeInTheDocument()
  })

  it('renders compare and swap actions', () => {
    renderTool(DiffViewer)
    expect(screen.getByRole('button', { name: /Compare/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Swap/ })).toBeInTheDocument()
  })

  it('opens files into alternating comparison sides', () => {
    renderTool(DiffViewer)
    expect(supportsToolFileAction('diff-viewer', 'open-file')).toBe(true)
    act(() => dispatchToolAction({ type: 'open-file', content: 'before', filename: 'before.ts' }))
    act(() => dispatchToolAction({ type: 'open-file', content: 'after', filename: 'after.ts' }))
    expect(editors().map((editor) => editor.value)).toEqual(['before', 'after'])
    expect(screen.getByText('before.ts')).toBeInTheDocument()
    expect(screen.getByText('after.ts')).toBeInTheDocument()
  })

  it('keeps layout and syntax options behind a disclosure', () => {
    renderTool(DiffViewer)
    const toggle = screen.getByRole('button', { name: /Options/ })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Layout')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Layout')).toHaveValue('side-by-side')
    expect(screen.getByLabelText('Syntax')).toHaveValue('plaintext')
  })

  // "Ignore WS" and "JSON" were raw checkboxes with cryptic labels.
  it('exposes the comparison switches as labelled toggles', () => {
    renderTool(DiffViewer)
    openOptions()

    const ignoreWhitespace = screen.getByRole('switch', { name: 'Ignore whitespace' })
    expect(ignoreWhitespace).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(ignoreWhitespace)
    expect(screen.getByRole('switch', { name: 'Ignore whitespace' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('switch', { name: 'Normalize JSON' })).toBeInTheDocument()
  })

  it('populates both editors from the sample and drops the prompt once content exists', () => {
    renderTool(DiffViewer)
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }))

    const [left, right] = editors()
    expect(left!.value).toContain('function greet(name) {')
    expect(right!.value).toContain('function greet(name, punctuation')
    expect(screen.queryByRole('button', { name: 'Load sample' })).not.toBeInTheDocument()
  })

  it('disables Compare and Swap until there is something to work with', () => {
    renderTool(DiffViewer)
    expect(screen.getByRole('button', { name: /Compare/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Swap/ })).toBeDisabled()
  })

  it('swaps the two sides', () => {
    renderTool(DiffViewer)
    fillBothSides('AAA', 'BBB')

    fireEvent.click(screen.getByRole('button', { name: /Swap/ }))

    const [left, right] = editors()
    expect(left!.value).toBe('BBB')
    expect(right!.value).toBe('AAA')
  })

  it('clears one side without touching the other', () => {
    renderTool(DiffViewer)
    fillBothSides('AAA', 'BBB')

    fireEvent.click(screen.getByRole('button', { name: 'Clear left' }))

    const [left, right] = editors()
    expect(left!.value).toBe('')
    expect(right!.value).toBe('BBB')
  })

  it('switches which panes are on screen', () => {
    renderTool(DiffViewer)
    expect(editors()).toHaveLength(2)

    fireEvent.click(screen.getByRole('radio', { name: 'Diff' }))
    expect(screen.queryAllByTestId('monaco-editor')).toHaveLength(0)

    fireEvent.click(screen.getByRole('radio', { name: 'Editors' }))
    expect(editors()).toHaveLength(2)
    expect(screen.queryByRole('region', { name: 'Diff result' })).not.toBeInTheDocument()
  })

  // ── Worker round-trip ────────────────────────────────────────────
  // A no-op worker mock never resolves computeDiff, so the patch never
  // populates — these only pass against the real `diff` package output.

  it('computes a real unified patch while leaving the editors on screen', async () => {
    renderTool(DiffViewer)
    fillBothSides()
    fireEvent.click(screen.getByRole('button', { name: /Compare/ }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Diff result' })).toBeInTheDocument()
    })
    // The old tool replaced the editors with the diff, so the 600ms
    // auto-compare yanked the editing surface away mid-keystroke.
    expect(editors()).toHaveLength(2)

    openOptions()
    expect(screen.getByRole('button', { name: 'Copy patch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save patch/ })).toBeEnabled()
  })

  it('reports the change counts as text and to screen readers', async () => {
    renderTool(DiffViewer)
    fillBothSides()
    fireEvent.click(screen.getByRole('button', { name: /Compare/ }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 line added, 1 line removed')
    })
    expect(screen.getByRole('status')).toHaveTextContent('+1')
  })

  it('says so plainly when both sides match', async () => {
    renderTool(DiffViewer)
    fillBothSides('same\n', 'same\n')

    await waitFor(() => {
      expect(screen.getByText('No differences')).toBeInTheDocument()
    })
    expect(screen.getByRole('status')).toHaveTextContent('Both sides are identical')
  })

  it('only announces a comparison the user asked for', async () => {
    renderTool(DiffViewer)
    useUiStore.setState({ lastAction: null })
    fillBothSides()

    // The debounced auto-compare used to toast on every keystroke.
    await new Promise((resolve) => setTimeout(resolve, 700))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Diff result' })).toBeTruthy())
    expect(useUiStore.getState().lastAction).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Compare/ }))
    await waitFor(() => {
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Diff computed',
        type: 'success',
      })
    })
  })

  // ⌘↵ on an empty tool used to leave the "announce" flag set, so the *next*
  // debounced auto-compare toasted while the user was still typing.
  it('does not let an unanswerable shortcut press arm a later auto-compare toast', async () => {
    renderTool(DiffViewer)
    useUiStore.setState({ lastAction: null })

    pressCompareShortcut()
    fillBothSides()

    await waitFor(() => expect(screen.getByRole('region', { name: 'Diff result' })).toBeTruthy())
    expect(useUiStore.getState().lastAction).toBeNull()
  })

  // The Compare button is disabled with one side empty; the shortcut has no
  // such affordance and used to render a whole-file deletion instead.
  it('ignores the shortcut until both sides have content', async () => {
    renderTool(DiffViewer)
    const [left] = editors()
    fireEvent.change(left!, { target: { value: 'only the left side\n' } })

    pressCompareShortcut()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByRole('region', { name: 'Diff result' })).not.toBeInTheDocument()

    const [, right] = editors()
    fireEvent.change(right!, { target: { value: 'only the left side changed\n' } })
    pressCompareShortcut()
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Diff result' })).toBeInTheDocument()
    })
  })

  it('treats indentation-only changes as identical once whitespace is ignored', async () => {
    renderTool(DiffViewer)
    openOptions()
    fillBothSides('  const a = 1\n', 'const a = 1\n')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 line added'))

    fireEvent.click(screen.getByRole('switch', { name: 'Ignore whitespace' }))

    // Header-only patches used to leave a blank pane and an enabled Save button.
    await waitFor(() => expect(screen.getByText('No differences')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Save patch/ })).toBeDisabled()
  })

  it('writes the patch out through the shared export helper', async () => {
    renderTool(DiffViewer)
    fillBothSides()
    fireEvent.click(screen.getByRole('button', { name: /Compare/ }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Diff result' })).toBeTruthy())

    openOptions()
    fireEvent.click(screen.getByRole('button', { name: /Save patch/ }))

    await waitFor(() => {
      expect(exportFile).toHaveBeenCalledWith(
        expect.stringContaining('+line TWO'),
        'text-changes.patch'
      )
    })
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Saved /tmp/changes.patch',
      type: 'success',
    })
  })

  it('shows the diff on its own when the editors are hidden', async () => {
    renderTool(DiffViewer)
    fillBothSides()
    await waitFor(() => expect(screen.getByRole('region', { name: 'Diff result' })).toBeTruthy())

    fireEvent.click(screen.getByRole('radio', { name: 'Diff' }))
    expect(screen.queryAllByTestId('monaco-editor')).toHaveLength(0)
    expect(screen.getByRole('region', { name: 'Diff result' })).toBeInTheDocument()
  })
})

describe('diff helpers', () => {
  it('counts added and removed lines without the patch headers', () => {
    const patch = [
      '--- left',
      '+++ right',
      '@@ -1,2 +1,2 @@',
      ' context',
      '-gone',
      '+added',
      '+also added',
    ].join('\n')
    expect(parseDiffStats(patch)).toEqual({ additions: 2, deletions: 1 })
    expect(parseDiffStats('')).toEqual({ additions: 0, deletions: 0 })
  })

  it('describes the comparison in words', () => {
    expect(describeDiff(null, false)).toBe('No comparison yet')
    expect(describeDiff({ additions: 3, deletions: 0 }, true)).toBe('Both sides are identical')
    expect(describeDiff({ additions: 1, deletions: 2 }, false)).toBe(
      '1 line added, 2 lines removed'
    )
  })
})

// The comparison pane used to take half the window before there was anything to
// compare, so the largest thing on screen was an empty state telling you to use
// the editors it had just squashed.
describe('DiffViewer — uncompared layout', () => {
  it('reduces the comparison pane to a single prompt line in split view', () => {
    renderTool(DiffViewer)

    const grid = document.querySelector('.grid')
    expect(grid?.className).toContain('grid-rows-[1fr_auto]')
    expect(screen.getByText(/Paste the original on the left/)).toBeInTheDocument()
    // The full-pane empty state belongs to the diff-only view, not this one.
    expect(screen.queryByText('Nothing to compare')).not.toBeInTheDocument()
  })

  it('gives the comparison half the window once there is a result', async () => {
    renderTool(DiffViewer)
    fillBothSides()
    pressCompareShortcut()

    await waitFor(() => {
      expect(document.querySelector('.grid')?.className).toContain('grid-rows-2')
    })
  })

  it('keeps the full empty state in the diff-only view, where the pane is all there is', () => {
    renderTool(DiffViewer)
    fireEvent.click(screen.getByRole('radio', { name: 'Diff' }))

    expect(screen.getByText('Nothing to compare')).toBeInTheDocument()
  })
})
