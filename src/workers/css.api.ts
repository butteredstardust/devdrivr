import { analyzeCss } from '@/lib/css-helpers'

export function analyze(css: string, disabled: string[], enabled: string[]) {
  return analyzeCss(css, disabled, enabled)
}
