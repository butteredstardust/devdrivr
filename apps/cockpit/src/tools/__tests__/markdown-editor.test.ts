import { describe, expect, it } from 'vitest'
import { scrollRatio, applyRatio } from '../markdown-editor/hooks/useScrollSync'
import { getImageMimeType, uint8ToBase64 } from '../markdown-editor/hooks/useImageDrop'

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

// ─── Image Drop Helpers ─────────────────────────────────────────────

describe('getImageMimeType', () => {
  it('returns image/png for .png files', () => {
    expect(getImageMimeType('screenshot.png')).toBe('image/png')
  })

  it('returns image/jpeg for .jpg files', () => {
    expect(getImageMimeType('photo.jpg')).toBe('image/jpeg')
  })

  it('returns image/jpeg for .jpeg files', () => {
    expect(getImageMimeType('photo.jpeg')).toBe('image/jpeg')
  })

  it('returns image/gif for .gif files', () => {
    expect(getImageMimeType('anim.gif')).toBe('image/gif')
  })

  it('returns image/webp for .webp files', () => {
    expect(getImageMimeType('hero.webp')).toBe('image/webp')
  })

  it('returns image/svg+xml for .svg files', () => {
    expect(getImageMimeType('icon.svg')).toBe('image/svg+xml')
  })

  it('returns null for non-image files', () => {
    expect(getImageMimeType('readme.md')).toBeNull()
  })

  it('returns null for files with no extension', () => {
    expect(getImageMimeType('Makefile')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(getImageMimeType('PHOTO.PNG')).toBe('image/png')
  })
})

describe('uint8ToBase64', () => {
  it('encodes empty array to empty string', () => {
    expect(uint8ToBase64(new Uint8Array([]))).toBe('')
  })

  it('encodes bytes correctly', () => {
    // "Hello" in ASCII = [72, 101, 108, 108, 111]
    const bytes = new Uint8Array([72, 101, 108, 108, 111])
    expect(uint8ToBase64(bytes)).toBe('SGVsbG8=')
  })
})
