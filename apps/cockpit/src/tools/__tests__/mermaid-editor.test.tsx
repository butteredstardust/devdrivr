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
})
