import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import DocsBrowser from '../docs-browser/DocsBrowser'

describe('DocsBrowser', () => {
  it('renders DevDocs label', () => {
    renderTool(DocsBrowser)
    expect(screen.getByText(/devdocs/i)).toBeInTheDocument()
  })

  it('renders iframe', () => {
    renderTool(DocsBrowser)
    const iframe = document.querySelector('iframe')
    expect(iframe).toBeInTheDocument()
  })
})
