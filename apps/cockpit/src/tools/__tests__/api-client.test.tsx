import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import ApiClient from '../api-client/ApiClient'

describe('ApiClient', () => {
  it('renders URL input', () => {
    renderTool(ApiClient)
    expect(screen.getByPlaceholderText(/api\.example\.com/i)).toBeInTheDocument()
  })

  it('renders method selector', () => {
    renderTool(ApiClient)
    expect(screen.getByDisplayValue('GET')).toBeInTheDocument()
  })

  it('renders send button', () => {
    renderTool(ApiClient)
    expect(screen.getByText('Send')).toBeInTheDocument()
  })

  it('renders request tabs', () => {
    renderTool(ApiClient)
    expect(screen.getByText('Params')).toBeInTheDocument()
    expect(screen.getByText('Headers')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })
})
