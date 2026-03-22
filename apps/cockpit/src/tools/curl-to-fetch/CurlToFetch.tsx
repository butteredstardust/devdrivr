import { useMemo } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'

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

// ── Parser ─────────────────────────────────────────────────────────

function parseCurl(input: string): ParsedCurl | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('curl')) return null

  let method = 'GET'
  const headers: Record<string, string> = {}
  let body: string | null = null
  let url = ''

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
      if (current) {
        tokens.push(current)
        current = ''
      }
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
    } else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary'
    ) {
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

// ── Code generators ────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function toFetch(p: ParsedCurl): string {
  const opts: string[] = []
  if (p.method !== 'GET') opts.push(`  method: '${p.method}',`)
  const hdr = Object.entries(p.headers)
  if (hdr.length > 0) {
    opts.push('  headers: {')
    for (const [k, v] of hdr) opts.push(`    '${esc(k)}': '${esc(v)}',`)
    opts.push('  },')
  }
  if (p.body) opts.push(`  body: ${JSON.stringify(p.body)},`)
  if (opts.length === 0) return `const response = await fetch('${esc(p.url)}')\nconst data = await response.json()`
  return `const response = await fetch('${esc(p.url)}', {\n${opts.join('\n')}\n})\nconst data = await response.json()`
}

function toAxios(p: ParsedCurl): string {
  const opts: string[] = []
  const hdr = Object.entries(p.headers)
  if (hdr.length > 0) {
    opts.push('  headers: {')
    for (const [k, v] of hdr) opts.push(`    '${esc(k)}': '${esc(v)}',`)
    opts.push('  },')
  }
  if (p.body) opts.push(`  data: ${p.body.startsWith('{') ? p.body : JSON.stringify(p.body)},`)
  const m = p.method.toLowerCase()
  if (opts.length === 0) return `const { data } = await axios.${m}('${esc(p.url)}')`
  return `const { data } = await axios.${m}('${esc(p.url)}', {\n${opts.join('\n')}\n})`
}

function toKy(p: ParsedCurl): string {
  const opts: string[] = []
  const hdr = Object.entries(p.headers)
  if (hdr.length > 0) {
    opts.push('  headers: {')
    for (const [k, v] of hdr) opts.push(`    '${esc(k)}': '${esc(v)}',`)
    opts.push('  },')
  }
  if (p.body) opts.push(`  json: ${p.body.startsWith('{') ? p.body : JSON.stringify(p.body)},`)
  const m = p.method.toLowerCase()
  if (opts.length === 0) return `const data = await ky.${m}('${esc(p.url)}').json()`
  return `const data = await ky.${m}('${esc(p.url)}', {\n${opts.join('\n')}\n}).json()`
}

function toXhr(p: ParsedCurl): string {
  const lines = [
    `const xhr = new XMLHttpRequest()`,
    `xhr.open('${p.method}', '${esc(p.url)}')`,
  ]
  for (const [k, v] of Object.entries(p.headers)) {
    lines.push(`xhr.setRequestHeader('${esc(k)}', '${esc(v)}')`)
  }
  lines.push(
    `xhr.onload = () => {`,
    `  const data = JSON.parse(xhr.responseText)`,
    `  console.log(data)`,
    `}`
  )
  lines.push(p.body ? `xhr.send(${JSON.stringify(p.body)})` : `xhr.send()`)
  return lines.join('\n')
}

function toNodeHttp(p: ParsedCurl): string {
  const urlObj = (() => {
    try {
      return new URL(p.url)
    } catch {
      return null
    }
  })()
  const mod = urlObj?.protocol === 'https:' ? 'https' : 'http'
  const lines = [
    `const ${mod} = require('${mod}')`,
    ``,
    `const options = {`,
    `  hostname: '${esc(urlObj?.hostname ?? 'example.com')}',`,
    `  port: ${urlObj?.port ? urlObj.port : urlObj?.protocol === 'https:' ? 443 : 80},`,
    `  path: '${esc((urlObj?.pathname ?? '/') + (urlObj?.search ?? ''))}',`,
    `  method: '${p.method}',`,
  ]
  const hdr = Object.entries(p.headers)
  if (hdr.length > 0 || p.body) {
    lines.push(`  headers: {`)
    for (const [k, v] of hdr) lines.push(`    '${esc(k)}': '${esc(v)}',`)
    if (p.body) lines.push(`    'Content-Length': ${p.body.length},`)
    lines.push(`  },`)
  }
  lines.push(`}`)
  lines.push(``)
  lines.push(`const req = ${mod}.request(options, (res) => {`)
  lines.push(`  let data = ''`)
  lines.push(`  res.on('data', (chunk) => { data += chunk })`)
  lines.push(`  res.on('end', () => console.log(JSON.parse(data)))`)
  lines.push(`})`)
  if (p.body) lines.push(`req.write(${JSON.stringify(p.body)})`)
  lines.push(`req.end()`)
  return lines.join('\n')
}

const OUTPUT_TABS = [
  { id: 'fetch', label: 'fetch' },
  { id: 'axios', label: 'axios' },
  { id: 'ky', label: 'ky' },
  { id: 'xhr', label: 'XHR' },
  { id: 'node', label: 'Node.js' },
]

const METHOD_COLORS: Record<string, string> = {
  GET: 'var(--color-success)',
  POST: 'var(--color-info)',
  PUT: 'var(--color-warning)',
  PATCH: 'var(--color-warning)',
  DELETE: 'var(--color-error)',
}

// ── Component ──────────────────────────────────────────────────────

export default function CurlToFetch() {
  useMonacoTheme()
  const [state, updateState] = useToolState<CurlToFetchState>('curl-to-fetch', {
    input: '',
    outputTab: 'fetch',
  })

  const parsed = useMemo(() => parseCurl(state.input), [state.input])

  const output = useMemo(() => {
    if (!parsed) return ''
    switch (state.outputTab) {
      case 'fetch':
        return toFetch(parsed)
      case 'axios':
        return toAxios(parsed)
      case 'ky':
        return toKy(parsed)
      case 'xhr':
        return toXhr(parsed)
      case 'node':
        return toNodeHttp(parsed)
      default:
        return toFetch(parsed)
    }
  }, [parsed, state.outputTab])

  const headerCount = parsed ? Object.keys(parsed.headers).length : 0

  return (
    <div className="flex h-full flex-col">
      {/* Parsed request summary */}
      {parsed && (
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-1.5">
          <span
            className="rounded px-2 py-0.5 text-xs font-bold"
            style={{
              color: METHOD_COLORS[parsed.method] ?? 'var(--color-text)',
              background: `color-mix(in srgb, ${METHOD_COLORS[parsed.method] ?? 'var(--color-text)'} 15%, transparent)`,
            }}
          >
            {parsed.method}
          </span>
          <span className="min-w-0 truncate font-mono text-xs text-[var(--color-text)]">
            {parsed.url}
          </span>
          {headerCount > 0 && (
            <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
              {headerCount} header{headerCount !== 1 ? 's' : ''}
            </span>
          )}
          {parsed.body && (
            <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
              body: {parsed.body.length} chars
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Input */}
        <div className="flex w-2/5 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            cURL Command
          </div>
          <textarea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={
              "curl 'https://api.example.com/data' \\\n  -H 'Authorization: Bearer token' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"key\": \"value\"}'"
            }
            className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>

        {/* Output */}
        <div className="flex w-3/5 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-1">
            <TabBar
              tabs={OUTPUT_TABS}
              activeTab={state.outputTab}
              onTabChange={(id) => updateState({ outputTab: id })}
            />
            <CopyButton text={output} className="mr-2" />
          </div>
          {parsed ? (
            <div className="flex-1">
              <Editor
                language="javascript"
                value={output}
                options={{ ...EDITOR_OPTIONS, readOnly: true, domReadOnly: true }}
              />
            </div>
          ) : state.input.trim() ? (
            <div className="p-4 text-sm text-[var(--color-error)]">
              Could not parse cURL command
            </div>
          ) : (
            <div className="p-4 text-sm text-[var(--color-text-muted)]">
              Paste a cURL command on the left
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
