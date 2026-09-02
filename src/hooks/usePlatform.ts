import { useMemo } from 'react'
import { detectPlatform, getModKey, getModKeySymbol } from '@/lib/platform'

export function usePlatform() {
  return useMemo(() => {
    const platform = detectPlatform()
    return {
      platform,
      isMac: platform === 'mac',
      modKey: getModKey(platform),
      modSymbol: getModKeySymbol(platform),
    }
  }, [])
}
