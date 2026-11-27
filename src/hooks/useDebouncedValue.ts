import { useEffect, useState } from 'react'

/** Keep the initial value, then publish edits once the input has been idle. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(() => value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(() => value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debouncedValue
}
