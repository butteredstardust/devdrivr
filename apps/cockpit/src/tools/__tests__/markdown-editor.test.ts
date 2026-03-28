import { describe, expect, it } from 'vitest'
import { scrollRatio, applyRatio } from '../markdown-editor/hooks/useScrollSync'

// ─── Scroll Sync Helpers ────────────────────────────────────────────

describe('scrollRatio', () => {
  it('returns 0 when scrolled to top', () => {
    expect(scrollRatio(0, 1000, 500)).toBe(0)
  })

  it('returns 1 when scrolled to bottom', () => {
    expect(scrollRatio(500, 1000, 500)).toBe(1)
  })

  it('returns 0.5 when scrolled to middle', () => {
    expect(scrollRatio(250, 1000, 500)).toBe(0.5)
  })

  it('returns 0 when content fits without scrollbar', () => {
    expect(scrollRatio(0, 500, 500)).toBe(0)
  })

  it('clamps to 1 when scrollTop exceeds max', () => {
    expect(scrollRatio(600, 1000, 500)).toBe(1)
  })
})

describe('applyRatio', () => {
  it('returns 0 for ratio 0', () => {
    expect(applyRatio(0, 2000, 600)).toBe(0)
  })

  it('returns max scrollTop for ratio 1', () => {
    expect(applyRatio(1, 2000, 600)).toBe(1400)
  })

  it('returns proportional scrollTop for ratio 0.5', () => {
    expect(applyRatio(0.5, 2000, 600)).toBe(700)
  })

  it('returns 0 when content fits without scrollbar', () => {
    expect(applyRatio(0.5, 600, 600)).toBe(0)
  })
})
