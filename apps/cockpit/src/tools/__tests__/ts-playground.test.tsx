import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import TsPlayground from '../ts-playground/TsPlayground'

describe('TsPlayground', () => {
  it('renders both editors', () => {
    renderTool(TsPlayground)
    const editors = screen.getAllByTestId('monaco-editor')
    expect(editors.length).toBeGreaterThanOrEqual(2)
  })

  it('renders target and module selects', () => {
    renderTool(TsPlayground)
    const selects = screen.getAllByDisplayValue('ESNext')
    expect(selects).toHaveLength(2)
  })

  it('renders strict checkbox', () => {
    renderTool(TsPlayground)
    expect(screen.getByText('Strict')).toBeInTheDocument()
  })

  it('renders copy output button', () => {
    renderTool(TsPlayground)
    expect(screen.getByText('Copy Output')).toBeInTheDocument()
  })
})
