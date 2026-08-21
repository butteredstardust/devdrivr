import { useId, useMemo } from 'react'

/**
 * The devdrivr frog, idling.
 *
 * The source art (a 1408×768 traced SVG) is 37×27 logical pixels once the trace is resampled back
 * onto its own grid, so it is stored here as that grid rather than as the traced paths: a path
 * soup cannot be split into a head that blinks and a body that bobs, and it renders blurry at the
 * ~5× scale this is displayed at. Runs of identical pixels collapse into one `<rect>` per run,
 * which is ~120 rects instead of ~700 cells, and `shapeRendering="crispEdges"` keeps the edges
 * square at any zoom.
 *
 * Rule 12 in AGENTS.md ("Phosphor only, no inline SVG") governs *icons* — chrome that has to
 * restyle with the theme. A mascot is artwork with its own fixed palette, same as
 * `shared/Mascot.tsx`, and there is no Phosphor glyph for "frog doing a two-frame idle".
 *
 * Idle behaviour, in the spirit of a sidescroller's rest state: a two-frame breathing bob, a blink
 * on a slow cycle, and a hop roughly every seven seconds with the contact shadow tightening under
 * it. Every animation is authored so its 100% keyframe is the resting pose, because the app-wide
 * `prefers-reduced-motion` rule in index.css collapses animations to 0.01ms and one iteration —
 * which lands the frog on that last keyframe and holds it there.
 */

/** `.` transparent · `D` dark green · `L` body green · `K` eye · `W` highlight */
const SPRITE = [
  '......DDDDDD.............DDDDDD......',
  '......DDDDDD.............DDDDDD......',
  '.....DDDDDDDDD.........DDDDDDDDD.....',
  '.....DDDWKKDDDDDDDDDDDDDDDWKKDDD.....',
  '.....DDDKKKDDDDDDDDDDDDDDDKKKDDD.....',
  '.....DDDKKKDDDDDDDDDDDDDDDKKKDDD.....',
  '.....DDDDDDDDDDDDDDDDDDDDDDDDDDD.....',
  '.....DDDDDDDDDDDDDDDDDDDDDDDDDDD.....',
  '.....DDDDDDDDDDDDDDDDDDDDDDDDDDD.....',
  '.....LLLLLLLLLLLLLLLLLLLLLLLLLLL.....',
  '.....LLLLLLLLLLLLLLLLLLLLLLLLLLL.....',
  '.....LLLLLLLLLLLLLLLLLLLLLLLLLLL.....',
  'DDDDDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDD',
  'DDDDDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDD',
  'DDDDDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDD',
  'DDDDDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDD',
  'DDDDDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDD',
  'DDDDDLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDDD',
  '..DDDDLLLDDDLLLLLLLLLLLLLDDDLLLDDDD..',
  '..DDDDLLLDDDLLLLLLLLLLLLLDDDLLLDDDD..',
  '...DDDDDDDDDLLLLLLLLLLLLLDDDDDDDDD...',
  'DDDDDDDDWDDD.............DDDWDDDDDDDD',
  'DDDDDDDDWDDD.............DDDWDDDDDDDD',
  'DDDDDDDDWDDD.............DDDWDDDDDDDD',
  '......DDDDDDDDD.......DDDDDDDDD......',
  '......DDD...DDD.......DDD...DDD......',
  '......DDD...DDD.......DDD...DDD......',
] as const

const SPRITE_W = 37
const SPRITE_H = 27

/** Palette lifted from the source art; `W` is nudged off pure white so it reads as a highlight. */
const PALETTE = {
  D: '#617d24',
  L: '#739230',
  K: '#12160c',
  W: '#f4f8ed',
} as const

type PixelKey = keyof typeof PALETTE

const isPixel = (ch: string | undefined): ch is PixelKey => ch !== undefined && ch in PALETTE

/** Both eyes are 3×3, top-left corner here. Kept in one place so the lids cannot drift off them. */
const EYES = [
  { x: 8, y: 3 },
  { x: 26, y: 3 },
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
        .${scope}-hop {
          animation: ${scope}-hop 7.2s steps(1, end) infinite;
        }
        .${scope}-bob {
          animation: ${scope}-bob 1.6s steps(1, end) infinite;
        }
        .${scope}-shadow {
          animation: ${scope}-shadow 7.2s steps(1, end) infinite;
          transform-origin: 18.5px 28px;
          transform-box: view-box;
        }
        .${scope}-lid {
          animation: ${scope}-blink 5.4s steps(1, end) infinite;
          transform-box: view-box;
        }
      `}</style>

      {/* Contact shadow. Outside the hop group on purpose — it stays on the ground. */}
      <ellipse
        className={`${scope}-shadow`}
        cx={SPRITE_W / 2}
        cy={28}
        rx={13}
        ry={1.6}
        fill="#12160c"
        opacity={0.28}
      />

      <g className={`${scope}-hop`}>
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

          {/* Eyelids: a green shutter that wipes down over the eye, with a dark lash line at its
              edge so a closed eye still reads as an eye rather than as a hole in the head. */}
          {EYES.map((eye) => (
            <g
              key={eye.x}
              className={`${scope}-lid`}
              // Per-eye origin, so the lid wipes down from its own top edge. It cannot live in the
              // shared class, and `transform-box: fill-box` is not a substitute — the group's fill
              // box is only as tall as the lid, which is what we are scaling to zero.
              style={{ transformOrigin: `${eye.x + 1.5}px ${eye.y}px` }}
            >
              <rect x={eye.x} y={eye.y} width={3} height={3} fill={PALETTE.D} />
              <rect x={eye.x} y={eye.y + 2} width={3} height={1} fill={PALETTE.K} />
            </g>
          ))}
        </g>
      </g>
    </svg>
  )
}
