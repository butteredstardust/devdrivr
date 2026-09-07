import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Merges Tailwind classes so a caller's `className` always wins.
 *
 * WARNING: shared primitives must build their class attribute through this function. Plain string
 * concatenation does not work. Tailwind resolves two utilities for one property by stylesheet emit
 * order, not by class attribute order, so a base class can beat the override appended after it.
 * `.relative` is emitted after `.absolute`, which makes `absolute` on a `Button` a no-op. Every
 * font-size override on a `Button` loses to `text-xs` the same way.
 *
 * The extension teaches the merger this app's custom theme scales. Without it, a custom utility is
 * unknown, no conflict is detected, and both classes survive into the class attribute — which is
 * the failure this function exists to remove.
 */
export const cn = extendTailwindMerge({
  extend: {
    theme: {
      // --text-2xs (src/index.css @theme). `text-xs` and friends are already known.
      text: ['2xs'],
      // --font-brand and --font-ui. `font-mono` is already known.
      font: ['brand', 'ui'],
    },
  },
})
