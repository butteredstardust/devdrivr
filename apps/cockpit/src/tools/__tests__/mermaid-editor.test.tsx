import { describe, expect, it } from 'vitest'
import { screen, fireEvent, render } from '@testing-library/react'
import { renderTool } from './test-utils'
import MermaidEditor from '../mermaid-editor/MermaidEditor'

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
})
