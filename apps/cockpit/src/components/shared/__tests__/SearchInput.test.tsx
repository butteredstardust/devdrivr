import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchInput } from '../SearchInput'

describe('SearchInput', () => {
  it('exposes a searchbox, so assistive technology sees a search field', () => {
    render(<SearchInput aria-label="Search notes" value="" onValueChange={vi.fn()} />)
    expect(screen.getByRole('searchbox', { name: 'Search notes' })).toBeInTheDocument()
  })

  it('reports the new value rather than the event', () => {
    const onValueChange = vi.fn()
    render(<SearchInput aria-label="Search" value="" onValueChange={onValueChange} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'yaml' } })
    expect(onValueChange).toHaveBeenCalledWith('yaml')
  })

  it('offers no clear button until there is something to clear', () => {
    const { rerender } = render(
      <SearchInput aria-label="Search" value="" onValueChange={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()

    rerender(<SearchInput aria-label="Search" value="a" onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
  })

  it('clears to an empty string', () => {
    const onValueChange = vi.fn()
    render(<SearchInput aria-label="Search" value="yaml" onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onValueChange).toHaveBeenCalledWith('')
  })

  it('names the clear button after the thing being cleared', () => {
    render(
      <SearchInput
        aria-label="Search"
        clearLabel="Clear notes search"
        value="a"
        onValueChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Clear notes search' })).toBeInTheDocument()
  })

  it('forwards the ref, which the sidebar and snippets both use to focus the field', () => {
    const ref = createRef<HTMLInputElement>()
    render(<SearchInput ref={ref} aria-label="Search" value="" onValueChange={vi.fn()} />)
    ref.current?.focus()
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('passes through the key handler the sidebar uses for Escape and arrow navigation', () => {
    const onKeyDown = vi.fn()
    render(
      <SearchInput aria-label="Search" value="" onValueChange={vi.fn()} onKeyDown={onKeyDown} />
    )
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(onKeyDown).toHaveBeenCalled()
  })

  it('suppresses the native WebKit clear button so only one X renders', () => {
    render(<SearchInput aria-label="Search" value="a" onValueChange={vi.fn()} />)
    // jsdom cannot render the pseudo-element, so this asserts the reset is applied rather than its
    // visual effect — enough to catch the class being dropped in a refactor.
    expect(screen.getByRole('searchbox').className).toContain(
      '[&::-webkit-search-cancel-button]:appearance-none'
    )
  })
})
