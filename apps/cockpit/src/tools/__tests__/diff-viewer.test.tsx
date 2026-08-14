import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import DiffViewer from '../diff-viewer/DiffViewer'

describe('DiffViewer', () => {
  it('renders both editor panels', () => {
    renderTool(DiffViewer)
    expect(screen.getByText('Left (original)')).toBeInTheDocument()
    expect(screen.getByText('Right (modified)')).toBeInTheDocument()
  })

  it('renders compare button', () => {
    renderTool(DiffViewer)
    expect(screen.getByText('Compare')).toBeInTheDocument()
  })

  it('renders swap button', () => {
    renderTool(DiffViewer)
    expect(screen.getByText(/Swap/)).toBeInTheDocument()
  })

  it('renders language selector', () => {
    renderTool(DiffViewer)
    expect(screen.getByDisplayValue('Plain Text')).toBeInTheDocument()
  })

  it('renders mode selector', () => {
    renderTool(DiffViewer)
    expect(screen.getByDisplayValue('Side by Side')).toBeInTheDocument()
  })

  it('populates both editors from Load Sample and hides the button once content exists', () => {
    renderTool(DiffViewer)
    expect(screen.getByText('Load Sample')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Load Sample'))

    const [left, right] = screen.getAllByTestId('monaco-editor')
    expect((left as HTMLTextAreaElement).value).toContain('function greet(name) {')
    expect((right as HTMLTextAreaElement).value).toContain('function greet(name, punctuation')
    expect(screen.queryByText('Load Sample')).not.toBeInTheDocument()
  })

  // ── Worker round-trip ────────────────────────────────────────────
  // A no-op worker mock never resolves computeDiff, so diffHtml/rawPatch
  // never populate and the editors never disappear — this only passes
  // against the real `diff` package output via the RPC mock.

  it('computes a real unified patch and swaps to the diff view', async () => {
    renderTool(DiffViewer)
    const [left, right] = screen.getAllByTestId('monaco-editor')

    fireEvent.change(left!, { target: { value: 'line one\nline two\n' } })
    fireEvent.change(right!, { target: { value: 'line one\nline TWO\n' } })
    fireEvent.click(screen.getByText('Compare'))

    await waitFor(() => {
      expect(screen.queryByText('Left (original)')).not.toBeInTheDocument()
    })
    // Only set once rawPatch holds real output from the worker's computeDiff call.
    expect(screen.getByText('Copy patch')).toBeInTheDocument()
  })
})
