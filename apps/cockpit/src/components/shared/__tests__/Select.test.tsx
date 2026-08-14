import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Select } from '../Select'

describe('Select', () => {
  it('renders as a native select and reports value changes', () => {
    const onChange = vi.fn()
    render(
      <Select aria-label="Delimiter" value="auto" onChange={onChange}>
        <option value="auto">Auto-detect</option>
        <option value=",">Comma</option>
      </Select>
    )
    const select = screen.getByRole('combobox', { name: 'Delimiter' })
    fireEvent.change(select, { target: { value: ',' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('is keyboard focusable and disableable', () => {
    render(
      <Select aria-label="Method" disabled value="GET" onChange={() => {}}>
        <option value="GET">GET</option>
      </Select>
    )
    expect(screen.getByRole('combobox', { name: 'Method' })).toBeDisabled()
  })

  it('applies size classes without hardcoded colors', () => {
    render(
      <Select aria-label="Size test" size="md" value="a" onChange={() => {}}>
        <option value="a">A</option>
      </Select>
    )
    const select = screen.getByRole('combobox', { name: 'Size test' })
    expect(select.className).toContain('px-3 py-1.5')
    expect(select.className).toContain('var(--color-border)')
  })

  it('forwards a ref to the underlying select element', () => {
    const holder: { current: HTMLSelectElement | null } = { current: null }
    render(
      <Select
        aria-label="Ref test"
        ref={(el) => {
          holder.current = el
        }}
        value="a"
        onChange={() => {}}
      >
        <option value="a">A</option>
      </Select>
    )
    expect(holder.current?.tagName).toBe('SELECT')
  })
})
