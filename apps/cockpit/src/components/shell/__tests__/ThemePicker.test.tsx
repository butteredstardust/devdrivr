/**
 * Tests for ThemePicker (P3 — Theme picker with swatches):
 * 1. Grouping — Dark/Light derived from lib/theme.ts, System survives
 * 2. Keyboard grid navigation + Enter/Space to commit
 * 3. Hover preview applies live and reverts on mouse-leave without committing
 * 4. Focus preview applies live and reverts on blur without committing
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemePicker } from '@/components/shell/ThemePicker'
import { getEffectiveTheme } from '@/lib/theme'

beforeEach(() => {
  document.documentElement.className = 'midnight'
})

afterEach(() => {
  cleanup()
  document.documentElement.className = 'midnight'
})

describe('ThemePicker — grouping', () => {
  it('renders System, Dark, and Light as separate groups', () => {
    render(<ThemePicker value="midnight" onChange={vi.fn()} />)

    expect(screen.getByRole('option', { name: 'System' })).toBeInTheDocument()
    const darkGroup = screen.getByRole('group', { name: 'Dark' })
    const lightGroup = screen.getByRole('group', { name: 'Light' })

    // A known dark theme lives in the Dark group, not Light
    expect(
      within(darkGroup).getByRole('option', { name: 'Midnight Interface' })
    ).toBeInTheDocument()
    expect(within(lightGroup).queryByRole('option', { name: 'Midnight Interface' })).toBeNull()

    // A known light theme (per lib/theme.ts isLightEffectiveTheme) lives in Light, not Dark
    expect(within(lightGroup).getByRole('option', { name: 'Soft Focus' })).toBeInTheDocument()
    expect(within(darkGroup).queryByRole('option', { name: 'Soft Focus' })).toBeNull()
  })

  it('marks the committed theme as selected via aria-selected', () => {
    render(<ThemePicker value="dracula" onChange={vi.fn()} />)

    expect(screen.getByRole('option', { name: 'Dracula' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Midnight Interface' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })
})

describe('ThemePicker — keyboard navigation', () => {
  it('ArrowDown moves focus from System into the Dark grid without committing', () => {
    const onChange = vi.fn()
    render(<ThemePicker value="midnight" onChange={onChange} />)

    const system = screen.getByRole('option', { name: 'System' })
    system.focus()
    fireEvent.keyDown(system, { key: 'ArrowDown' })

    expect(document.activeElement).not.toBe(system)
    expect(document.activeElement).toHaveAttribute('role', 'option')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Enter commits the currently focused chip', () => {
    const onChange = vi.fn()
    render(<ThemePicker value="midnight" onChange={onChange} />)

    const target = screen.getByRole('option', { name: 'Dracula' })
    target.focus()
    fireEvent.keyDown(target, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('dracula')
  })

  it('Space commits the currently focused chip', () => {
    const onChange = vi.fn()
    render(<ThemePicker value="midnight" onChange={onChange} />)

    const target = screen.getByRole('option', { name: 'Nord' })
    target.focus()
    fireEvent.keyDown(target, { key: ' ' })

    expect(onChange).toHaveBeenCalledWith('nord')
  })
})

describe('ThemePicker — hover preview', () => {
  it('applies the hovered theme live to <html>', () => {
    render(<ThemePicker value="midnight" onChange={vi.fn()} />)

    const dracula = screen.getByRole('option', { name: 'Dracula' })
    fireEvent.mouseEnter(dracula)

    expect(document.documentElement.classList.contains(getEffectiveTheme('dracula'))).toBe(true)
  })

  it('reverts to the committed theme on mouse-leave without calling onChange', () => {
    const onChange = vi.fn()
    render(<ThemePicker value="midnight" onChange={onChange} />)

    const dracula = screen.getByRole('option', { name: 'Dracula' })
    fireEvent.mouseEnter(dracula)
    expect(document.documentElement.classList.contains('dracula')).toBe(true)

    fireEvent.mouseLeave(dracula)

    expect(document.documentElement.classList.contains('midnight')).toBe(true)
    expect(document.documentElement.classList.contains('dracula')).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not write to localStorage theme-cache while hovering', () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem')
    render(<ThemePicker value="midnight" onChange={vi.fn()} />)

    const dracula = screen.getByRole('option', { name: 'Dracula' })
    fireEvent.mouseEnter(dracula)
    fireEvent.mouseLeave(dracula)

    expect(setItemSpy).not.toHaveBeenCalledWith('theme-cache', expect.anything())
    setItemSpy.mockRestore()
  })
})

describe('ThemePicker — focus preview', () => {
  it('applies the focused theme live to <html>', () => {
    render(<ThemePicker value="midnight" onChange={vi.fn()} />)

    const nord = screen.getByRole('option', { name: 'Nord' })
    fireEvent.focus(nord)

    expect(document.documentElement.classList.contains('nord')).toBe(true)
  })

  it('reverts to the committed theme on blur without calling onChange', () => {
    const onChange = vi.fn()
    render(<ThemePicker value="midnight" onChange={onChange} />)

    const nord = screen.getByRole('option', { name: 'Nord' })
    fireEvent.focus(nord)
    expect(document.documentElement.classList.contains('nord')).toBe(true)

    fireEvent.blur(nord)

    expect(document.documentElement.classList.contains('midnight')).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })
})
