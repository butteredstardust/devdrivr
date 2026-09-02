import { useId, type ReactNode } from 'react'
import { SlidersHorizontalIcon } from '@phosphor-icons/react'
import { Button } from './Button'
import { Popover, type PopoverAlign } from './Popover'
import { SectionLabel } from './SectionLabel'

/**
 * Width steps, all clamped against the viewport the way `Dialog`'s are — a popover anchored to
 * the right edge of a toolbar has the same chance of running off a narrow window as a centred
 * modal has of overflowing one.
 *
 * There is no wide step. A settings surface is a single column of label-and-control rows; the
 * multi-column grids these replaced existed only because a strip stretched across the whole
 * window and had to fill it, not because anyone wanted to read options in four columns.
 */
const WIDTH_CLASSES = {
  sm: 'w-[min(16rem,calc(100vw-1rem))]',
  md: 'w-[min(20rem,calc(100vw-1rem))]',
  lg: 'w-[min(24rem,calc(100vw-1rem))]',
} as const

type SettingsPopoverProps = {
  /** Trigger label and, unless `title` says otherwise, the surface's accessible name. */
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  /** Trigger icon. Defaults to the sliders glyph every options button already used. */
  icon?: ReactNode
  /**
   * Count of settings that differ from their defaults, shown as a badge on the trigger.
   *
   * This is the price of hiding settings: with the controls off-screen the toolbar no longer
   * shows that anything was changed. Pass it wherever "back to defaults" is a meaningful state.
   */
  badge?: number
  /** Surface heading. Defaults to `label`. */
  title?: string
  /** Muted line under the heading — what these settings affect, or a live summary. */
  description?: ReactNode
  /** Pinned below the scroll area. A reset action belongs here. */
  footer?: ReactNode
  width?: keyof typeof WIDTH_CLASSES
  align?: PopoverAlign
}

/**
 * The toolbar settings surface: a gear-style trigger and a popover of option rows.
 *
 * It replaces the collapsible second row that five tools had grown. That row cost more than
 * space — it resized the editor underneath, so toggling an option relayouted the document at
 * exactly the moment the user was looking at it, and it made toolbar height a function of which
 * tool happened to be open. A popover floats over the content and changes nothing beneath it.
 *
 * What stays out of it: anything the user acts on repeatedly while working. Options that get
 * cycled — a delimiter that decides whether a paste parses at all, a diff's ignore-whitespace —
 * belong in the toolbar where they can be reached in one click.
 */
export function SettingsPopover({
  label,
  open,
  onOpenChange,
  children,
  icon,
  badge,
  title,
  description,
  footer,
  width = 'md',
  align = 'end',
}: SettingsPopoverProps) {
  const heading = title ?? label

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      label={heading}
      align={align}
      className={WIDTH_CLASSES[width]}
      trigger={(triggerProps) => (
        <Button
          {...triggerProps}
          // The variant flip is the only cue that the surface is open once it is drawn over
          // content rather than pushing it down.
          variant={open ? 'secondary' : 'ghost'}
          size="sm"
          className="gap-1"
        >
          {icon ?? <SlidersHorizontalIcon size={14} aria-hidden="true" />}
          {label}
          {badge !== undefined && badge > 0 && (
            <span className="rounded-full bg-[var(--color-accent)] px-1.5 text-2xs text-[var(--color-bg)]">
              {badge}
            </span>
          )}
        </Button>
      )}
    >
      <div className="border-b border-[var(--color-border)] px-3 py-2">
        <SectionLabel as="h2">{heading}</SectionLabel>
      </div>
      {description && (
        <p className="border-b border-[var(--color-border)] px-3 py-2 text-2xs text-[var(--color-text-muted)]">
          {description}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-3 py-2">
          {footer}
        </div>
      )}
    </Popover>
  )
}

type SettingsSectionProps = {
  title?: string
  children: ReactNode
  /** Tighter spacing for a list of checkboxes, where each row is one line. */
  dense?: boolean
  className?: string
}

/** A titled group of rows inside a `SettingsPopover`. */
export function SettingsSection({
  title,
  children,
  dense = false,
  className = '',
}: SettingsSectionProps) {
  return (
    <section className={className}>
      {title && (
        <SectionLabel as="h3" className="mb-2">
          {title}
        </SectionLabel>
      )}
      <div className={`flex flex-col ${dense ? 'gap-1' : 'gap-2'}`}>{children}</div>
    </section>
  )
}

type SettingsRowIds = { labelId: string }

type SettingsRowProps = {
  label: string
  /**
   * The control. As a function when the control cannot be labelled the ordinary way — a `Toggle`
   * renders a `role="switch"` button, which is not a labelable element, so neither a wrapping
   * `<label>` nor an `htmlFor` gives it a name. That form hands back `labelId` to point
   * `aria-labelledby` at instead. Selects and inputs take the node form and are associated
   * structurally.
   */
  children: ReactNode | ((ids: SettingsRowIds) => ReactNode)
  hint?: ReactNode
  disabled?: boolean
}

/**
 * One setting: name on the left, control on the right.
 *
 * Uniform alignment is the point. The rows this replaces put a select's label before the
 * control and a toggle's label after it, so a column of seven options had its labels down the
 * left and its labels down the right at the same time.
 */
export function SettingsRow({ label, children, hint, disabled = false }: SettingsRowProps) {
  const labelId = useId()
  const isRenderProp = typeof children === 'function'
  const content = isRenderProp ? children({ labelId }) : children

  // Node form: the row *is* a `<label>`, so the single control inside is associated
  // structurally and there is no id to keep in sync — the same trade `Field` makes.
  const Wrapper = isRenderProp ? 'div' : 'label'

  return (
    <Wrapper className={`block ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        {isRenderProp ? (
          // No `htmlFor`: this branch exists for controls that are not labelable, so a `for`
          // attribute could only ever dangle. `aria-labelledby` does the naming instead.
          <span id={labelId} className="text-xs text-[var(--color-text)] select-none">
            {label}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-text)] select-none">{label}</span>
        )}
        <div className="shrink-0">{content}</div>
      </div>
      {hint && <p className="mt-1 text-2xs text-[var(--color-text-muted)]">{hint}</p>}
    </Wrapper>
  )
}
