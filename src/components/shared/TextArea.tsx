import {
  forwardRef,
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  type ChangeEventHandler,
  type FocusEventHandler,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

type TextAreaSize = 'sm' | 'md'

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  size?: TextAreaSize
  monospace?: boolean
}

const SIZE_CLASSES: Record<TextAreaSize, string> = {
  sm: 'px-3 py-2 text-xs leading-5',
  md: 'px-3 py-2 text-sm leading-6',
}

const BASE_CLASSES =
  'w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none transition-colors duration-[var(--duration-fast)] focus:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50'

type DomTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  elementRef: (node: HTMLTextAreaElement | null) => void
}

const DomTextArea = memo(function DomTextArea({ elementRef, ...props }: DomTextAreaProps) {
  return <textarea ref={elementRef} {...props} />
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
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
    const fieldRef = useRef<HTMLTextAreaElement | null>(null)
    const initialValueRef = useRef(value ?? defaultValue)
    const valueRef = useRef(value)
    valueRef.current = value
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const onBlurRef = useRef(onBlur)
    onBlurRef.current = onBlur
    const setRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        if (node && node !== fieldRef.current && initialValueRef.current !== undefined) {
          node.value = String(initialValueRef.current)
        }
        fieldRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef]
    )
    const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>((event) => {
      onChangeRef.current?.(event)
    }, [])
    const handleBlur = useCallback<FocusEventHandler<HTMLTextAreaElement>>((event) => {
      const nextValue = valueRef.current
      if (nextValue !== undefined && event.currentTarget.value !== String(nextValue)) {
        event.currentTarget.value = String(nextValue)
      }
      onBlurRef.current?.(event)
    }, [])

    useLayoutEffect(() => {
      if (value === undefined || !fieldRef.current) return
      if (document.activeElement === fieldRef.current) return
      const next = String(value)
      if (fieldRef.current.value !== next) fieldRef.current.value = next
    }, [value])

    return (
      <DomTextArea
        elementRef={setRef}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          `${BASE_CLASSES} ${SIZE_CLASSES[size]} ${monospace ? 'font-mono' : ''}`,
          className
        )}
        {...props}
      />
    )
  }
)

TextArea.displayName = 'TextArea'
