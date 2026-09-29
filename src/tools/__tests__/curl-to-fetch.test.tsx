import { beforeEach, describe, expect, it } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import CurlToFetch from '../curl-to-fetch/CurlToFetch'
import { useToolStateCache } from '@/stores/tool-state.store'
import { useWorkspaceStore } from '@/stores/workspace.store'

beforeEach(() => {
  useWorkspaceStore.setState({ tabs: [], activeTabId: null, activeTool: '', tabMru: [] })
})

describe('CurlToFetch', () => {
  it('renders input and output areas', () => {
    renderTool(CurlToFetch)
    expect(screen.getByText('cURL Command')).toBeInTheDocument()
  })

  it('shows output tabs', () => {
    renderTool(CurlToFetch)
    expect(screen.getByText('fetch')).toBeInTheDocument()
    expect(screen.getByText('axios')).toBeInTheDocument()
    expect(screen.getByText('ky')).toBeInTheDocument()
    expect(screen.getByText('XHR')).toBeInTheDocument()
    expect(screen.getByText('Node.js')).toBeInTheDocument()
  })

  it('converts a simple curl command', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: "curl 'https://api.example.com/data'" } })
    expect(screen.getByText('GET')).toBeInTheDocument()
  })

  it('parses a command continued across lines', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value: [
          "curl 'https://api.example.com/data' \\",
          "  -H 'Accept: application/json' \\",
          "  -d ''",
        ].join('\n'),
      },
    })
    expect(screen.getByText('POST')).toBeInTheDocument()
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain('https://api.example.com/data')
    expect(output).toContain('Accept')
    expect(output).toContain("body: ''")
  })

  it('keeps the POST body and headers in Axios request configuration', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value:
          "curl 'https://api.example.com/orders' -H 'Content-Type: application/json' -d '{\"qty\":2}'",
      },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'axios' }))
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain('axios.request({')
    expect(output).toContain("method: 'POST'")
    expect(output).toContain("'Content-Type': 'application/json'")
    expect(output).toContain('data: \'{"qty":2}\'')
    expect(output).not.toContain('axios.post(')
  })

  it('keeps form request bytes unchanged in the ky output', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: "curl 'https://api.example.com/orders' -d 'name=Grace&active=true'" },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'ky' }))
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("body: 'name=Grace&active=true'")
    expect(output).not.toContain('json:')
  })

  it('preserves the default cURL form content type and omits browser-forbidden compression headers', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value: "curl 'https://api.example.com/form' -d 'name=Ada' --compressed",
      },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("'Content-Type': 'application/x-www-form-urlencoded'")
    expect(output).not.toContain('Accept-Encoding')
  })

  it('keeps an explicitly empty POST body in generated fetch code', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: "curl 'https://api.example.com/form' -d ''" },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("body: ''")
  })

  it('consumes values belonging to known curl flags instead of treating them as the URL', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: "curl 'https://api.example.com/data' --max-time 5" },
    })
    const editors = screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
    expect(editors.some((editor) => editor.value.includes('https://api.example.com/data'))).toBe(
      true
    )
    expect(editors.some((editor) => editor.value.includes("fetch('5')"))).toBe(false)
  })

  it('joins repeated data flags in their original order', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value:
          'curl https://api.example.com -d a=1 --data b=2 --data-raw c=3 --data-binary d=4 --data-ascii e=5',
      },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("body: 'a=1&b=2&c=3&d=4&e=5'")
  })

  it.each([
    ['q=a b', 'q=a%20b'],
    ["q=!*'()", 'q=%21%2A%27%28%29'],
    ['a b', 'a%20b'],
    ['=a b', 'a%20b'],
  ])('applies curl data-urlencode rules to %s', (data, expected) => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: `curl https://api.example.com --data-urlencode "${data}"` },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain(`body: '${expected}'`)
  })

  it.each(['@payload.txt', 'name@payload.txt'])(
    'refuses file-backed URL-encoded data in %s',
    (data) => {
      renderTool(CurlToFetch)
      fireEvent.change(screen.getByPlaceholderText(/curl/i), {
        target: { value: `curl https://api.example.com --data-urlencode '${data}'` },
      })
      expect(screen.getByText(/file-backed request bodies/i)).toBeInTheDocument()
    }
  )

  it('reports multipart forms instead of treating their values as URLs', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: 'curl https://api.example.com -Fname=x' },
    })
    expect(screen.getByText(/multipart form uploads are not supported/i)).toBeInTheDocument()
    expect(screen.getByText(/API Client form-data body/i)).toBeInTheDocument()
  })

  it('supports json data and preserves explicit JSON headers', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value:
          "curl https://api.example.com --json '{\"a\":1}' -H 'content-type: application/problem+json'",
      },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("method: 'POST'")
    expect(output).toContain('body: \'{"a":1}\'')
    expect(output).toContain("'content-type': 'application/problem+json'")
    expect(output).toContain("'Accept': 'application/json'")
    expect(output).not.toContain("'Content-Type': 'application/json'")
  })

  it('adds JSON headers and refuses file-backed json data', () => {
    const { unmount } = renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: 'curl https://api.example.com --json \'{"a":1}\'' },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("'Content-Type': 'application/json'")
    expect(output).toContain("'Accept': 'application/json'")

    unmount()
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: 'curl https://api.example.com --json @payload.json' },
    })
    expect(screen.getByText(/file-backed request bodies/i)).toBeInTheDocument()
  })

  it('supports --url and consumes common value flags', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value:
          'curl --url https://api.example.com/u -m 5 -w fmt -c jar -D headers --limit-rate 1m -K cfg -r 0-5',
      },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("fetch('https://api.example.com/u')")
  })

  it.each(['-T ./payload.json', '--upload-file ./payload.json'])(
    'refuses file-backed uploads from %s',
    (uploadFlag) => {
      renderTool(CurlToFetch)
      fireEvent.change(screen.getByPlaceholderText(/curl/i), {
        target: { value: `curl ${uploadFlag} https://api.example.com/upload` },
      })
      expect(screen.getByText(/file-backed request bodies/i)).toBeInTheDocument()
      expect(screen.getByText(/\.\/payload\.json/)).toBeInTheDocument()
    }
  )

  it('keeps the first positional URL and ignores unknown long equals flags', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value: 'curl https://first.example https://second.example --future=value',
      },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("fetch('https://first.example')")
    expect(output).not.toContain('second.example')
    expect(output).not.toContain("fetch('value')")
  })

  it('does not treat an unknown long equals value as the request URL', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: 'curl --future=value' },
    })
    expect(screen.getByText(/no request URL found/i)).toBeInTheDocument()
  })

  it('parses attached short-option values', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value: String.raw`curl -XPUT -HAccept:\ x -dfoo -uuser:pw -bsid=1 -m5 https://api.example.com`,
      },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("method: 'PUT'")
    expect(output).toContain("'Accept': 'x'")
    expect(output).toContain("'Cookie': 'sid=1'")
    expect(output).toContain("body: 'foo'")
    expect(output).toContain("'Authorization': 'Basic dXNlcjpwdw=='")
  })

  it.each(['curl --head https://api.example.com', 'curl -X HEAD https://api.example.com'])(
    'uses HEAD for curl head request %s',
    (command) => {
      renderTool(CurlToFetch)
      fireEvent.change(screen.getByPlaceholderText(/curl/i), {
        target: { value: command },
      })
      expect(screen.getByText('HEAD')).toBeInTheDocument()
    }
  )

  it('moves joined data into the query string for curl get requests', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: 'curl https://api.example.com/items?active=1 -G -d a=1 -d b=2' },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(output).toContain("fetch('https://api.example.com/items?active=1&a=1&b=2')")
    expect(output).not.toContain('body:')
    expect(output).not.toContain('Content-Type')
  })

  it.each([
    ['curl -I -G -d q=x https://api.example.com/items', 'HEAD'],
    ['curl -G -d q=x -I https://api.example.com/items', 'HEAD'],
    ['curl -X PATCH -G -d q=x https://api.example.com/items', 'PATCH'],
    ['curl -G -d q=x -X PATCH https://api.example.com/items', 'PATCH'],
  ])('keeps method precedence for %s', (command, method) => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: command },
    })
    expect(screen.getByText(method)).toBeInTheDocument()
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain('https://api.example.com/items?q=x')
    expect(output).not.toContain('body:')
  })

  it.each([
    ['fetch', 'response.status', 'Object.fromEntries(response.headers)'],
    ['ky', 'response.status', 'Object.fromEntries(response.headers)'],
    ['XHR', 'xhr.status', 'xhr.getAllResponseHeaders()'],
    ['Node.js', 'res.statusCode', 'res.headers'],
  ])('reads status and headers for HEAD requests in %s output', (tab, status, headers) => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: 'curl -I https://api.example.com/status' },
    })
    if (tab !== 'fetch') fireEvent.click(screen.getByRole('tab', { name: tab }))
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain(status)
    expect(output).toContain(headers)
    expect(output).not.toContain('.json()')
    expect(output).not.toContain('JSON.parse')
  })

  it('encodes non-Latin basic-auth credentials as UTF-8', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: "curl -u 'șer:päss' 'https://api.example.com'" },
    })
    const editors = screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
    expect(editors.some((editor) => editor.value.includes('Basic'))).toBe(true)
  })

  it('parses escaped quotes and ANSI-C quoted request bodies', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value: String.raw`curl 'https://api.example.com' -d $'{"message":"it\'s ok"}\n'`,
      },
    })
    const editors = screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
    expect(editors.some((editor) => editor.value.includes("it\\'s ok"))).toBe(true)
  })

  it('keeps ordinary backslashes inside double quotes and handles CRLF continuations', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value:
          String.raw`curl "https://api.example.com" -d "{\"t\":\"a\nb\"}"` +
          '\\\r\n -H "X-Test: yes"',
      },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain(String.raw`body: '{"t":"a\\nb"}'`)
    expect(output).toContain("'X-Test': 'yes'")
  })

  it('escapes every dynamic value as valid single-quoted JavaScript', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: {
        value: "curl -X \"PO'ST\" $'https://api.example.com/a\\nb' $'--header=X-Test: one\\ttwo'",
      },
    })
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("method: 'PO\\'ST'")
    expect(output).toContain("fetch('https://api.example.com/a\\nb'")
    expect(output).toContain("'X-Test': 'one\\ttwo'")
    expect(output).not.toContain('a\nb')
  })

  it('uses the general ky call for methods without a shortcut', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: 'curl -XOPTIONS https://api.example.com' },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'ky' }))
    const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
    expect(output).toContain("ky('https://api.example.com', {")
    expect(output).toContain("method: 'OPTIONS'")
    expect(output).not.toContain('ky.options')
  })

  it('explicitly refuses file-backed request bodies', () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: "curl 'https://api.example.com' --data @payload.json" },
    })
    expect(screen.getByText(/file-backed request bodies/i)).toBeInTheDocument()
  })

  it('shows error for invalid input', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: 'not a curl command' } })
    expect(screen.getByText(/could not parse/i)).toBeInTheDocument()
  })

  it('does not show "Test in API Client" when no valid curl command', () => {
    renderTool(CurlToFetch)
    expect(screen.queryByTitle('Open this request in API Client')).not.toBeInTheDocument()
  })

  it('shows "Test in API Client" button after a valid curl command is parsed', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: "curl 'https://api.example.com/users'" } })
    expect(screen.getByTitle('Open this request in API Client')).toBeInTheDocument()
  })

  it('clicking "Test in API Client" writes parsed request to api-client tool state cache', async () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, {
      target: {
        value:
          "curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{\"name\":\"alice\"}'",
      },
    })

    fireEvent.click(screen.getByTitle('Open this request in API Client'))

    await waitFor(() => expect(useToolStateCache.getState().get('api-client')).toBeTruthy())
    const cached = useToolStateCache.getState().get('api-client') as Record<string, unknown>
    expect(cached).toBeTruthy()
    const draft = cached['draft'] as Record<string, unknown>
    expect(draft['method']).toBe('POST')
    expect(draft['url']).toBe('https://api.example.com/users')
    expect(draft['bodyMode']).toBe('json')
  })

  it('sets bodyMode to "text" for non-JSON body', async () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, {
      target: { value: "curl -X POST 'https://api.example.com' -d 'name=alice'" },
    })

    fireEvent.click(screen.getByTitle('Open this request in API Client'))

    await waitFor(() => expect(useToolStateCache.getState().get('api-client')).toBeTruthy())
    const cached = useToolStateCache.getState().get('api-client') as Record<string, unknown>
    const draft = cached['draft'] as Record<string, unknown>
    expect(draft['bodyMode']).toBe('text')
  })

  it('hands curl get data to API Client as a query with no body', async () => {
    renderTool(CurlToFetch)
    fireEvent.change(screen.getByPlaceholderText(/curl/i), {
      target: { value: 'curl --url https://api.example.com/search -G -d q=one -d page=2' },
    })

    fireEvent.click(screen.getByTitle('Open this request in API Client'))

    await waitFor(() => expect(useToolStateCache.getState().get('api-client')).toBeTruthy())
    const cached = useToolStateCache.getState().get('api-client') as Record<string, unknown>
    const draft = cached['draft'] as Record<string, unknown>
    expect(draft['method']).toBe('GET')
    expect(draft['url']).toBe('https://api.example.com/search?q=one&page=2')
    expect(draft['body']).toBe('')
    expect(draft['bodyMode']).toBe('none')
  })

  it('maps curl headers to api-client draft headers array', async () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, {
      target: {
        value: "curl 'https://api.example.com' -H 'Authorization: Bearer abc123'",
      },
    })

    fireEvent.click(screen.getByTitle('Open this request in API Client'))

    await waitFor(() => expect(useToolStateCache.getState().get('api-client')).toBeTruthy())
    const cached = useToolStateCache.getState().get('api-client') as Record<string, unknown>
    const draft = cached['draft'] as Record<string, unknown>
    const headers = draft['headers'] as Array<Record<string, unknown>>
    expect(
      headers.some((h) => h['key'] === 'Authorization' && h['value'] === 'Bearer abc123')
    ).toBe(true)
  })

  it('resets activeRequestId to null when writing to api-client cache', () => {
    renderTool(CurlToFetch)
    // Pre-populate after renderTool, which intentionally clears the cache.
    useToolStateCache.getState().set('api-client', { activeRequestId: 'existing-id', draft: {} })
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: "curl 'https://api.example.com/data'" } })
    fireEvent.click(screen.getByTitle('Open this request in API Client'))

    const cached = useToolStateCache.getState().get('api-client') as Record<string, unknown>
    expect(cached['activeRequestId']).toBeNull()
  })
})

describe('CurlToFetch — Load sample', () => {
  it('converts the sample and clears the empty state', async () => {
    renderTool(CurlToFetch)

    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }))

    // A sample that parsed to a bare GET would demonstrate none of the
    // converter — method, headers and body all have to survive the round trip.
    await waitFor(() => {
      const output = (screen.getAllByTestId('monaco-editor').at(-1) as HTMLTextAreaElement).value
      expect(output).toContain("method: 'POST'")
      expect(output).toContain('Authorization')
      expect(output).toContain('body')
    })
    expect(screen.getByRole('button', { name: 'Load sample' })).toBeInTheDocument()
  })
})
