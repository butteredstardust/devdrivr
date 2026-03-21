/// <reference types="vite/client" />

declare module 'htmlhint' {
  export { HTMLHint } from 'htmlhint/dist/core/core'
  export type { Hint, Ruleset, Rule } from 'htmlhint/dist/core/types'
}
