import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { AboutTab } from '@/components/shell/AboutTab'
import { QUOTES, randomQuote } from '@/lib/quotes'

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('9.9.9'),
  getTauriVersion: vi.fn().mockResolvedValue('2.10.3'),
}))

afterEach(cleanup)

describe('AboutTab', () => {
  it('reports the running app version rather than a build-time constant', async () => {
    render(<AboutTab />)

    // Both start as an em dash and only become real once the Tauri promises settle — a synchronous
    // assertion here would pass against the placeholder and never notice a rejected getVersion.
    await waitFor(() => expect(screen.getByText('v9.9.9')).toBeInTheDocument())
    expect(screen.getByText('v2.10.3')).toBeInTheDocument()
  })

  it('shows a quote from the built-in set and swaps it on request', () => {
    render(<AboutTab />)

    const quoted = () =>
      QUOTES.find((quote) => screen.queryByText(`“${quote.text}”`) !== null) ?? null

    const first = quoted()
    expect(first).not.toBeNull()
    expect(screen.getByText(`— ${first!.author}`)).toBeInTheDocument()

    // Shuffling is random, so the only invariant worth asserting is that whatever lands is still
    // one of the 30 — asserting it *changed* would flake 1-in-30 of the time.
    fireEvent.click(screen.getByRole('button', { name: 'Another' }))
    expect(quoted()).not.toBeNull()
  })

  it('copies the resolved versions, not the placeholders', async () => {
    // Patch only `clipboard`: jsdom keeps `userAgent` on the prototype, so replacing the whole
    // navigator object would leave the copied text saying `User agent: undefined`.
    const writeText = vi.fn().mockResolvedValue(undefined)
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    // Restore from a hook, not the end of the body: a failing assertion below would otherwise leave
    // the stub installed for every test after it.
    onTestFinished(() => {
      if (original) Object.defineProperty(navigator, 'clipboard', original)
      else Reflect.deleteProperty(navigator, 'clipboard')
    })

    render(<AboutTab />)
    // Wait for the Tauri promises: copying before they settle is a real state, but a report saying
    // "version unknown" is exactly what this button exists to avoid.
    await waitFor(() => expect(screen.getByText('v9.9.9')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /copy build info/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))

    const copied = writeText.mock.calls[0]![0] as string
    expect(copied).toContain('devdrivr v9.9.9')
    expect(copied).toContain('Tauri v2.10.3')
    expect(copied).toContain(`User agent: ${navigator.userAgent}`)
    expect(copied).not.toContain('unknown')
  })

  it('renders the mascot with an accessible name', () => {
    render(<AboutTab />)
    expect(screen.getByRole('img', { name: /geometric mascot/i })).toBeInTheDocument()
  })
})

describe('randomQuote', () => {
  it('always returns a member of the set', () => {
    for (let i = 0; i < 200; i++) {
      expect(QUOTES).toContain(randomQuote())
    }
  })

  it('re-rolls once when it would repeat the previous quote', () => {
    const previous = QUOTES[0]!
    // Force the first roll to collide, and the retry to land elsewhere.
    const random = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce((QUOTES.length - 1) / QUOTES.length)

    expect(randomQuote(previous)).toBe(QUOTES[QUOTES.length - 1])
    expect(random).toHaveBeenCalledTimes(2)
    random.mockRestore()
  })

  it('has thirty distinct quotes', () => {
    expect(QUOTES).toHaveLength(30)
    expect(new Set(QUOTES.map((q) => q.text)).size).toBe(30)
    expect(QUOTES.every((q) => q.text.length > 0 && q.author.length > 0)).toBe(true)
  })
})
