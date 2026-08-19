import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Kbd } from '@/components/shared/Kbd'
import { _resetPlatformCache } from '@/lib/platform'

function setUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true })
  _resetPlatformCache()
}

const originalUserAgent = navigator.userAgent

describe('Kbd', () => {
  beforeEach(() => _resetPlatformCache())
  afterEach(() => setUserAgent(originalUserAgent))

  it('renders mod as the command symbol on macOS', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    render(<Kbd keys="mod+enter" />)
    expect(screen.getByText('⌘↵')).toBeInTheDocument()
  })

  it('renders mod as Ctrl with a separator off macOS', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    render(<Kbd keys="mod+enter" />)
    // The whole point of the component: the same hint can't claim ⌘ on a Windows machine.
    expect(screen.getByText('Ctrl+↵')).toBeInTheDocument()
  })

  it('uppercases single letters', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    render(<Kbd keys="mod+shift+p" />)
    expect(screen.getByText('⌘⇧P')).toBeInTheDocument()
  })

  it('renders a kbd element', () => {
    render(<Kbd keys="escape" />)
    expect(screen.getByText('Esc').tagName).toBe('KBD')
  })

  it('drops the border and fill for the inline variant', () => {
    // Inline hints live inside the button they describe; a box there reads as a nested button.
    const { rerender } = render(<Kbd keys="escape" />)
    expect(screen.getByText('Esc').className).toContain('border')
    rerender(<Kbd keys="escape" variant="inline" />)
    expect(screen.getByText('Esc').className).not.toContain('border')
  })
})
