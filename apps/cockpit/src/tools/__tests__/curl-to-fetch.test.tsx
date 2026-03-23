import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import CurlToFetch from '../curl-to-fetch/CurlToFetch'

describe('CurlToFetch', () => {
  it('renders input and output areas', () => {
    renderTool(CurlToFetch)
    expect(screen.getByText('cURL Command')).toBeInTheDocument()
  })

  it('shows output tabs', () => {
    renderTool(CurlToFetch)
    expect(screen.getByText('fetch')).toBeInTheDocument()
    expect(screen.getByText('axios')).toBeInTheDocument()
    expect(screen.getByText('ky')).toBeInTheDocument()
    expect(screen.getByText('XHR')).toBeInTheDocument()
    expect(screen.getByText('Node.js')).toBeInTheDocument()
  })

  it('converts a simple curl command', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: "curl 'https://api.example.com/data'" } })
    expect(screen.getByText('GET')).toBeInTheDocument()
  })

  it('shows error for invalid input', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: 'not a curl command' } })
    expect(screen.getByText(/could not parse/i)).toBeInTheDocument()
  })
})
