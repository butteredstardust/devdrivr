import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FrogMascot, SPRITE } from '@/components/shell/FrogMascot'

afterEach(cleanup)

/**
 * jsdom does not run CSS animations, so nothing here can prove the frog *moves* — that was checked
 * in Chromium against the rest, blink and hop poses. What these do cover is the part that silently
 * rots: the sprite grid staying rectangular, the eyelids staying on top of the eyes, and the
 * animation names staying scoped so a second mascot on screen cannot capture them.
 */
describe('FrogMascot', () => {
  it('exposes the sprite as an image with a name', () => {
    render(<FrogMascot />)
    const svg = screen.getByRole('img', { name: 'Pixel-art frog mascot, idling' })
    expect(svg.tagName.toLowerCase()).toBe('svg')
  })

  it('scopes its keyframe names so two frogs do not fight over one animation', () => {
    const { container } = render(
      <>
        <FrogMascot />
        <FrogMascot />
      </>
    )
    const styles = [...container.querySelectorAll('style')].map((el) => el.textContent ?? '')
    expect(styles).toHaveLength(2)

    // The character class is the assertion: a scope built straight from `useId` would contain
    // colons under React 18, which would silently invalidate every selector below it.
    const hopName = (css: string) => /@keyframes (frog-[a-zA-Z0-9]+-hop)\b/.exec(css)?.[1]
    expect(hopName(styles[0]!)).toBeDefined()
    expect(hopName(styles[1]!)).toBeDefined()
    expect(hopName(styles[0]!)).not.toBe(hopName(styles[1]!))

    // And the generated rules must actually reference the scoped names they define.
    expect(styles[0]).toContain(`animation: ${hopName(styles[0]!)} 7.2s`)
  })

  it('draws the eyelids directly over the eyes', () => {
    const { container } = render(<FrogMascot />)
    const lids = container.querySelectorAll('[class*="-lid"]')
    expect(lids).toHaveLength(2)

    // The pupils live at x=7 and x=27, y=2 in sprite coordinates (4×3 blocks, rows 2–4). If the
    // sprite is edited without moving EYES to match, the lid closes over the frog's forehead.
    const covered = [...lids].map((lid) => {
      const rect = lid.querySelector('rect')!
      return `${rect.getAttribute('x')},${rect.getAttribute('y')}`
    })
    expect(covered).toEqual(['7,2', '27,2'])
  })

  it('keeps the sprite grid rectangular and mirror-symmetric', () => {
    // Hand-edited pixel art rots in exactly two ways: a row drifts off the grid width, or an edit
    // lands on one side only. Both are cheap to assert against the exported grid directly.
    const width = SPRITE[0]!.length
    expect(width).toBeGreaterThan(0)
    for (const [, row] of SPRITE.entries()) {
      expect(row.length).toBe(width)
      for (let c = 0; c < width; c++) {
        expect(row[c]).toBe(row[width - 1 - c])
      }
    }
  })

  it('honours the size prop and keeps the sprite aspect ratio', () => {
    const { container } = render(<FrogMascot size={74} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('74')
    // 23 sprite rows + 12 rows of headroom for the hop and shadow, over 38 columns.
    expect(svg.getAttribute('height')).toBe(String(Math.round((74 / 38) * 35)))
    expect(svg.getAttribute('viewBox')).toBe('0 -8 38 35')
  })
})
