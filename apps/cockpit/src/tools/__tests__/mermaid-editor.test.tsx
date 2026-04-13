import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import MermaidEditor from '../mermaid-editor/MermaidEditor'

describe('MermaidEditor', () => {
  it('renders editor', () => {
    renderTool(MermaidEditor)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('renders template buttons', () => {
    renderTool(MermaidEditor)
    expect(screen.getByText('flowchart')).toBeInTheDocument()
    expect(screen.getByText('sequence')).toBeInTheDocument()
  })

  it('renders copy buttons', () => {
    renderTool(MermaidEditor)
    expect(screen.getByText('Copy SVG')).toBeInTheDocument()
    expect(screen.getByText('Copy PNG')).toBeInTheDocument()
    expect(screen.getByText('Copy Source')).toBeInTheDocument()
  })

  it('renders export scale selector with all options', () => {
    renderTool(MermaidEditor)
    expect(screen.getByTitle('Export PNG at 1× resolution')).toBeInTheDocument()
    expect(screen.getByTitle('Export PNG at 2× resolution')).toBeInTheDocument()
    expect(screen.getByTitle('Export PNG at 3× resolution')).toBeInTheDocument()
    expect(screen.getByTitle('Export PNG at 4× resolution')).toBeInTheDocument()
  })

  it('defaults to 2× export scale', () => {
    renderTool(MermaidEditor)
    const btn2x = screen.getByTitle('Export PNG at 2× resolution')
    expect(btn2x.className).toContain('text-[var(--color-accent)]')
  })

  it('renders zoom badge showing 100%', () => {
    renderTool(MermaidEditor)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})
