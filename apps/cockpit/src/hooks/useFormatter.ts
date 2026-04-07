/**
 * Runs Prettier in the main thread via dynamic imports.
 * Using a Worker + Comlink caused silent crashes in Tauri's WebKit due to CJS
 * deps in the worker bundle. For a desktop app, main-thread formatting is fine.
 */

import { useCallback, useRef } from 'react'
import { format as formatSql } from 'sql-formatter'

const LANGUAGE_TO_PARSER: Record<string, string> = {
  javascript: 'babel',
  typescript: 'typescript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  markdown: 'markdown',
  yaml: 'yaml',
  xml: 'xml',
  graphql: 'graphql',
}

type FormatOptions = {
  language: string
  tabWidth?: number
  useTabs?: boolean
  singleQuote?: boolean
  trailingComma?: 'all' | 'es5' | 'none'
  semi?: boolean
}

// Cache loaded plugins so we only import once per session
const pluginCache = new Map<string, unknown>()

async function getPlugin(name: string): Promise<unknown> {
  if (pluginCache.has(name)) return pluginCache.get(name)!
  let plugin: unknown
  switch (name) {
    case 'babel':
      plugin = (await import('prettier/plugins/babel')).default
      break
    case 'estree':
      plugin = (await import('prettier/plugins/estree')).default
      break
    case 'typescript':
      plugin = (await import('prettier/plugins/typescript')).default
      break
    case 'html':
      plugin = (await import('prettier/plugins/html')).default
      break
    case 'markdown':
      plugin = (await import('prettier/plugins/markdown')).default
      break
    case 'yaml':
      plugin = (await import('prettier/plugins/yaml')).default
      break
    case 'xml':
      plugin = (await import('@prettier/plugin-xml')).default
      break
    case 'graphql':
      plugin = (await import('prettier/plugins/babel')).default
      break
    case 'postcss':
      plugin = (await import('prettier/parser-postcss')).default
      break
    default:
      throw new Error(`Unknown plugin: ${name}`)
  }
  pluginCache.set(name, plugin)
  return plugin
}

// Which plugins each parser needs
const PARSER_PLUGINS: Record<string, string[]> = {
  babel: ['babel', 'estree'],
  typescript: ['typescript', 'estree'],
  json: ['babel', 'estree'],
  css: ['postcss'],
  scss: ['postcss'],
  less: ['postcss'],
  html: ['html'],
  markdown: ['markdown'],
  yaml: ['yaml'],
  xml: ['xml'],
  graphql: ['babel'],
}

export function useFormatter() {
  // Ref so we never recreate the callback
  const cacheRef = useRef(pluginCache)
  void cacheRef

  const format = useCallback(async (code: string, options: FormatOptions): Promise<string> => {
    // SQL handled by sql-formatter (no Prettier needed)
    if (options.language === 'sql') {
      return formatSql(code, {
        tabWidth: options.tabWidth ?? 2,
        useTabs: options.useTabs ?? false,
      })
    }

    const parser = LANGUAGE_TO_PARSER[options.language]
    if (!parser) throw new Error(`Unsupported language: ${options.language}`)

    const { format: prettierFormat } = await import('prettier/standalone')
    const pluginNames = PARSER_PLUGINS[parser] ?? []
    const plugins = await Promise.all(pluginNames.map(getPlugin))

    return prettierFormat(code, {
      parser,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugins: plugins as any[],
      tabWidth: options.tabWidth ?? 2,
      useTabs: options.useTabs ?? false,
      singleQuote: options.singleQuote ?? true,
      trailingComma: options.trailingComma ?? 'es5',
      semi: options.semi ?? false,
    })
  }, [])

  const detectLanguage = useCallback((code: string): string => {
    const trimmed = code.trimStart()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
      if (trimmed.match(/<!DOCTYPE\s+html/i) || trimmed.match(/<html[\s>]/i)) return 'html'
      if (trimmed.startsWith('<?xml')) return 'xml'
      return 'html'
    }
    if (trimmed.startsWith('---\n') || trimmed.match(/^\w+:\s/)) return 'yaml'
    if (trimmed.match(/^#\s|^\*\*|^-\s/)) return 'markdown'
    if (trimmed.match(/^SELECT\s|^INSERT\s|^CREATE\s|^ALTER\s|^DROP\s/i)) return 'sql'
    if (trimmed.match(/^import\s|^export\s|^const\s|^function\s|^class\s/)) {
      return trimmed.includes(': ') || trimmed.includes('<') ? 'typescript' : 'javascript'
    }
    if (trimmed.match(/^\.|^#|^@media|^:root/)) return 'css'
    return 'javascript'
  }, [])

  return { format, detectLanguage }
}
