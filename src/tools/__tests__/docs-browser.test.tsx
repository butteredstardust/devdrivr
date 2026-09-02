import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import DocsBrowser, { siteLabel } from '@/tools/docs-browser/DocsBrowser'

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}))

const probe = vi.mocked(tauriFetch)

beforeEach(() => {
  probe.mockReset()
  probe.mockResolvedValue({ status: 200 } as Response)
})

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

  // NET-04: an iframe's onError does not fire for cross-origin HTTP failures, so without the probe
  // reporting what it saw, a 503 or an auth wall is indistinguishable from a slow page.
  it('names a non-2xx status instead of leaving the frame silently blank', async () => {
    probe.mockResolvedValue({ status: 503 } as Response)
    render(<DocsBrowser />)

    expect(await screen.findByText(/returned HTTP 503/i)).toBeInTheDocument()
    // Still a warning, not a verdict: the page may well frame fine.
    expect(screen.getByText(/may show an error page or stay blank/i)).toBeInTheDocument()
  })

  it('treats a 404 as definitive and says so', async () => {
    probe.mockResolvedValue({ status: 404 } as Response)
    render(<DocsBrowser />)

    expect(await screen.findByText(/returned HTTP 404/i)).toBeInTheDocument()
    expect(screen.getByText(/no document at this address/i)).toBeInTheDocument()
  })

  // CDNs commonly reject HEAD outright; that is not evidence the page cannot load.
  it('does not report failure when the probe itself is rejected', async () => {
    probe.mockRejectedValue(new Error('405 Method Not Allowed'))
    render(<DocsBrowser />)

    await waitFor(() => expect(probe).toHaveBeenCalled())
    expect(screen.queryByText(/returned HTTP/i)).not.toBeInTheDocument()
    expect(screen.getByText(/loading devdocs.io/i)).toBeInTheDocument()
  })

  it('offers the browser as the reliable fallback from every failure state', async () => {
    probe.mockResolvedValue({ status: 500 } as Response)
    render(<DocsBrowser />)

    expect(await screen.findByRole('link', { name: 'Open in browser' })).toHaveAttribute(
      'href',
      'https://devdocs.io'
    )
  })

  // NET-05: a fixed documentation viewer does not need popups, forms or device access.
  it('embeds documentation with the narrow capability set it actually needs', () => {
    render(<DocsBrowser frameSrc="about:blank" />)
    const iframe = document.querySelector('iframe')!

    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer')
  })
})
