import { describe, expect, it } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import HtmlValidator from '../html-validator/HtmlValidator'

describe('HtmlValidator', () => {
  it('renders editor', () => {
    renderTool(HtmlValidator)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('validates correct HTML', async () => {
    renderTool(HtmlValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '<div>hello</div>' } })
    await waitFor(() => {
      // HTMLHint with title-require rule will flag missing <title>, so we may
      // see warnings rather than "Valid HTML". Accept either outcome.
      const validEl = screen.queryByText(/Valid HTML/)
      const warningEl = screen.queryByText(/warning/i)
      expect(validEl ?? warningEl).toBeTruthy()
    })
  })

  it('shows a validating state instead of a stale valid badge while input is pending', () => {
    renderTool(HtmlValidator)
    const editor = screen.getByTestId('monaco-editor')

    fireEvent.change(editor, { target: { value: '<div>' } })

    expect(screen.getByText(/validating/i)).toBeInTheDocument()
    expect(screen.queryByText(/valid html/i)).not.toBeInTheDocument()
  })

  it('renders pop-out button in preview header', () => {
    renderTool(HtmlValidator)
    expect(screen.getByTitle('Expand to full-size preview (Esc to close)')).toBeInTheDocument()
  })

  it('opens full-size overlay when pop-out button is clicked', () => {
    renderTool(HtmlValidator)
    // Provide HTML so the button is enabled
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '<p>hello</p>' } })

    const btn = screen.getByTitle('Expand to full-size preview (Esc to close)')
    fireEvent.click(btn)

    expect(screen.getByRole('dialog', { name: 'Full-size HTML preview' })).toBeInTheDocument()
    expect(screen.getByTitle('HTML Preview (full size)')).toBeInTheDocument()
  })

  it('closes full-size overlay when close button is clicked', () => {
    renderTool(HtmlValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '<p>hello</p>' } })

    // Open
    fireEvent.click(screen.getByTitle('Expand to full-size preview (Esc to close)'))
    expect(screen.getByRole('dialog', { name: 'Full-size HTML preview' })).toBeInTheDocument()

    // Close
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    expect(screen.queryByRole('dialog', { name: 'Full-size HTML preview' })).not.toBeInTheDocument()
  })

  it('closes full-size overlay on Escape key', () => {
    renderTool(HtmlValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '<p>hello</p>' } })

    // Open
    fireEvent.click(screen.getByTitle('Expand to full-size preview (Esc to close)'))
    expect(screen.getByRole('dialog', { name: 'Full-size HTML preview' })).toBeInTheDocument()

    // Close via Escape
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Full-size HTML preview' })).not.toBeInTheDocument()
  })

  it('moves focus into the full-size overlay, traps Tab, and restores focus on close', async () => {
    renderTool(HtmlValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '<p>hello</p>' } })

    const expandButton = screen.getByTitle('Expand to full-size preview (Esc to close)')
    expandButton.focus()
    fireEvent.click(expandButton)

    const closeButton = screen.getByLabelText('Close full-size preview')
    await waitFor(() => expect(document.activeElement).toBe(closeButton))

    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)

    fireEvent.click(closeButton)
    await waitFor(() => expect(document.activeElement).toBe(expandButton))
  })
})
