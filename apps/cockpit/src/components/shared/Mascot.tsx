// Mathematical Penrose Triangle mascot — Geometric & Minimalist
// Representing structural logic and the cockpit's developer utility focus.

export function Mascot({ className }: { className?: string }) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 100 100"
      className={className}
      aria-label="devdrivr geometric mascot"
    >
      <style>{`
        @keyframes mascot-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .mascot-geometry {
          animation: mascot-rotate 20s linear infinite;
          transform-origin: center;
        }
        .mascot-path {
          stroke: var(--color-accent, #39ff14);
          stroke-width: 4;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .mascot-fill {
          fill: var(--color-accent, #39ff14);
          opacity: 0.1;
        }
      `}</style>
      <g className="mascot-geometry">
        {/* Penrose Triangle / Impossible Triangle */}
        <path className="mascot-path" d="M50 15 L85 85 L15 85 Z" />
        <path className="mascot-path" d="M50 15 L60 35 L30 75 L15 85" />
        <path className="mascot-path" d="M85 85 L75 65 L40 65 L50 15" />
        <path className="mascot-path" d="M15 85 L25 65 L70 65 L85 85" />
        <polygon className="mascot-fill" points="50,15 85,85 15,85" />
      </g>
    </svg>
  )
}
