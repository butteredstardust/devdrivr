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

  it('takes the clear button out of the flow via a wrapper, not via Button.className', () => {
    render(<SearchInput aria-label="Search" value="a" onValueChange={vi.fn()} />)
    const clear = screen.getByRole('button', { name: 'Clear search' })

    // Regression: `absolute` was passed straight to Button, which carries `relative` in its own
    // base classes. Equal specificity, so the stylesheet order decides and `.relative` — emitted
    // last — won. The button stayed in the flow below the field and grew the wrapper, which in
    // turn pushed the magnifier's `top-1/2` off the field. jsdom does not apply the stylesheet,
    // so this asserts the structure that makes the button's position independent of that race.
    expect(clear.className).not.toContain('absolute')
    expect(clear.parentElement?.className).toContain('absolute')
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
