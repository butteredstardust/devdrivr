import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import MarkdownEditor from '../markdown-editor/MarkdownEditor'

describe('MarkdownEditor', () => {
  it('renders tab bar', () => {
    renderTool(MarkdownEditor)
    expect(screen.getByText('Split')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('renders editor', () => {
    renderTool(MarkdownEditor)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows word count stats', () => {
    renderTool(MarkdownEditor)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'hello world' } })
    expect(screen.getByText(/2w/)).toBeInTheDocument()
  })

  it('renders export and copy buttons', () => {
    renderTool(MarkdownEditor)
    expect(screen.getByText('Export HTML')).toBeInTheDocument()
    expect(screen.getByText('Copy MD')).toBeInTheDocument()
  })
})
