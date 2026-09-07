import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/cn'

// Each case here is a conflict that shipped to the app, where the caller's class was dropped by
// Tailwind's emit order. A regression re-lands the original visual bug.
describe('cn', () => {
  it('lets a caller position override the primitive base', () => {
    expect(cn('relative inline-flex', 'absolute right-2 top-2.5')).toBe(
      'inline-flex absolute right-2 top-2.5'
    )
  })

  it('lets a caller override the base display', () => {
    expect(cn('inline-flex', 'flex')).toBe('flex')
  })

  it('lets a caller override the base justification', () => {
    expect(cn('items-center justify-center', 'justify-between')).toBe(
      'items-center justify-between'
    )
  })

  // The custom scales are the ones a default config gets wrong: it does not recognise the class,
  // finds no conflict, and keeps both. The assertion fails loudly if the extension is dropped.
  it('resolves the custom --text-2xs scale against the built-in sizes', () => {
    expect(cn('text-xs', 'text-2xs')).toBe('text-2xs')
    expect(cn('text-2xs', 'text-sm')).toBe('text-sm')
  })

  it('resolves the custom --font-ui and --font-brand families', () => {
    expect(cn('font-ui', 'font-mono')).toBe('font-mono')
    expect(cn('font-mono', 'font-brand')).toBe('font-brand')
  })

  it('keeps utilities that do not conflict', () => {
    expect(cn('rounded-none px-3 py-2', 'font-bold text-[var(--color-accent)]')).toBe(
      'rounded-none px-3 py-2 font-bold text-[var(--color-accent)]'
    )
  })

  // `text-[var(--color-error)]` is ambiguous: the `text-` prefix carries both font size and
  // colour. Reading it as a size would drop the `text-2xs` beside it and shrink nothing —
  // a silent regression this suite would otherwise miss.
  it('reads an arbitrary text-[var(--color-*)] as a colour, not a font size', () => {
    expect(cn('text-2xs', 'text-[var(--color-error)]')).toBe('text-2xs text-[var(--color-error)]')
  })

  it('keeps a variant-prefixed class separate from its unprefixed form', () => {
    expect(cn('text-[var(--color-text-muted)]', 'hover:text-[var(--color-success)]')).toBe(
      'text-[var(--color-text-muted)] hover:text-[var(--color-success)]'
    )
  })
})
