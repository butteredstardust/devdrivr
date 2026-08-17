import { forwardRef, type InputHTMLAttributes } from 'react'
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { Input } from '@/components/shared/Input'
import { Button } from '@/components/shared/Button'

type SearchInputSize = 'sm' | 'md'

type SearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'type' | 'value' | 'onChange'
> & {
  value: string
  onValueChange: (value: string) => void
  /** Accessible name for the clear button; defaults to "Clear search". */
  clearLabel?: string
  size?: SearchInputSize
  /** Applied to the wrapper, not the field — the field itself always fills it. */
  className?: string
}

/** Icon geometry per size: magnifier px, clear glyph px, and the padding that clears them. */
const SIZES: Record<SearchInputSize, { icon: number; clear: number; padding: string }> = {
  sm: { icon: 13, clear: 11, padding: 'pl-7 pr-7' },
  md: { icon: 15, clear: 13, padding: 'pl-8 pr-8' },
}

/**
 * A search field: magnifier, text, and a clear button that appears once there is something to
 * clear.
 *
 * Six of these were hand-rolled and no two agreed. Two of them — the tool sidebar and the notes
 * drawer — drew their own border and background around a raw `<input>`, so they missed the shared
 * focus ring (the sidebar tinted its border instead, which is far weaker) and one of them had no
 * `type="search"`, leaving it out of reach of `getByRole('searchbox')` and of assistive technology
 * looking for a search field. Building on {@link Input} rather than on a bare element means the
 * chrome, the tokens and the focus ring are inherited rather than re-typed.
 *
 * `onValueChange` takes the string directly: every call site was unwrapping `event.target.value`
 * and nothing needed the event.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    { value, onValueChange, clearLabel = 'Clear search', size = 'sm', className = '', ...props },
    ref
  ) => {
    const geometry = SIZES[size]

    return (
      <div className={`relative ${className}`}>
        <MagnifyingGlassIcon
          size={geometry.icon}
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
        />
        <Input
          ref={ref}
          type="search"
          size={size}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          // WebKit — the engine this app actually ships on — draws its own clear button inside a
          // `type="search"` field, so without this reset every one of these renders two X's side by
          // side, only one of which the app controls.
          className={`w-full ${geometry.padding} [&::-webkit-search-cancel-button]:appearance-none`}
          {...props}
        />
        {value && (
          <Button
            type="button"
            variant="icon"
            size="xs"
            onClick={() => onValueChange('')}
            aria-label={clearLabel}
            title={clearLabel}
            className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2"
          >
            <XIcon size={geometry.clear} aria-hidden="true" />
          </Button>
        )}
      </div>
    )
  }
)
SearchInput.displayName = 'SearchInput'
