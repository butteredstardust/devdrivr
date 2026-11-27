import { expect, it } from 'vitest'
import { isMonacoLanguageReady } from '@/lib/monaco-languages'

const contributions = import.meta.glob<string>(
  '/node_modules/monaco-editor/esm/vs/basic-languages/*/*.contribution.js',
  { eager: true, query: '?raw', import: 'default' }
)

it('finds a lazy contribution for every installed Monaco language ID', () => {
  const languageIds = Object.values(contributions).flatMap((source) =>
    Array.from(source.matchAll(/^\s*id:\s*["']([^"']+)["']/gm), (match) => match[1]!)
  )

  expect(languageIds).toContain('c')
  expect(languageIds.filter(isMonacoLanguageReady)).toEqual([])
})
