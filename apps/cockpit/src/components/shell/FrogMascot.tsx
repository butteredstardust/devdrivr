import { useId, useMemo } from 'react'

/**
 * The devdrivr frog, idling.
 *
 * The source art (a 1408×768 traced SVG) is resampled back onto its own logical pixel grid and
 * stored here as that grid rather than as traced paths: a path soup cannot be split into a head
 * that blinks and a body that bobs, and it renders blurry at the ~4× scale this is displayed at.
 * Runs of identical pixels collapse into one `<rect>` per run, and `shapeRendering="crispEdges"`
 * keeps the edges square at any zoom. Exported so the sprite-integrity test can hold the grid to
 * rectangular and mirror-symmetric — the two ways hand-edited pixel art silently rots.
 *
 * Rule 12 in AGENTS.md ("Phosphor only, no inline SVG") governs *icons* — chrome that has to
 * restyle with the theme. A mascot is artwork with its own fixed palette, same as
 * `shared/Mascot.tsx`, and there is no Phosphor glyph for "frog doing a four-frame idle".
 *
 * Idle behaviour, in the spirit of a sidescroller's rest state: a two-frame breathing bob, a blink
 * on a slow cycle, a vocal-sac croak roughly every ten seconds, and a hop roughly every seven
 * seconds that squashes before takeoff and stretches mid-air while the contact shadow tightens
 * under it. Every animation is authored so its 100% keyframe is the resting pose — for the croak,
 * whose sac is invisible at rest, resting means fully hidden — because the app-wide
 * `prefers-reduced-motion` rule in index.css collapses animations to 0.01ms and one iteration,
 * which lands the frog on that last keyframe and holds it there.
 */

/** `.` transparent · `D` outline/shade · `L` body · `B` belly · `C` cheeks · `K` eye/mouth · `W` highlight */
export const SPRITE = [
  '......DDDDD................DDDDD......',
  '.....DDDDDDD..............DDDDDDD.....',
  '.....DDKWKKD..............DKKWKDD.....',
  '.....DDKKKKD..............DKKKKDD.....',
  '...DDDDKKKKDDDDDDDDDDDDDDDDKKKKDDDD...',
  '..DLLLLLWWLLLLLLLLLLLLLLLLLLWWLLLLLD..',
  '..DLLLLLLLLLLLLKLLLLLLKLLLLLLLLLLLLD..',
  '..DLLLLLLLLKLLLLLLLLLLLLLLKLLLLLLLLD..',
  '..DLLLLCCLLLKKKKKKKKKKKKKKLLLCCLLLLD..',
  '.DLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLD.',
  '.DLLLLDDLLLLLLLLLLLLLLLLLLLLLLDDLLLLD.',
  '.DLLLLLLLLBBBBBBBBBBBBBBBBBBLLLLLLLLD.',
  '.DLDLLLLLBBBBBBBBBBBBBBBBBBBBLLLLLDLD.',
  '.DLDLLLLBBBBBBBBBWWWWBBBBBBBBBLLLLDLD.',
  '.DLDLLLLBBBBBBBBBBBBBBBBBBBBBBLLLLDLD.',
  '.DLDLLLLLBBBBBBBBBBBBBBBBBBBBLLLLLDLD.',
  '.DLDDDLLLLBBBBBBBBBBBBBBBBBBLLLLDDDLD.',
  '.DDDDDDLLLBBBBBBBBBBBBBBBBBBLLLDDDDDD.',
  '.DDDDDDDLBBBBBBBBBBBBBBBBBBBBLDDDDDDD.',
  '.DDDDDDDDBBBBBBBBBBBBBBBBBBBBDDDDDDDD.',
  '.DDDDDDDDDDBBBBBBBBBBBBBBBBDDDDDDDDDD.',
  '.DDDDDDDDDDDDLLLLLLLLLLLLDDDDDDDDDDDD.',
  '.DDD.DD.DDDDDDDDDDDDDDDDDDDDDD.DD.DDD.',
] as const

const SPRITE_W = 38
const SPRITE_H = 23

/** Palette lifted from the source art; `W` is nudged off pure white so it reads as a highlight. */
const PALETTE = {
  D: '#617d24',
  L: '#739230',
  B: '#a9c46a',
  C: '#cf8a52',
  K: '#12160c',
  W: '#f4f8ed',
} as const

type PixelKey = keyof typeof PALETTE

const isPixel = (ch: string | undefined): ch is PixelKey => ch !== undefined && ch in PALETTE

/**
 * Each eye's pupil block, top-left corner here: 4×3, rows 2–4 of the sprite. Kept in one place so
 * the lids cannot drift off them when the grid is edited elsewhere.
 */
const EYES = [
  { x: 7, y: 2 },
  { x: 27, y: 2 },
] as const

/**
 * The vocal sac, drawn as an overlay rather than baked into the grid: it only exists mid-croak, so
 * putting it in the sprite would need a second grid or per-pixel animation hooks.
 */
const SAC = [
  { x: 15, y: 9, width: 8 },
  { x: 14, y: 10, width: 10 },
  { x: 15, y: 11, width: 8 },
] as const

type Run = { x: number; y: number; width: number; fill: string }

/** Collapse each row into runs of one colour. Pure, and the sprite never changes, so it memoises. */
function toRuns(rows: readonly string[]): Run[] {
  const runs: Run[] = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      if (!isPixel(ch)) {
        x++
        continue
      }
      let width = 1
      while (row[x + width] === ch) width++
      runs.push({ x, y, width, fill: PALETTE[ch] })
      x += width
    }
  })
  return runs
}

export function FrogMascot({
  size = 148,
  className = '',
}: {
  /** Rendered width in CSS pixels. Height follows the sprite's aspect ratio plus room to hop. */
  size?: number
  className?: string
}) {
  const runs = useMemo(() => toRuns(SPRITE), [])
  // Scoped so two frogs on screen — or a frog beside shared/Mascot — cannot collide on class names.
  //
  // The strip is not cosmetic. `useId`'s output is explicitly an implementation detail: React 19
  // returns `_r_0_`, which happens to be a legal CSS identifier, but React 18 returned `:r0:`, and
  // a colon in a selector parses as a pseudo-class — the rule would be dropped and the frog would
  // sit perfectly still with no error anywhere. Keeping only word characters is stable across both.
  const scope = `frog-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  // 8 rows of headroom above for the hop, 4 below for the shadow.
  const viewH = SPRITE_H + 12
  const height = Math.round((size / SPRITE_W) * viewH)

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 -8 ${SPRITE_W} ${viewH}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Pixel-art frog mascot, idling"
      className={className}
    >
      <style>{`
        @keyframes ${scope}-bob {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(0.6px); }
          100% { transform: translateY(0px); }
        }
        @keyframes ${scope}-hop {
          0%, 84%  { transform: translateY(0px); }
          86%      { transform: translateY(1px); }
          88%      { transform: translateY(-4px); }
          91%      { transform: translateY(-7px); }
          94%      { transform: translateY(-4px); }
          96%      { transform: translateY(1px); }
          98%, 100%{ transform: translateY(0px); }
        }
        @keyframes ${scope}-squash {
          0%, 82%   { transform: scale(1, 1); }
          85%       { transform: scale(1.07, 0.9); }
          88%       { transform: scale(0.93, 1.12); }
          91%       { transform: scale(0.95, 1.09); }
          94%       { transform: scale(1.04, 0.95); }
          97%, 100% { transform: scale(1, 1); }
        }
        @keyframes ${scope}-shadow {
          0%, 84%   { transform: scaleX(1); opacity: 0.28; }
          88%, 94%  { transform: scaleX(0.62); opacity: 0.14; }
          98%, 100% { transform: scaleX(1); opacity: 0.28; }
        }
        @keyframes ${scope}-blink {
          0%, 88%   { transform: scaleY(0); }
          90%, 93%  { transform: scaleY(1); }
          95%, 100% { transform: scaleY(0); }
        }
        @keyframes ${scope}-croak {
          0%, 64%   { opacity: 0; transform: scale(1, 0.2); }
          66%       { opacity: 1; transform: scale(1, 0.9); }
          69%       { transform: scale(1.05, 1.35); }
          72%       { transform: scale(0.98, 0.92); }
          75%       { transform: scale(1.08, 1.42); }
          79%       { transform: scale(1, 1.05); }
          83%, 100% { opacity: 0; transform: scale(1, 0.2); }
        }
        .${scope}-hop {
          animation: ${scope}-hop 7.2s steps(1, end) infinite;
        }
        .${scope}-squash {
          animation: ${scope}-squash 7.2s steps(1, end) infinite;
          /* Feet stay planted while the body deforms around them. */
          transform-origin: 19px 22px;
          transform-box: view-box;
        }
        .${scope}-bob {
          animation: ${scope}-bob 1.6s steps(1, end) infinite;
        }
        .${scope}-shadow {
          animation: ${scope}-shadow 7.2s steps(1, end) infinite;
          transform-origin: 19px 23.5px;
          transform-box: view-box;
        }
        .${scope}-lid {
          animation: ${scope}-blink 5.4s steps(1, end) infinite;
          transform-box: view-box;
        }
        .${scope}-sac {
          animation: ${scope}-croak 9.6s steps(1, end) infinite;
          /* Inflates downward out of the chin, not upward over the mouth. */
          transform-origin: 19px 8.5px;
          transform-box: view-box;
        }
      `}</style>

      {/* Contact shadow. Outside the hop group on purpose — it stays on the ground. */}
      <ellipse
        className={`${scope}-shadow`}
        cx={SPRITE_W / 2}
        cy={23.5}
        rx={14}
        ry={1.5}
        fill="#12160c"
        opacity={0.28}
      />

      <g className={`${scope}-hop`}>
        <g className={`${scope}-squash`}>
          <g className={`${scope}-bob`}>
            {runs.map((run) => (
              <rect
                key={`${run.y}-${run.x}`}
                x={run.x}
                y={run.y}
                width={run.width}
                height={1}
                fill={run.fill}
              />
            ))}

            {/* Vocal sac: belly-coloured bulge under the chin. Hidden at rest via its own
                keyframes, so nothing shows until the croak starts. No dark rim — the L→B colour
                step already draws the edge, and a rim mid-stretch reads as a floating bar. */}
            <g className={`${scope}-sac`}>
              {SAC.map((band) => (
                <rect
                  key={band.y}
                  x={band.x}
                  y={band.y}
                  width={band.width}
                  height={1}
                  fill={PALETTE.B}
                />
              ))}
            </g>

            {/* Eyelids: a green shutter that wipes down over the eye, with a dark lash line at its
                edge so a closed eye still reads as an eye rather than as a hole in the head. */}
            {EYES.map((eye) => (
              <g
                key={eye.x}
                className={`${scope}-lid`}
                // Per-eye origin, so the lid wipes down from its own top edge. It cannot live in the
                // shared class, and `transform-box: fill-box` is not a substitute — the group's fill
                // box is only as tall as the lid, which is what we are scaling to zero.
                style={{ transformOrigin: `${eye.x + 2}px ${eye.y}px` }}
              >
                <rect x={eye.x} y={eye.y} width={4} height={3} fill={PALETTE.D} />
                <rect x={eye.x} y={eye.y + 2} width={4} height={1} fill={PALETTE.K} />
              </g>
            ))}
          </g>
        </g>
      </g>
    </svg>
  )
}
