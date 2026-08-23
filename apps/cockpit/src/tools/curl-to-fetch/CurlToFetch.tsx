import { useCallback, useMemo } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonaco } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { httpMethodColorVar } from '@/lib/http-method'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { SplitPane } from '@/components/shared/SplitPane'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { sendToTool } from '@/lib/tool-handoff'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'
import { TextArea } from '@/components/shared/TextArea'
import { EmptyState } from '@/components/shared/EmptyState'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import { DownloadSimpleIcon, FilesIcon, PlayIcon, TerminalWindowIcon } from '@phosphor-icons/react'
import { Alert } from '@/components/shared/Alert'
import { useToolAction } from '@/hooks/useToolAction'
import { useUiStore } from '@/stores/ui.store'
import { dispatchToolAction } from '@/lib/tool-actions'
import { buildExportFilename, exportFile, openFileDialog } from '@/lib/file-io'
import { formatShortcut } from '@/lib/shortcut-label'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

type CurlToFetchState = {
  input: string
  fileName: string | null
  outputTab: string
}

type ParsedCurl = {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

const VALUE_FLAGS = new Set([
  '-A',
  '--user-agent',
  '-e',
  '--referer',
  '-o',
  '--output',
  '-x',
  '--proxy',
  '--connect-timeout',
  '--max-time',
  '--retry',
  '--cacert',
  '--cert',
  '--key',
  '--resolve',
])

function encodeBasicCredentials(credentials: string): string {
  const bytes = new TextEncoder().encode(credentials)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// ── Parser ─────────────────────────────────────────────────────────

type CurlParseResult = { parsed: ParsedCurl | null; error: string | null }

function tokenizeCurl(input: string): { tokens: string[]; error: string | null } {
  const tokens: string[] = []
  let current = ''
  let quote: 'single' | 'double' | 'ansi' | null = null
  let escaping = false

  const appendEscape = (character: string) => {
    if (quote !== 'ansi') return character
    return character === 'n'
      ? '\n'
      : character === 'r'
        ? '\r'
        : character === 't'
          ? '\t'
          : character
  }

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character === undefined) continue
    if (escaping) {
      current += appendEscape(character)
      escaping = false
      continue
    }
    if (character === '\\' && quote !== 'single') {
      escaping = true
      continue
    }
    if (!quote && character === '$' && input[index + 1] === "'") {
      quote = 'ansi'
      index += 1
      continue
    }
    if (!quote && character === "'") {
      quote = 'single'
      continue
    }
    if (!quote && character === '"') {
      quote = 'double'
      continue
    }
    if (
      (quote === 'single' && character === "'") ||
      (quote === 'double' && character === '"') ||
      (quote === 'ansi' && character === "'")
    ) {
      quote = null
      continue
    }
    if (!quote && /\s/.test(character)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += character
  }
  if (escaping) current += '\\'
  if (quote) return { tokens: [], error: 'Unterminated quoted value in cURL command' }
  if (current) tokens.push(current)
  return { tokens, error: null }
}

function parseCurl(input: string): CurlParseResult {
  const trimmed = input.trim()
  if (!trimmed.startsWith('curl')) return { parsed: null, error: 'Command must start with curl' }

  let method = 'GET'
  const headers: Record<string, string> = {}
  let body: string | null = null
  let url = ''

  const tokenized = tokenizeCurl(trimmed.replace(/\\\n\s*/g, ' '))
  if (tokenized.error) return { parsed: null, error: tokenized.error }
  const tokens = tokenized.tokens

  for (let i = 0; i < tokens.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const token = tokens[i]! // safe: loop guard is i < tokens.length
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
      if (body?.startsWith('@')) {
        return {
          parsed: null,
          error: `File-backed request bodies (${body}) are not read for safety; paste the file contents instead.`,
        }
      }
      if (method === 'GET') method = 'POST'
    } else if (token === '-u' || token === '--user') {
      const creds = tokens[++i] ?? ''
      headers['Authorization'] = `Basic ${encodeBasicCredentials(creds)}`
    } else if (token === '-b' || token === '--cookie') {
      headers['Cookie'] = tokens[++i] ?? ''
    } else if (token === '--compressed') {
      headers['Accept-Encoding'] = 'gzip, deflate, br'
    } else if (VALUE_FLAGS.has(token)) {
      i++
    } else if (!token.startsWith('-')) {
      url = token
    }
  }

  if (!url) return { parsed: null, error: 'No request URL found in cURL command' }
  return { parsed: { url, method, headers, body }, error: null }
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
  if (opts.length === 0)
    return `const response = await fetch('${esc(p.url)}')\nconst data = await response.json()`
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
  const lines = [`const xhr = new XMLHttpRequest()`, `xhr.open('${p.method}', '${esc(p.url)}')`]
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

// ── Component ──────────────────────────────────────────────────────

export default function CurlToFetch() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<CurlToFetchState>('curl-to-fetch', {
    input: '',
    fileName: null,
    outputTab: 'fetch',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()

  const parseResult = useMemo(() => parseCurl(state.input), [state.input])
  const parsed = parseResult.parsed

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

  const handleTestInApiClient = useCallback(() => {
    if (!parsed) return

    const headers = Object.entries(parsed.headers).map(([key, value]) => ({
      key,
      value,
      enabled: true,
    }))

    const bodyMode =
      parsed.body === null
        ? 'none'
        : parsed.body.trimStart().startsWith('{') || parsed.body.trimStart().startsWith('[')
          ? 'json'
          : 'text'

    // Patch only the draft; preserve any other ApiClientState fields (e.g. activeRequestId)
    sendToTool('api-client', {
      activeRequestId: null,
      draft: {
        name: `${parsed.method} ${parsed.url}`,
        method: parsed.method,
        url: parsed.url,
        headers,
        body: parsed.body ?? '',
        bodyMode,
        auth: { type: 'none' },
      },
    })
  }, [parsed])

  const handleOpen = useCallback(async () => {
    try {
      const opened = await openFileDialog()
      if (opened) dispatchToolAction({ type: 'open-file', ...opened })
    } catch (err) {
      setLastAction(`Open failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [setLastAction])

  const handleExport = useCallback(async () => {
    if (!output) {
      setLastAction('Nothing to export yet', 'info')
      return
    }
    try {
      const path = await exportFile(output, buildExportFilename(`${state.outputTab}-request`, 'js'))
      setLastAction(path ? `Exported ${path}` : 'Export cancelled', path ? 'success' : 'info')
    } catch (err) {
      setLastAction(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [output, state.outputTab, setLastAction])

  const handleLoadSample = useCallback(() => {
    updateState({ input: TOOL_SAMPLES['curl-to-fetch'] ?? '', fileName: null })
  }, [updateState])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      updateState({ input: action.content, fileName: action.filename })
      setLastAction(`Opened ${action.filename}`, 'success')
    }
    if (action.type === 'save-file') void handleExport()
    if (action.type === 'copy-output' && output) {
      void copy(output, { success: 'Generated request copied', failure: 'Copy failed' })
    }
  })

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <DocumentToolbar aria-label="cURL conversion actions">
          <DocumentIdentity
            title={state.fileName ?? 'Untitled cURL command'}
            icon={
              <TerminalWindowIcon
                size={16}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-text-muted)]"
              />
            }
            status={
              parsed
                ? `${parsed.url} · ${headerCount} header${headerCount === 1 ? '' : 's'}${parsed.body ? ` · ${parsed.body.length} body chars` : ''}`
                : state.input.trim()
                  ? 'Invalid cURL command'
                  : 'Nothing converted'
            }
          />
          {parsed && (
            <span
              className="rounded px-2 py-0.5 text-xs font-bold"
              style={{
                color: httpMethodColorVar(parsed.method),
                background: `color-mix(in srgb, ${httpMethodColorVar(parsed.method)} 15%, transparent)`,
              }}
            >
              {parsed.method}
            </span>
          )}
          <DocumentFileActions
            open={{
              label: 'Open cURL command',
              title: `Open a cURL command (${formatShortcut('mod+o')})`,
              onClick: () => void handleOpen(),
            }}
          />
          <ToolbarGroup label="Template actions" separated>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLoadSample}
              disabled={!TOOL_SAMPLES['curl-to-fetch']}
              title="Load a sample cURL command"
              className="gap-1"
            >
              <FilesIcon size={14} aria-hidden="true" />
              Load sample
            </Button>
          </ToolbarGroup>
          <ToolbarGroup label="Converted output" separated>
            <CopyButton text={output} label="Copy generated request" />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport()}
              disabled={!output}
              title={`Export generated request (${formatShortcut('mod+s')})`}
              className="gap-1"
            >
              <DownloadSimpleIcon size={14} aria-hidden="true" />
              Export
            </Button>
            {parsed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTestInApiClient}
                title="Open this request in API Client"
                className="gap-1"
              >
                <PlayIcon size={14} aria-hidden="true" />
                Test in API Client
              </Button>
            )}
          </ToolbarGroup>
        </DocumentToolbar>
      }
    >
      <SplitPane
        storageKey="curl-to-fetch"
        defaultRatio={0.4}
        aria-label="Resize command and output"
      >
        {/* Input */}
        <div className="flex min-h-0 flex-1 flex-col">
          <PaneHeader title="cURL Command" />
          <TextArea
            value={state.input}
            onChange={(e) => updateState({ input: e.target.value })}
            placeholder={
              "curl 'https://api.example.com/data' \\\n  -H 'Authorization: Bearer token' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"key\": \"value\"}'"
            }
            monospace
            className="flex-1 resize-none rounded-none border-0 bg-[var(--color-bg)] p-4 focus:border-0"
          />
        </div>

        {/* Output */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-1">
            <TabBar
              tabs={OUTPUT_TABS}
              activeTab={state.outputTab}
              onTabChange={(id) => updateState({ outputTab: id })}
            />
          </div>
          {parsed ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <Editor
                theme={monacoTheme}
                language="javascript"
                value={output}
                options={{ ...monacoOptions, readOnly: true, domReadOnly: true }}
              />
            </div>
          ) : state.input.trim() ? (
            <Alert variant="error" className="m-4">
              Could not parse cURL command{parseResult.error ? ` — ${parseResult.error}` : ''}
            </Alert>
          ) : (
            <div className="flex flex-1 items-center justify-center p-4">
              <EmptyState
                icon={TerminalWindowIcon}
                size="sm"
                title="Paste a cURL command on the left"
                description="Copy as cURL from any browser's network panel. The command is parsed here — nothing is sent."
              />
            </div>
          )}
        </div>
      </SplitPane>
    </ToolLayout>
  )
}
