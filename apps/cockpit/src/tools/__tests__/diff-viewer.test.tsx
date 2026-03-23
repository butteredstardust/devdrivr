import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
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
})
