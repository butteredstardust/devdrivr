import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CsvTools from '@/tools/csv-tools/CsvTools'
import { renderTool } from '@/tools/__tests__/test-utils'

describe('CsvTools', () => {
  it('renders the registered tool shell', () => {
    renderTool(CsvTools)

    expect(screen.getByText('View & Edit')).toBeInTheDocument()
    expect(screen.getByText('Convert')).toBeInTheDocument()
    expect(screen.getByText('Analyze')).toBeInTheDocument()
    expect(screen.getByText('Paste CSV or open a file')).toBeInTheDocument()
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })
})
