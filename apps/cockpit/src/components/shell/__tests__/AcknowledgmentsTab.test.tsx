import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AcknowledgmentsTab } from '@/components/shell/AcknowledgmentsTab'
import { CARGO_DEPENDENCIES, FONTS, NPM_DEPENDENCIES, licenseKeysFor } from '@/lib/acknowledgments'
import { LICENSE_TEXTS } from '@/lib/license-texts'

afterEach(cleanup)

describe('AcknowledgmentsTab', () => {
  it('credits every direct dependency from both package managers', () => {
    render(<AcknowledgmentsTab />)

    for (const dep of [...NPM_DEPENDENCIES, ...CARGO_DEPENDENCIES, ...FONTS]) {
      expect(screen.getAllByText(dep.name).length).toBeGreaterThan(0)
    }
  })

  it('filters by package, license and author', () => {
    render(<AcknowledgmentsTab />)
    const filter = screen.getByRole('searchbox', { name: 'Filter acknowledgments' })

    fireEvent.change(filter, { target: { value: 'zustand' } })
    expect(screen.getByText('zustand')).toBeInTheDocument()
    expect(screen.queryByText('react-dom')).not.toBeInTheDocument()

    fireEvent.change(filter, { target: { value: 'BSD-3-Clause' } })
    expect(screen.getByText('diff')).toBeInTheDocument()

    fireEvent.change(filter, { target: { value: 'tokio contributors' } })
    expect(screen.getByText('tokio')).toBeInTheDocument()
    expect(screen.queryByText('zustand')).not.toBeInTheDocument()
  })

  it('explains an empty filter result instead of showing a blank tab', () => {
    render(<AcknowledgmentsTab />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter acknowledgments' }), {
      target: { value: 'no-such-package' },
    })

    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('reproduces the full text of every licence its dependencies are offered under', () => {
    render(<AcknowledgmentsTab />)

    const declared = new Set(
      [...NPM_DEPENDENCIES, ...CARGO_DEPENDENCIES, ...FONTS].flatMap((dep) =>
        licenseKeysFor(dep.license)
      )
    )

    // No exceptions: every licence any dependency is offered under has its text carried.
    const missing = [...declared].filter((key) => !(key in LICENSE_TEXTS))
    expect(missing).toEqual([])

    for (const key of declared) {
      if (!(key in LICENSE_TEXTS)) continue
      // Scoped to `summary`: the bare key also appears on every package's licence badge, so a
      // plain getByText matches dozens of nodes for a common one like MIT.
      const disclosure = screen.getByText(key, { selector: 'summary > span' }).closest('details')
      expect(disclosure).not.toBeNull()
      // The text ships in the DOM even while collapsed, which is what the notice requirement needs.
      expect(within(disclosure!).getByText(/./, { selector: 'pre' }).textContent).toBe(
        LICENSE_TEXTS[key]
      )
    }
  })

  it('does not silently ship an unrecognised SPDX identifier', () => {
    // The guard for `bun add`: a new dependency under a licence we carry no text for shows up here
    // rather than as a quietly incomplete notice on a tab nobody re-reads.
    const known = new Set(Object.keys(LICENSE_TEXTS))
    const unknown = [...NPM_DEPENDENCIES, ...CARGO_DEPENDENCIES, ...FONTS].flatMap((dep) =>
      licenseKeysFor(dep.license).filter((key) => !known.has(key))
    )
    expect(unknown).toEqual([])
  })
})

describe('licenseKeysFor', () => {
  it('splits both spellings of a licence disjunction', () => {
    expect(licenseKeysFor('MIT')).toEqual(['MIT'])
    expect(licenseKeysFor('MIT OR Apache-2.0')).toEqual(['MIT', 'Apache-2.0'])
    expect(licenseKeysFor('MIT/Apache-2.0')).toEqual(['MIT', 'Apache-2.0'])
    expect(licenseKeysFor('Zlib OR Apache-2.0 OR MIT')).toEqual(['Zlib', 'Apache-2.0', 'MIT'])
  })
})
