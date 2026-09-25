import { useCallback, useRef } from 'react'
import { parseColor, rgbToHex, type ColorConverterState } from '@/tools/color-converter/color-model'

export function useColorInputHistory(
  history: string[],
  updateState: (patch: Partial<ColorConverterState>) => void
) {
  const historyRef = useRef(history)
  historyRef.current = history

  return useCallback(
    (value: string) => {
      updateState({ input: value })
      const rgb = parseColor(value)
      if (rgb) {
        const hex = rgbToHex(rgb)
        const prev = historyRef.current.filter((h) => h !== hex)
        const next = [hex, ...prev].slice(0, 12)
        updateState({ history: next })
      }
    },
    [updateState]
  )
}
