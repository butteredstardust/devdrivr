import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DocsBrowser from '../docs-browser/DocsBrowser'

describe('DocsBrowser', () => {
  it('renders DevDocs label', () => {
    render(<DocsBrowser frameSrc="about:blank" />)
    expect(screen.getByText('DevDocs.io')).toBeInTheDocument()
  })

  it('renders iframe', () => {
    render(<DocsBrowser frameSrc="about:blank" />)
    const iframe = document.querySelector('iframe')
    expect(iframe).toBeInTheDocument()
  })

  it('shows a loading state until the iframe finishes loading', () => {
    render(<DocsBrowser frameSrc="about:blank" />)
    const iframe = document.querySelector('iframe')!

    expect(screen.getByText(/loading devdocs/i)).toBeInTheDocument()

    fireEvent.load(iframe)

    expect(screen.queryByText(/loading devdocs/i)).not.toBeInTheDocument()
  })

  it('shows a retry fallback when the iframe fails to load', async () => {
    render(<DocsBrowser frameSrc="about:blank" defaultLoadError />)

    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText(/loading devdocs/i)).toBeInTheDocument())
  })
})
