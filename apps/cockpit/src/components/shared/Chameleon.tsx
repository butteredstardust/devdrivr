// Pixel art chameleon mascot — 20×18 grid at 3 px/pixel (60×54 display)
// Pre-computed at module load; zero runtime work.

const COLORS: { [k: number]: string } = {
  1: '#0a2a0a',
  2: '#1e6b1e',
  3: '#2d8a2d',
  4: '#3daa3d',
  5: '#78c878',
  6: '#b0e8b0',
  7: '#f0f8f0',
  8: '#1a1a3e',
  9: '#3d2b1f',
  10: '#6b4c38',
  11: '#8b6347',
}

const GRID = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,1,2,3,3,1,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,3,7,8,3,3,1,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,3,3,3,3,3,3,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,1,5,4,3,3,3,3,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,3,6,6,4,3,3,3,1,0,0,0,0,0,0,0,0],
  [0,0,0,1,3,6,6,6,4,3,3,3,1,0,0,0,0,0,0,0],
  [0,0,0,0,1,6,6,6,4,3,3,3,3,1,0,0,0,0,0,0],
  [0,0,0,0,1,5,6,6,4,3,3,3,1,0,1,1,0,0,0,0],
  [0,0,1,0,0,1,5,5,3,3,3,1,0,0,0,1,1,0,0,0],
  [0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0],
  [9,10,10,10,10,10,10,10,10,10,10,10,10,9,0,0,0,1,1,0],
  [0,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
]

// Build rect list once at module load
const RECTS: { x: number; y: number; fill: string }[] = []
for (let y = 0; y < GRID.length; y++) {
  const row = GRID[y]!
  for (let x = 0; x < row.length; x++) {
    const cell = row[x]!
    const fill = COLORS[cell]
    if (fill) RECTS.push({ x, y, fill })
  }
}

export function Chameleon({ className }: { className?: string }) {
  return (
    <svg
      width={60}
      height={54}
      viewBox="0 0 20 18"
      shapeRendering="crispEdges"
      className={className}
      aria-label="devdrivr chameleon mascot"
    >
      {RECTS.map(({ x, y, fill }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
    </svg>
  )
}
