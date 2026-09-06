import {
  forwardRef,
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  type ChangeEventHandler,
  type FocusEventHandler,
  type InputHTMLAttributes,
} from 'react'

// Select now lives in its own primitive file — re-exported here so the many
// existing `import { Input, Select } from '@/components/shared/Input'` call
// sites keep working unchanged.
export { Select, type SelectProps } from './Select'

type InputSize = 'sm' | 'md'

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  size?: InputSize
  /**
   * Monospace the value. Off by default, matching `TextArea`: an input is chrome
   * until proven otherwise. Turn it on where the field holds something the user
   * reads character by character — a URL, a header value, a JSONPath, an
   * identifier, a token, a colour literal — and where a proportional font would
   * make `l`/`1` and `O`/`0` ambiguous.
   */
  monospace?: boolean
}

const SIZE_CLASSES: Record<InputSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1.5 text-sm',
}

const BASE_CLASSES =
  'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring)] transition-colors duration-[var(--duration-fast)] disabled:opacity-50'

type DomInputProps = InputHTMLAttributes<HTMLInputElement> & {
  elementRef: (node: HTMLInputElement | null) => void
}

const DomInput = memo(function DomInput({ elementRef, ...props }: DomInputProps) {
  return <input ref={elementRef} {...props} />
})

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = 'sm',
      monospace = false,
      className = '',
      value,
      defaultValue,
      onChange,
      onBlur,
      ...props
    },
    forwardedRef
  ) => {
    const fieldRef = useRef<HTMLInputElement | null>(null)
    const initialValueRef = useRef(value ?? defaultValue)
    const valueRef = useRef(value)
    valueRef.current = value
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const onBlurRef = useRef(onBlur)
    onBlurRef.current = onBlur
    const setRef = useCallback(
      (node: HTMLInputElement | null) => {
        if (node && node !== fieldRef.current && initialValueRef.current !== undefined) {
          node.value = String(initialValueRef.current)
        }
        fieldRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef]
    )
    const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>((event) => {
      onChangeRef.current?.(event)
    }, [])
    const handleBlur = useCallback<FocusEventHandler<HTMLInputElement>>((event) => {
      const nextValue = valueRef.current
      if (nextValue !== undefined && event.currentTarget.value !== String(nextValue)) {
        event.currentTarget.value = String(nextValue)
      }
      onBlurRef.current?.(event)
    }, [])

    useLayoutEffect(() => {
      if (value === undefined || !fieldRef.current) return
      // While focused, the DOM is the source of truth for native typing. Even reading a newly
      // controlled value back through React can detach WKWebView's first responder mid-entry.
      if (document.activeElement === fieldRef.current) return
      const next = String(value)
      if (fieldRef.current.value !== next) fieldRef.current.value = next
    }, [value])

    return (
      <DomInput
        elementRef={setRef}
        onChange={handleChange}
        onBlur={handleBlur}
        className={`${BASE_CLASSES} ${SIZE_CLASSES[size]} ${monospace ? 'font-mono' : ''} ${className}`}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
