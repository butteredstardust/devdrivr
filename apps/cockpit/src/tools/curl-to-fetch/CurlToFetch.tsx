import { useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type CurlToFetchState = {
  input: string
  outputTab: string
}

type ParsedCurl = {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

function parseCurl(input: string): ParsedCurl | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('curl')) return null

  let method = 'GET'
  const headers: Record<string, string> = {}
  let body: string | null = null
  let url = ''

  // Normalize multi-line curl commands
  const normalized = trimmed.replace(/\\\n\s*/g, ' ')
  const tokens: string[] = []
  let current = ''
  let inQuote: string | null = null

  for (const char of normalized) {
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      inQuote = char
    } else if (char === ' ') {
      if (current) { tokens.push(current); current = '' }
    } else {
      current += char
    }
  }
  if (current) tokens.push(current)

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token === 'curl') continue

    if (token === '-X' || token === '--request') {
      method = tokens[++i]?.toUpperCase() ?? 'GET'
    } else if (token === '-H' || token === '--header') {
      const header = tokens[++i] ?? ''
      const colonIdx = header.indexOf(':')
      if (colonIdx > 0) {
        headers[header.slice(0, colonIdx).trim()] = header.slice(colonIdx + 1).trim()
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      body = tokens[++i] ?? null
      if (method === 'GET') method = 'POST'
    } else if (token === '-u' || token === '--user') {
      const creds = tokens[++i] ?? ''
      headers['Authorization'] = `Basic ${btoa(creds)}`
    } else if (token === '-b' || token === '--cookie') {
      headers['Cookie'] = tokens[++i] ?? ''
    } else if (token === '--compressed') {
      headers['Accept-Encoding'] = 'gzip, deflate, br'
    } else if (!token.startsWith('-')) {
      url = token
    }
  }

  if (!url) return null
  return { url, method, headers, body }
}

function toFetch(parsed: ParsedCurl): string {
  const opts: string[] = []
  if (parsed.method !== 'GET') opts.push(`  method: '${parsed.method}',`)

  const headerEntries = Object.entries(parsed.headers)
  if (headerEntries.length > 0) {
    opts.push('  headers: {')
    for (const [k, v] of headerEntries) {
      opts.push(`    '${k}': '${v}',`)
    }
    opts.push('  },')
  }

  if (parsed.body) {
    opts.push(`  body: ${JSON.stringify(parsed.body)},`)
  }

  if (opts.length === 0) {
    return `const response = await fetch('${parsed.url}')`
  }

  return `const response = await fetch('${parsed.url}', {\n${opts.join('\n')}\n})\nconst data = await response.json()`
}

function toAxios(parsed: ParsedCurl): string {
  const opts: string[] = []
  const headerEntries = Object.entries(parsed.headers)
  if (headerEntries.length > 0) {
    opts.push('  headers: {')
    for (const [k, v] of headerEntries) {
      opts.push(`    '${k}': '${v}',`)
    }
    opts.push('  },')
  }
  if (parsed.body) {
    opts.push(`  data: ${parsed.body.startsWith('{') ? parsed.body : JSON.stringify(parsed.body)},`)
  }

  const method = parsed.method.toLowerCase()
  if (opts.length === 0) {
    return `const { data } = await axios.${method}('${parsed.url}')`
  }
  return `const { data } = await axios.${method}('${parsed.url}', {\n${opts.join('\n')}\n})`
}

function toKy(parsed: ParsedCurl): string {
  const opts: string[] = []
  const headerEntries = Object.entries(parsed.headers)
  if (headerEntries.length > 0) {
    opts.push('  headers: {')
    for (const [k, v] of headerEntries) {
      opts.push(`    '${k}': '${v}',`)
    }
    opts.push('  },')
  }
  if (parsed.body) {
    opts.push(`  json: ${parsed.body.startsWith('{') ? parsed.body : JSON.stringify(parsed.body)},`)
  }

  const method = parsed.method.toLowerCase()
  if (opts.length === 0) {
    return `const data = await ky.${method}('${parsed.url}').json()`
  }
  return `const data = await ky.${method}('${parsed.url}', {\n${opts.join('\n')}\n}).json()`
}

const OUTPUT_TABS = [
  { id: 'fetch', label: 'fetch' },
  { id: 'axios', label: 'axios' },
  { id: 'ky', label: 'ky' },
]

export default function CurlToFetch() {
  const [state, updateState] = useToolState<CurlToFetchState>('curl-to-fetch', {
    input: '',
    outputTab: 'fetch',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)

  const parsed = useMemo(() => parseCurl(state.input), [state.input])

  const output = useMemo(() => {
    if (!parsed) return ''
    switch (state.outputTab) {
      case 'fetch': return toFetch(parsed)
      case 'axios': return toAxios(parsed)
      case 'ky': return toKy(parsed)
      default: return toFetch(parsed)
    }
  }, [parsed, state.outputTab])

  // Report conversion status to status bar
  useMemo(() => {
    if (parsed && output) {
      setLastAction(`Converted to ${state.outputTab}`, 'success')
    }
  }, [parsed, output, state.outputTab, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            cURL Command
          </div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={"curl 'https://api.example.com/data' \\\n  -H 'Authorization: Bearer token' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"key\": \"value\"}'"}
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-1">
            <TabBar
              tabs={OUTPUT_TABS}
              activeTab={state.outputTab}
              onTabChange={(id) => updateState({ outputTab: id })}
            />
            <CopyButton text={output} className="mr-2" />
          </div>
          {parsed ? (
            <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs text-[var(--color-text)]">
              {output}
            </pre>
          ) : state.input.trim() ? (
            <div className="p-4 text-sm text-[var(--color-error)]">Could not parse cURL command</div>
          ) : (
            <div className="p-4 text-sm text-[var(--color-text-muted)]">Paste a cURL command on the left</div>
          )}
        </div>
      </div>
    </div>
  )
}
