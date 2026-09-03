import { useEffect, useRef } from 'react'

// Stellated dodecahedron mascot — the app icon's solid, tumbling in real 3D.
//
// The icon is a dodecahedron with each pentagonal face raised to a point, so the
// mascot builds the same solid from its actual vertices rather than tracing the
// artwork: 20 dodecahedron vertices, grouped into 12 pentagons, each capped with
// an apex, giving 60 triangles. Deriving it means the silhouette stays correct
// from every angle a rotation puts it in, which a traced outline could not do.
//
// Facets are tinted with --color-accent at four fixed opacities rather than the
// icon's five golds. Under the Dodecastar theme the accent *is* the icon's gold,
// so it matches exactly there; under Midnight or Amethyst Haze it picks up that
// theme's accent instead of sitting in the sidebar as a warm spot that belongs
// to a colour scheme the user isn't using.

type Vec3 = [number, number, number]

const PHI = (1 + Math.sqrt(5)) / 2
const SIGNS = [1, -1] as const

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** The 20 vertices of a regular dodecahedron: a cube plus three golden rectangles. */
function dodecahedronVertices(): Vec3[] {
  const v: Vec3[] = []
  const inv = 1 / PHI
  for (const x of SIGNS) for (const y of SIGNS) for (const z of SIGNS) v.push([x, y, z])
  for (const y of SIGNS) for (const z of SIGNS) v.push([0, y * inv, z * PHI])
  for (const x of SIGNS) for (const y of SIGNS) v.push([x * inv, y * PHI, 0])
  for (const x of SIGNS) for (const z of SIGNS) v.push([x * PHI, 0, z * inv])
  return v
}

/**
 * The 12 face normals of a dodecahedron, which are the 12 vertex directions of
 * its dual icosahedron. Each one names a pentagonal face without needing a
 * hand-written face table — the five vertices belonging to it are exactly the
 * five with the largest projection onto the axis, and for a correct axis those
 * five are tied at the maximum while the sixth is strictly behind them.
 *
 * The φ has to sit in the middle slot of each cyclic triple. With it on the
 * outside — `(0, 1, φ)` rather than `(0, φ, 1)` — the axes are still perfectly
 * plausible icosahedral directions, but they point at *vertices* of this
 * dodecahedron instead of face centres. The five-nearest rule then returns a
 * set that is not a face at all: four vertices at one distance and a tie for
 * fifth place. The tell is a solid that is a fraction non-manifold, which shows
 * up on screen as a hole you can see the background through.
 */
function faceAxes(): Vec3[] {
  const a: Vec3[] = []
  for (const y of SIGNS) for (const z of SIGNS) a.push([0, y * PHI, z])
  for (const x of SIGNS) for (const y of SIGNS) a.push([x * PHI, y, 0])
  for (const x of SIGNS) for (const z of SIGNS) a.push([x, 0, z * PHI])
  return a
}

/** How far each face's apex is pushed out, as a multiple of the face's own plane distance. */
const SPIKE = 1.95

/**
 * The 60 triangles of the stellated solid, wound counter-clockwise when seen
 * from outside so a face normal computed per frame points outward and the sign
 * of its z component alone decides visibility.
 *
 * Exported for the test that checks the result is watertight. Nothing about
 * the rendered DOM reveals whether the geometry closes up — a solid missing a
 * facet renders 59 perfectly valid polygons — so the invariant has to be
 * asserted against the mesh itself.
 */
export function buildTriangles(): [Vec3, Vec3, Vec3][] {
  const vertices = dodecahedronVertices()
  const triangles: [Vec3, Vec3, Vec3][] = []

  for (const axis of faceAxes()) {
    const n = normalize(axis)
    const ring = [...vertices].sort((a, b) => dot(b, n) - dot(a, n)).slice(0, 5)

    // Order the ring around the axis. Any face vertex flattened into the face
    // plane serves as the 0° reference; the rest are sorted by their angle from it.
    const first = ring[0] as Vec3
    const planeDistance = dot(first, n)
    const u = normalize([
      first[0] - n[0] * planeDistance,
      first[1] - n[1] * planeDistance,
      first[2] - n[2] * planeDistance,
    ])
    const w = cross(n, u)
    ring.sort((a, b) => Math.atan2(dot(a, w), dot(a, u)) - Math.atan2(dot(b, w), dot(b, u)))

    const apex: Vec3 = [
      n[0] * planeDistance * SPIKE,
      n[1] * planeDistance * SPIKE,
      n[2] * planeDistance * SPIKE,
    ]

    for (let i = 0; i < 5; i++) {
      const a = ring[i] as Vec3
      const b = ring[(i + 1) % 5] as Vec3
      // Fix the winding once, here, instead of taking an absolute value every
      // frame — an inward-facing normal would otherwise light the facet as if
      // the camera were behind the solid.
      const edge1: Vec3 = [b[0] - apex[0], b[1] - apex[1], b[2] - apex[2]]
      const edge2: Vec3 = [a[0] - apex[0], a[1] - apex[1], a[2] - apex[2]]
      triangles.push(dot(cross(edge1, edge2), apex) > 0 ? [apex, b, a] : [apex, a, b])
    }
  }

  return triangles
}

const TRIANGLES = buildTriangles()

/** Half-width of the artwork inside the 100×100 viewBox, leaving a little breathing room. */
const RADIUS = 47
const CENTER = 50

const MODEL_RADIUS = Math.max(...TRIANGLES.flat().map(([x, y, z]) => Math.hypot(x, y, z)))
const SCALE = RADIUS / MODEL_RADIUS

/** Key light, up and to the right — the same direction the icon's highlight comes from. */
const LIGHT = normalize([0.45, 0.62, 0.75])

/**
 * Four discrete tones rather than a continuous ramp. The icon is flat-shaded in
 * five golds and reads as folded paper; a smooth gradient across 60 facets turns
 * to mush at the 24px the sidebar renders this at, where a facet is barely 3px
 * across and its neighbours need to differ visibly or the whole thing greys out.
 *
 * Shading darkens the accent toward black rather than fading it out. Opacity was
 * the obvious first reach and is wrong here: a solid is opaque, and translucent
 * facets let the far side of the model show through every near one, which turns
 * a crisp star into a tangle of overlapping triangles. `color-mix` keeps the
 * facets opaque while still deriving every tone from whatever the theme's accent
 * happens to be.
 */
const TONES = [42, 62, 80, 100].map(
  (percent) => `color-mix(in srgb, var(--color-accent) ${percent}%, black)`
)

function toneFor(intensity: number): string {
  const index = Math.min(TONES.length - 1, Math.floor(intensity * TONES.length))
  return TONES[index] as string
}

/** Radians per second about Y, and the X rate as a fraction of it. */
const SPIN_RATE = 0.42
const TUMBLE_RATIO = 0.37

type Pose = { points: string; fill: string }[]

/**
 * Projects the solid at rotation `time` (seconds) into flat SVG polygons, back
 * to front. Back-facing triangles are dropped, and the survivors are sorted by
 * depth so the caller can write them into fixed DOM slots: the solid is not
 * convex, so a sideways spike really can pass in front of another facet, and
 * document order is the only thing SVG sorts by.
 */
function poseAt(time: number): Pose {
  const rx = time * SPIN_RATE * TUMBLE_RATIO
  const ry = time * SPIN_RATE
  const cosX = Math.cos(rx)
  const sinX = Math.sin(rx)
  const cosY = Math.cos(ry)
  const sinY = Math.sin(ry)

  const rotate = ([x, y, z]: Vec3): Vec3 => {
    const y1 = y * cosX - z * sinX
    const z1 = y * sinX + z * cosX
    return [x * cosY + z1 * sinY, y1, -x * sinY + z1 * cosY]
  }

  const visible: { points: string; fill: string; depth: number }[] = []

  for (const triangle of TRIANGLES) {
    const [a, b, c] = triangle.map(rotate) as [Vec3, Vec3, Vec3]
    const normal = normalize(
      cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]])
    )
    if (normal[2] <= 0) continue

    // Orthographic, like the icon's own projection. SVG's y axis points down,
    // so model y is negated on the way out.
    const points = [a, b, c]
      .map(([x, y]) => `${(CENTER + x * SCALE).toFixed(2)},${(CENTER - y * SCALE).toFixed(2)}`)
      .join(' ')

    visible.push({
      points,
      fill: toneFor(Math.max(0, dot(normal, LIGHT))),
      depth: (a[2] + b[2] + c[2]) / 3,
    })
  }

  visible.sort((p, q) => p.depth - q.depth)
  return visible.map(({ points, fill }) => ({ points, fill }))
}

/**
 * Every pose is written into the same 60 <polygon> nodes, which is why the slot
 * count is fixed rather than sized to whatever is visible this frame. Roughly
 * half the facets face away at any angle, but the count varies as it turns, and
 * adding or removing nodes mid-animation would mean React reconciliation on
 * every frame for a decorative 24px glyph. Unused slots get empty points.
 */
const SLOTS = TRIANGLES.length

const INITIAL_POSE = poseAt(0)

export function Mascot({
  size = 24,
  className,
}: {
  /** Rendered edge length in CSS pixels. The artwork is a square viewBox, so this is both axes. */
  size?: number
  className?: string
}) {
  const slotsRef = useRef<(SVGPolygonElement | null)[]>([])

  useEffect(() => {
    // Either opt-out leaves INITIAL_POSE on screen, which is a complete,
    // correctly shaded solid rather than an empty box. The rAF guard is not
    // hypothetical: this renders inside the sidebar, so a throw here would
    // take the whole shell down in any environment that lacks the API.
    if (typeof requestAnimationFrame !== 'function') return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (reduced?.matches) return

    // Captured, not looked up again at teardown: cleanup runs at unmount, and
    // reaching for the global then would fail in any harness that swaps these
    // out between the render and the unmount.
    const schedule = requestAnimationFrame
    const cancel = cancelAnimationFrame

    let frame = 0
    let painting = false
    const start = performance.now()

    const draw = (now: number) => {
      // A conforming requestAnimationFrame always defers, so this is never true
      // twice over in a browser. Test harnesses routinely install one that
      // invokes its callback synchronously, though, and a loop that reschedules
      // itself from inside its own callback recurses against that until the
      // stack gives out. Unwinding leaves the last painted pose on screen,
      // which is the right outcome under a scheduler that never yields.
      if (painting) return
      painting = true

      const pose = poseAt((now - start) / 1000)
      for (let i = 0; i < SLOTS; i++) {
        const node = slotsRef.current[i]
        if (!node) continue
        const facet = pose[i]
        const fill = facet?.fill ?? 'none'
        node.setAttribute('points', facet?.points ?? '')
        node.setAttribute('fill', fill)
        node.setAttribute('stroke', fill)
      }
      frame = schedule(draw)
      painting = false
    }

    frame = schedule(draw)
    return () => cancel(frame)
  }, [])

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="devdrivr dodecastar mascot"
    >
      <g className="mascot-geometry">
        {Array.from({ length: SLOTS }, (_, i) => {
          const facet = INITIAL_POSE[i]
          return (
            <polygon
              key={i}
              ref={(node) => {
                slotsRef.current[i] = node
              }}
              className="mascot-facet"
              points={facet?.points ?? ''}
              fill={facet?.fill ?? 'none'}
              // Hairline stroke in the same colour closes the sub-pixel seams
              // that appear between adjacent facets at 24px, where antialiasing
              // on two shared edges leaves a visible crack of background.
              stroke={facet?.fill ?? 'none'}
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          )
        })}
      </g>
    </svg>
  )
}
