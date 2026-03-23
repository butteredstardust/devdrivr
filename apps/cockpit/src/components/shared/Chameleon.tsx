// Pixel art dinosaur mascot — 32×32 grid (60×54 display)
// Re-created based on reference image: A charming, chibi light green dinosaur.

const COLORS: { [k: number]: string } = {
  1: 'var(--color-mascot-green-outline, #1A4D2E)',   // Dark green (Outline/Spikes/Mouth)
  2: 'var(--color-mascot-green-shadow, #76BA99)',    // Mid green (Shadow)
  3: 'var(--color-mascot-green-base, #A2FF86)',      // Light green (Body base)
  4: 'var(--color-mascot-eye-pupil, #000000)',       // Black (Eyes)
  5: 'var(--color-mascot-eye-highlight, #ffffff)',   // White (Highlights)
  6: 'var(--color-mascot-pink, #FF8B8B)',            // Pink (Cheeks)
}

const GRID = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,3,3,3,3,3,3,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,1,0,0,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,1,0,0,1,3,3,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,1,3,3,3,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,1,1,3,3,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,3,3,3,4,4,4,4,3,3,3,3,4,4,4,4,3,3,3,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,3,3,3,4,4,4,4,3,3,3,3,4,4,4,4,3,3,3,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,3,3,3,4,5,4,4,3,3,3,3,4,5,4,4,3,3,3,1,0,1,0,0,0,0,0,0,0],
  [0,0,0,1,3,3,3,4,4,4,4,3,3,3,3,4,4,4,4,3,3,3,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,1,3,6,6,3,3,3,3,3,3,3,3,3,3,3,6,6,3,1,0,1,3,3,1,0,0,0,0,0],
  [0,0,0,1,3,6,6,3,3,3,3,1,3,1,3,3,3,3,6,6,3,1,3,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,3,3,3,3,3,3,1,1,3,3,3,3,3,3,3,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,3,3,3,3,3,3,3,3,3,3,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,1,1,1,3,3,3,3,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,3,3,3,3,3,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,3,3,3,3,3,3,3,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,1,0,1,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,1,1,3,3,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,0,0,0,0],
  [0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,0],
  [0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1],
  [0,0,0,0,0,1,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1],
  [0,0,0,0,0,1,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,1,0],
  [0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,1,0,0,0],
  [0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,3,3,3,3,3,3,1,1,1,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],
]

// Build rect list once at module load
type Group = 'body' | 'eye' | 'spikes'
const RECTS: { x: number; y: number; fill: string; group: Group }[] = []
for (let y = 0; y < GRID.length; y++) {
  const row = GRID[y]!
  for (let x = 0; x < row.length; x++) {
    const cell = row[x]!
    const fill = COLORS[cell]
    if (fill) {
      let group: Group = 'body'
      if (cell === 4 || cell === 5) {
        group = 'eye'
      } else if (cell === 1 && (x > 18 || y < 10)) {
        group = 'spikes'
      }
      RECTS.push({ x, y, fill, group })
    }
  }
}

const GROUPED_RECTS = {
  body: RECTS.filter((r) => r.group === 'body'),
  spikes: RECTS.filter((r) => r.group === 'spikes'),
  eye: RECTS.filter((r) => r.group === 'eye'),
}

export function Chameleon({ className }: { className?: string }) {
  return (
    <svg
      width={60}
      height={54}
      viewBox="0 0 32 32"
      shapeRendering="crispEdges"
      className={className}
      aria-label="devdrivr dinosaur mascot"
    >
      <style>{`
        @keyframes mascot-blink {
          0%, 94%, 100% { }
          95%, 99% { fill: var(--color-mascot-green-base, #A2FF86) !important; }
        }
        @keyframes mascot-breathing {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(0.5px); }
        }
        .mascot-eye rect {
          animation: mascot-blink 4s infinite;
        }
        .mascot-body, .mascot-spikes {
          animation: mascot-breathing 6s ease-in-out infinite;
          transform-origin: center bottom;
        }
      `}</style>
      {Object.entries(GROUPED_RECTS).map(([group, rects]) => (
        <g key={group} className={`mascot-${group}`}>
          {rects.map(({ x, y, fill }) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
          ))}
        </g>
      ))}
    </svg>
  )
}
