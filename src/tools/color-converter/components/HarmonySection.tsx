import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'

type Harmony = { label: string; hex: string }

export function HarmonySection({
  harmony,
  onSelect,
}: {
  harmony: Harmony[]
  onSelect: (hex: string) => void
}) {
  return (
    <section>
      <div className="flex flex-col gap-2">
        {harmony.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          >
            <div
              className="h-8 w-8 shrink-0 rounded border border-[var(--color-border)]"
              style={{ backgroundColor: item.hex }}
            />
            <div className="flex-1">
              <span className="text-xs text-[var(--color-text-muted)]">{item.label}</span>
              <span className="ml-2 font-mono text-sm text-[var(--color-text)]">{item.hex}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => onSelect(item.hex)}>
              Use
            </Button>
            <CopyButton text={item.hex} />
          </div>
        ))}
      </div>
    </section>
  )
}
