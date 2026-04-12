import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CsvAnalyze from '../csv-tools/CsvAnalyze'

const sampleData = [
  { name: 'Alice', age: 30, score: 95.5 },
  { name: 'Bob', age: 25, score: 88 },
]

const originalClipboard = navigator.clipboard

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, writable: true })
})

describe('CsvAnalyze', () => {
  it('renders column statistics', () => {
    render(<CsvAnalyze data={sampleData} />)

    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('age')).toBeInTheDocument()
    expect(screen.getByText('score')).toBeInTheDocument()
  })

  it('shows TypeScript schema generation button', () => {
    render(<CsvAnalyze data={sampleData} />)

    // Need to expand the Schema Generation panel first
    fireEvent.click(screen.getByText('Schema Generation'))

    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('shows null percentage for columns with missing values', () => {
    const dataWithNulls = [
      { name: 'Alice', score: 95 },
      { name: '', score: 88 },
      { name: 'Charlie', score: 72 },
      { name: null, score: null },
    ]
    render(<CsvAnalyze data={dataWithNulls as Record<string, unknown>[]} />)
    // 2 of 4 name values are null/empty → 50.0%
    expect(screen.getByText(/Nulls: 2 \(50\.0%\)/)).toBeInTheDocument()
  })

  it('generates TypeScript interface', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
    })

    const onSchemaGenerated = vi.fn()
    render(<CsvAnalyze data={sampleData} onSchemaGenerated={onSchemaGenerated} />)

    // Expand Schema Generation panel
    fireEvent.click(screen.getByText('Schema Generation'))

    const tsButton = screen.getByText('TypeScript')
    fireEvent.click(tsButton)

    expect(onSchemaGenerated).toHaveBeenCalledWith(expect.stringContaining('interface CsvRow'))
  })
})
