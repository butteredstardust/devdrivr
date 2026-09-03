import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Mascot, buildTriangles } from '../Mascot'

/** Parses a `points` attribute into [x, y] pairs. */
function parsePoints(polygon: SVGPolygonElement): [number, number][] {
  return (polygon.getAttribute('points') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((pair) => pair.split(',').map(Number) as [number, number])
}

describe('Mascot', () => {
  // Torn down here rather than at the end of each test body: React flushes the
  // effect cleanup at unmount, after the body has returned, and that cleanup
  // still needs the stubbed cancelAnimationFrame to exist.
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders correctly', () => {
    const { container } = render(<Mascot />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 100 100')
  })

  it('has accessible label', () => {
    render(<Mascot />)
    expect(screen.getByLabelText(/dodecastar mascot/i)).toBeInTheDocument()
  })

  it('defaults to 24px and honours an explicit size', () => {
    // About renders this at 112px while the sidebar keeps the 24px default, so the artwork has to
    // scale off one prop rather than off a className the viewBox would ignore.
    const { container: small } = render(<Mascot />)
    expect(small.querySelector('svg')?.getAttribute('width')).toBe('24')
    expect(small.querySelector('svg')?.getAttribute('height')).toBe('24')

    const { container: large } = render(<Mascot size={112} />)
    expect(large.querySelector('svg')?.getAttribute('width')).toBe('112')
    expect(large.querySelector('svg')?.getAttribute('height')).toBe('112')
  })

  it('builds a watertight solid', () => {
    // Every edge of a closed surface belongs to exactly two faces. This is the
    // one property that catches a wrong set of face axes: pick five vertices
    // that are not actually a pentagon and the mesh still renders 60 tidy
    // triangles, it just has a hole in it that only shows up on screen.
    const counts = new Map<string, number>()
    const key = (v: readonly number[]) => v.map((c) => c.toFixed(4)).join(',')

    for (const triangle of buildTriangles()) {
      for (let i = 0; i < 3; i++) {
        const edge = [key(triangle[i]!), key(triangle[(i + 1) % 3]!)].sort().join('|')
        counts.set(edge, (counts.get(edge) ?? 0) + 1)
      }
    }

    const unpaired = [...counts.entries()].filter(([, count]) => count !== 2)
    expect(unpaired).toEqual([])
  })

  it('builds the 60 triangles of a stellated dodecahedron', () => {
    // 12 pentagonal faces, each capped with an apex into 5 triangles. A wrong
    // face-grouping in the geometry builder would land on some other count.
    const { container } = render(<Mascot />)
    expect(container.querySelectorAll('polygon')).toHaveLength(60)
  })

  it('paints only the facets turned toward the viewer', () => {
    // Roughly half of a closed solid faces away at any angle. If back-face
    // culling regressed, every slot would carry geometry and the silhouette
    // would fill in; if the normals were inverted, none would.
    const { container } = render(<Mascot />)
    const painted = [...container.querySelectorAll('polygon')].filter(
      (p) => (p.getAttribute('points') ?? '') !== ''
    )
    expect(painted.length).toBeGreaterThan(10)
    expect(painted.length).toBeLessThan(60)
  })

  it('projects every facet inside the viewBox', () => {
    // The model is normalised against its own furthest vertex, so a change to
    // SPIKE that outgrew the scale factor would clip against the sidebar row
    // rather than error.
    const { container } = render(<Mascot />)
    for (const polygon of container.querySelectorAll('polygon')) {
      for (const [x, y] of parsePoints(polygon)) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(100)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(100)
      }
    }
  })

  it('shades facets by darkening the theme accent, not by fading it', () => {
    // Opaque tones matter as much as themed ones: a translucent facet shows the
    // far side of the solid through the near side.
    const { container } = render(<Mascot />)
    const fills = new Set(
      [...container.querySelectorAll('polygon')]
        .map((p) => p.getAttribute('fill'))
        .filter((fill) => fill !== 'none')
    )

    expect(fills.size).toBeGreaterThan(1)
    for (const fill of fills) {
      expect(fill).toContain('var(--color-accent)')
      expect(fill).not.toContain('transparent')
    }
  })

  it('animates by rewriting the existing polygons, not by remounting them', async () => {
    // The rAF loop writes into fixed DOM slots precisely so React never
    // reconciles 60 nodes per frame. Holding a reference across a frame and
    // finding it both still attached and moved is what proves that.
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const { container } = render(<Mascot />)
    const first = container.querySelector('polygon') as SVGPolygonElement
    const before = first.getAttribute('points')

    // A quarter of the way round, no facet can still be where it started.
    frames[0]?.(performance.now() + 4000)

    expect(container.querySelector('polygon')).toBe(first)
    expect(first.getAttribute('points')).not.toBe(before)
  })

  it('stops and restarts when the reduced-motion preference changes mid-session', () => {
    // Reading the preference once at mount looks correct in every test that
    // renders and unmounts, and is wrong for the only case that matters: a
    // window that was already open when the user reached for the OS setting.
    const rAF = vi.fn(() => 1)
    const cancel = vi.fn()
    vi.stubGlobal('requestAnimationFrame', rAF)
    vi.stubGlobal('cancelAnimationFrame', cancel)

    let matches = false
    const listeners = new Set<() => void>()
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          get matches() {
            return matches
          },
          media: query,
          addEventListener: (_: string, fn: () => void) => listeners.add(fn),
          removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
        }) as unknown as MediaQueryList
    )

    render(<Mascot />)
    expect(rAF).toHaveBeenCalledTimes(1)

    matches = true
    for (const fn of listeners) fn()
    expect(cancel).toHaveBeenCalledTimes(1)

    matches = false
    for (const fn of listeners) fn()
    expect(rAF).toHaveBeenCalledTimes(2)
  })

  it('holds a static pose when the user asked for reduced motion', () => {
    const rAF = vi.fn()
    vi.stubGlobal('requestAnimationFrame', rAF)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: true,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList
    )

    const { container } = render(<Mascot />)
    expect(rAF).not.toHaveBeenCalled()
    // Static, but not blank — the pose rendered at mount is a complete solid.
    expect(container.querySelector('polygon')?.getAttribute('points')).toBeTruthy()
  })
})
