import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DocsBrowser, { siteLabel } from '@/tools/docs-browser/DocsBrowser'

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn().mockResolvedValue({ status: 200 }),
}))

describe('siteLabel', () => {
  it('names the site the tool is actually pointed at', () => {
    expect(siteLabel('https://devdocs.io')).toBe('devdocs.io')
    expect(siteLabel('https://developer.mozilla.org/en-US/')).toBe('developer.mozilla.org')
  })

  it('drops a www. prefix, which is noise in chrome this small', () => {
    expect(siteLabel('https://www.example.com/docs')).toBe('example.com')
  })

  it('falls back to the raw source when there is no hostname to show', () => {
    expect(siteLabel('about:blank')).toBe('about:blank')
    expect(siteLabel('not a url')).toBe('not a url')
  })
})

describe('DocsBrowser', () => {
  it('labels the default source', () => {
    render(<DocsBrowser />)
    expect(screen.getByText('devdocs.io')).toBeInTheDocument()
  })

  // The label, the external link and the iframe title were all hardcoded to DevDocs while
  // `frameSrc` was a prop, so any other source produced chrome naming the wrong site.
  it('follows frameSrc rather than naming DevDocs regardless', () => {
    render(<DocsBrowser frameSrc="https://developer.mozilla.org/" />)

    expect(screen.getByText('developer.mozilla.org')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open externally' })).toHaveAttribute(
      'href',
      'https://developer.mozilla.org/'
    )
    expect(document.querySelector('iframe')).toHaveAttribute(
      'title',
      'developer.mozilla.org documentation'
    )
  })

  it('renders iframe', () => {
    render(<DocsBrowser frameSrc="about:blank" />)
    const iframe = document.querySelector('iframe')
    expect(iframe).toBeInTheDocument()
  })

  it('shows a loading state until the iframe finishes loading', () => {
    render(<DocsBrowser frameSrc="about:blank" />)
    const iframe = document.querySelector('iframe')!

    expect(screen.getByText(/loading about:blank/i)).toBeInTheDocument()

    fireEvent.load(iframe)

    expect(screen.queryByText(/loading about:blank/i)).not.toBeInTheDocument()
  })

  it('shows a retry fallback when the iframe fails to load', async () => {
    render(<DocsBrowser frameSrc="about:blank" defaultLoadError />)

    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText(/loading about:blank/i)).toBeInTheDocument())
  })
})
