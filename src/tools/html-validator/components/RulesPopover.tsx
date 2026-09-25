import { Button } from '@/components/shared/Button'
import { Checkbox } from '@/components/shared/Checkbox'
import { SettingsPopover, SettingsSection } from '@/components/shared/SettingsPopover'
import {
  ALL_RULES,
  RULE_CATEGORIES,
  isRuleEnabled,
  type RuleConfig,
} from '@/tools/html-validator/html-helpers'

type RulesPopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  overrideCount: number
  disabledRules: string[]
  enabledRules: string[]
  onToggleRule: (rule: RuleConfig, next: boolean) => void
  onResetRules: () => void
}

export function RulesPopover({
  open,
  onOpenChange,
  overrideCount,
  disabledRules,
  enabledRules,
  onToggleRule,
  onResetRules,
}: RulesPopoverProps) {
  return (
    // `aria-controls` is conditional because the panel only exists while open, and an
    // `aria-controls` pointing at an unrendered id is worse than none — it sends the user's
    // cursor nowhere. Matches css-validator, which already had it this way.
    <SettingsPopover
      label="Rules"
      title="Validation rules"
      open={open}
      onOpenChange={onOpenChange}
      badge={overrideCount}
      width="lg"
      description={
        overrideCount === 0
          ? 'Using the default rules.'
          : `${overrideCount} rule${overrideCount === 1 ? '' : 's'} changed from the defaults.`
      }
      footer={
        <Button variant="ghost" size="xs" onClick={onResetRules} disabled={overrideCount === 0}>
          Reset to defaults
        </Button>
      }
    >
      {RULE_CATEGORIES.map((category) => (
        <SettingsSection key={category.id} title={category.label} dense>
          {ALL_RULES.filter((rule) => rule.category === category.id).map((rule) => {
            const enabled = isRuleEnabled(rule, disabledRules, enabledRules)
            return (
              <label
                key={rule.id}
                // The hint explains *why* — the rule ids alone told the
                // user nothing they could act on.
                title={`${rule.id} — ${rule.hint}`}
                className="flex cursor-pointer items-start gap-1.5 text-xs"
              >
                <Checkbox
                  checked={enabled}
                  onChange={(e) => onToggleRule(rule, e.target.checked)}
                  className="mt-0.5"
                />
                <span
                  className={
                    enabled ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'
                  }
                >
                  {rule.label}
                </span>
              </label>
            )
          })}
        </SettingsSection>
      ))}
    </SettingsPopover>
  )
}
