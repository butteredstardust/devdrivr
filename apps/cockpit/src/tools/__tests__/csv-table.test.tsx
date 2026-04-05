import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CsvTable from '../csv-tools/CsvTable'

const sampleData = [
  { name: 'Alice', age: 30, city: 'NYC' },
  { name: 'Bob', age: 25, city: 'LA' },
]

describe('CsvTable', () => {
  it('renders table with data', () => {
    render(<CsvTable data={sampleData} />)

    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('age')).toBeInTheDocument()
    expect(screen.getByText('city')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows column count and row count', () => {
    render(<CsvTable data={sampleData} />)

    expect(screen.getByText(/3 cols/)).toBeInTheDocument()
    expect(screen.getByText(/2 rows/)).toBeInTheDocument()
  })

  it('renders sort indicator when header clicked', () => {
    render(<CsvTable data={sampleData} />)

    const ageHeader = screen.getByText('age')
    fireEvent.click(ageHeader)

    // After clicking, a sort indicator should appear
    const hasIndicator =
      screen.queryByText('\u2191') !== null || screen.queryByText('\u2193') !== null
    expect(hasIndicator).toBe(true)
  })
})
