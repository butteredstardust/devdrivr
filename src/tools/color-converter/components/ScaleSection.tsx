import { Button } from '@/components/shared/Button'

type ScaleStep = { label: string; hex: string }

export function ScaleSection({
  scale,
  onSelect,
}: {
  scale: ScaleStep[]
  onSelect: (hex: string) => void
}) {
  return (
    <section>
      <div className="flex flex-wrap gap-2">
        {scale.map((step) => (
          <Button
            key={step.label}
            variant="icon"
            onClick={() => onSelect(step.hex)}
            className="group flex flex-col items-center gap-1 p-0 hover:bg-transparent"
            title={step.hex}
          >
            <div
              className="h-10 w-10 rounded border border-[var(--color-border)] transition-transform group-hover:scale-110"
              style={{ backgroundColor: step.hex }}
            />
            <span className="text-2xs text-[var(--color-text-muted)]">{step.label}</span>
            <span className="text-2xs font-mono text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
              {step.hex}
            </span>
          </Button>
        ))}
      </div>
    </section>
  )
}
