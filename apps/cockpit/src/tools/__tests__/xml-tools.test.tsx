import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import XmlTools from '../xml-tools/XmlTools'

describe('XmlTools', () => {
  it('renders tab bar', () => {
    renderTool(XmlTools)
    expect(screen.getByText('Lint & Format')).toBeInTheDocument()
    expect(screen.getByText('Tree View')).toBeInTheDocument()
    expect(screen.getByText('XPath')).toBeInTheDocument()
  })

  it('renders editor in Lint tab', () => {
    renderTool(XmlTools)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows Format and Validate buttons', () => {
    renderTool(XmlTools)
    expect(screen.getByText('Format')).toBeInTheDocument()
    expect(screen.getByText('Validate')).toBeInTheDocument()
  })

  it('switches to XPath tab', () => {
    renderTool(XmlTools)
    fireEvent.click(screen.getByText('XPath'))
    expect(screen.getByPlaceholderText(/xpath/i)).toBeInTheDocument()
  })
})
