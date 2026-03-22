import { handleRpc } from './rpc'
import * as prettier from 'prettier/standalone'
import prettierPluginBabel from 'prettier/plugins/babel'
import prettierPluginEstree from 'prettier/plugins/estree'
import prettierPluginHtml from 'prettier/plugins/html'
import prettierPluginMarkdown from 'prettier/plugins/markdown'
import prettierPluginTypescript from 'prettier/plugins/typescript'
import prettierPluginYaml from 'prettier/plugins/yaml'
import prettierPluginXml from '@prettier/plugin-xml'
// prettier-plugin-sql depends on node-sql-parser (CJS/UMD) which crashes module workers in WebKit.
// SQL is handled separately via sql-formatter (ESM-native).
import { format as formatSql } from 'sql-formatter'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRETTIER_PLUGINS: any[] = [
  prettierPluginBabel,
  prettierPluginEstree,
  prettierPluginHtml,
  prettierPluginMarkdown,
  prettierPluginTypescript,
  prettierPluginYaml,
  prettierPluginXml,
]

type FormatOptions = {
  language: string
  tabWidth?: number
  useTabs?: boolean
  singleQuote?: boolean
  trailingComma?: 'all' | 'es5' | 'none'
  semi?: boolean
}

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

const api = {
  async format(code: string, options: FormatOptions): Promise<string> {
    // SQL is handled by sql-formatter (ESM-native) instead of prettier-plugin-sql
    if (options.language === 'sql') {
      return formatSql(code, {
        tabWidth: options.tabWidth ?? 2,
        useTabs: options.useTabs ?? false,
      })
    }

    const parser = LANGUAGE_TO_PARSER[options.language]
    if (!parser) {
      throw new Error(`Unsupported language: ${options.language}`)
    }

    return prettier.format(code, {
      parser,
      plugins: PRETTIER_PLUGINS,
      tabWidth: options.tabWidth ?? 2,
      useTabs: options.useTabs ?? false,
      singleQuote: options.singleQuote ?? true,
      trailingComma: options.trailingComma ?? 'es5',
      semi: options.semi ?? false,
    })
  },

  async detectLanguage(code: string): Promise<string> {
    // Simple heuristics for auto-detection
    const trimmed = code.trimStart()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
      // Distinguish HTML from XML
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
  },

  getSupportedLanguages(): string[] {
    return [...Object.keys(LANGUAGE_TO_PARSER), 'sql']
  },
}

export type FormatterWorker = typeof api

handleRpc(api)
