import type { ApiImportResult } from '@/types/models'
import {
  addCollection,
  appendQueryParams,
  asArray,
  asRecord,
  asString,
  createBuilder,
  finishBuilder,
  normalizeAuth,
  normalizeHeaders,
  normalizeMethod,
  parseStructuredRecord,
  type ImportBuilder,
  type PlainRecord,
} from '@/lib/api-import/shared'

export function importPostman(content: string): ApiImportResult {
  const root = parseStructuredRecord(content, 'Postman collection')
  if (!isPostmanCollection(root)) {
    throw new Error('Import failed - unsupported Postman collection')
  }

  const sourceTitle = readPostmanName(root) ?? 'Postman Collection'
  const builder = createBuilder('postman', sourceTitle)
  const items = asArray(root['item'])
  if (items.length === 0) {
    builder.warnings.push('Postman collection has no items')
  }

  for (const item of items) {
    importPostmanItem(builder, item, [sourceTitle], root['auth'])
  }

  return finishBuilder(builder)
}

function importPostmanItem(
  builder: ImportBuilder,
  item: unknown,
  path: string[],
  inheritedAuthValue: unknown
): void {
  const obj = asRecord(item)
  if (!obj) {
    builder.warnings.push('Skipped a non-object Postman item')
    return
  }

  const itemName = asString(obj['name']) ?? 'Untitled Request'
  const children = asArray(obj['item'])
  if (children.length > 0) {
    const nextAuthValue = obj['auth'] ?? inheritedAuthValue
    for (const child of children) {
      importPostmanItem(builder, child, [...path, itemName], nextAuthValue)
    }
    return
  }

  const request = asRecord(obj['request'])
  if (!request) {
    builder.warnings.push(`Skipped "${itemName}" because it has no request`)
    return
  }

  let url = postmanUrlToString(request['url'])
  if (!url) {
    builder.warnings.push(`Skipped "${itemName}" because it has no URL`)
    return
  }

  const { text: body, mode: declaredBodyMode } = postmanBodyToText(request['body'])
  const method = normalizeMethod(asString(request['method']))
  const collectionName = path.join(' / ')
  const collectionKey = addCollection(builder, collectionName)
  const authValue = request['auth'] ?? inheritedAuthValue
  const headers = normalizeHeaders(request['header'])
  const apiKey = postmanApiKey(authValue)
  if (apiKey) {
    if (apiKey.location === 'header') {
      headers.push({ key: apiKey.key, value: apiKey.value, enabled: true })
    } else if (apiKey.location === 'query') {
      url = appendQueryParams(url, [
        `${encodeURIComponent(apiKey.key)}=${encodeURIComponent(apiKey.value)}`,
      ])
    } else {
      builder.warnings.push(`Skipped unsupported Postman API key location for "${itemName}"`)
    }
  }

  builder.requests.push({
    name: itemName,
    method,
    url,
    headers,
    body,
    // A declared form mode wins over sniffing: `a=1&b=2` is valid text, so detection alone would
    // always downgrade it.
    bodyMode: declaredBodyMode ?? (body ? detectBodyMode(body) : 'none'),
    auth: normalizeAuth(authValue),
    collectionKey,
  })
}

function postmanApiKey(value: unknown): { location: string; key: string; value: string } | null {
  const auth = asRecord(value)
  if (!auth || auth['type'] !== 'apikey') return null
  const entries = asArray(auth['apikey'])
  const key = readPostmanKeyValue(entries, 'key')
  if (!key) return null
  return {
    location: readPostmanKeyValue(entries, 'in') ?? 'header',
    key,
    value: readPostmanKeyValue(entries, 'value') ?? `{{${key}}}`,
  }
}

function readPostmanKeyValue(entries: unknown[], key: string): string | null {
  for (const entry of entries) {
    const obj = asRecord(entry)
    if (obj?.['key'] === key && typeof obj['value'] === 'string') return obj['value']
  }
  return null
}

export function isPostmanCollection(root: PlainRecord): boolean {
  const info = asRecord(root['info'])
  const schema = asString(info?.['schema'])
  return Boolean(info && Array.isArray(root['item']) && schema?.includes('postman'))
}

function readPostmanName(root: PlainRecord): string | null {
  return asString(asRecord(root['info'])?.['name'])
}

function postmanUrlToString(value: unknown): string {
  if (typeof value === 'string') return value
  const obj = asRecord(value)
  if (!obj) return ''
  const raw = asString(obj['raw'])
  if (raw) return raw
  const protocol = asString(obj['protocol'])
  const host = asArray(obj['host']).join('.')
  const path = asArray(obj['path']).join('/')
  if (!host) return ''
  const query = asArray(obj['query'])
    .map((entry) => asRecord(entry))
    .filter((entry): entry is PlainRecord => entry !== null && entry['disabled'] !== true)
    .map((entry) => {
      const key = asString(entry['key'])
      if (!key) return null
      const queryValue = typeof entry['value'] === 'string' ? entry['value'] : ''
      return `${encodeURIComponent(key)}=${encodeURIComponent(queryValue)}`
    })
    .filter((entry): entry is string => entry !== null)
  const base = `${protocol ? `${protocol}://` : ''}${host}${path ? `/${path}` : ''}`
  return query.length > 0 ? `${base}?${query.join('&')}` : base
}

type PostmanBody = { text: string; mode: string | null }

/**
 * Postman's body, with its declared mode preserved.
 *
 * Preserve the declared mode with the flattened storage string. The mode restores the correct
 * editor and `Content-Type` for urlencoded and form-data bodies.
 */
function postmanBodyToText(value: unknown): PostmanBody {
  const body = asRecord(value)
  if (!body) return { text: '', mode: null }
  const mode = asString(body['mode'])
  if (mode === 'raw') {
    return { text: typeof body['raw'] === 'string' ? body['raw'] : '', mode: null }
  }
  if (mode === 'urlencoded' || mode === 'formdata') {
    const entries = asArray(body[mode])
      .map((entry) => asRecord(entry))
      .filter((entry): entry is PlainRecord => entry !== null && entry['disabled'] !== true)
      .map((entry) => {
        const key = asString(entry['key'])
        if (!key) return null
        return [key, typeof entry['value'] === 'string' ? entry['value'] : ''] as [string, string]
      })
      .filter((entry): entry is [string, string] => entry !== null)
    return { text: new URLSearchParams(entries).toString(), mode }
  }
  return { text: '', mode: null }
}

function detectBodyMode(body: string): string {
  try {
    JSON.parse(body)
    return 'json'
  } catch {
    return 'text'
  }
}
