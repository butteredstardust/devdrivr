import * as yaml from 'js-yaml'
import type {
  ApiHeader,
  ApiImportCollectionDraft,
  ApiImportFormat,
  ApiImportRequestDraft,
  ApiImportResult,
  ApiRequestAuth,
} from '@/types/models'

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export const MAX_API_IMPORT_BYTES = 20 * 1024 * 1024
const MAX_API_IMPORT_REQUESTS = 10_000
const MAX_API_IMPORT_COLLECTIONS = 5_000
const MAX_YAML_EXPANDED_NODES = 1_000_000

export type HttpMethod = (typeof HTTP_METHODS)[number]
export type PlainRecord = Record<string, unknown>

export type ImportBuilder = {
  format: ApiImportFormat
  sourceTitle: string
  collections: Map<string, ApiImportCollectionDraft>
  requests: ApiImportRequestDraft[]
  warnings: string[]
}

export type SourceInput = {
  content: string
  filename?: string
}

export const DEFAULT_HEADER: ApiHeader = {
  key: 'Content-Type',
  value: 'application/json',
  enabled: true,
}

export function createBuilder(format: ApiImportFormat, sourceTitle: string): ImportBuilder {
  return {
    format,
    sourceTitle,
    collections: new Map(),
    requests: [],
    warnings: [],
  }
}

export function finishBuilder(builder: ImportBuilder): ApiImportResult {
  if (builder.requests.length > MAX_API_IMPORT_REQUESTS) {
    throw new Error(`Import failed - more than ${MAX_API_IMPORT_REQUESTS} requests`)
  }
  if (builder.collections.size > MAX_API_IMPORT_COLLECTIONS) {
    throw new Error(`Import failed - more than ${MAX_API_IMPORT_COLLECTIONS} collections`)
  }
  return {
    format: builder.format,
    sourceTitle: builder.sourceTitle,
    collections: Array.from(builder.collections.values()),
    requests: builder.requests,
    warnings: builder.warnings,
  }
}

export function addCollection(
  builder: ImportBuilder,
  rawName: string,
  preferredKey?: string | null
): string {
  const name = rawName.trim() || builder.sourceTitle
  const baseKey = preferredKey?.trim() || name.toLowerCase()
  let key = baseKey
  let suffix = 2
  while (builder.collections.has(key) && builder.collections.get(key)?.name !== name) {
    key = `${baseKey}-${suffix}`
    suffix++
  }
  if (!builder.collections.has(key)) {
    builder.collections.set(key, { key, name })
  }
  return key
}

export function parseJsonOrYaml(content: string): unknown {
  try {
    return JSON.parse(content) as unknown
  } catch {
    let parsed: unknown
    try {
      parsed = yaml.load(content)
    } catch {
      return null
    }
    assertYamlExpansionBounded(parsed)
    return parsed
  }
}

/**
 * Rejects a YAML document whose anchors expand past the node limit or form a cycle.
 *
 * YAML anchors let a file of a few KB describe millions of nodes, or an object that contains itself.
 * Every importer walks the parsed tree without limits, so the check runs here, before any walk.
 * Shared subtrees are counted once per reference, and sizes are memoised, so the check is linear.
 */
function assertYamlExpansionBounded(root: unknown): void {
  const sizes = new Map<object, number>()
  const inProgress = new Set<object>()
  const expandedSize = (value: unknown): number => {
    if (typeof value !== 'object' || value === null) return 1
    const known = sizes.get(value)
    if (known !== undefined) return known
    if (inProgress.has(value)) throw new Error('Import failed - YAML anchors form a cycle')
    inProgress.add(value)
    let size = 1
    for (const child of Object.values(value)) {
      size += expandedSize(child)
      if (size > MAX_YAML_EXPANDED_NODES) {
        throw new Error('Import failed - YAML anchors expand past the size limit')
      }
    }
    inProgress.delete(value)
    sizes.set(value, size)
    return size
  }
  expandedSize(root)
}

export function parseStructuredRecord(content: string, label: string): PlainRecord {
  const parsed = parseJsonOrYaml(content)
  const root = asRecord(parsed)
  if (!root) throw new Error(`Import failed - ${label} must be an object`)
  return root
}

export function asRecord(value: unknown): PlainRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as PlainRecord)
    : null
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function asStringArray(value: unknown): string[] {
  return asArray(value).filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  )
}

export function normalizeMethod(value: string | null | undefined): HttpMethod {
  const upper = value?.toUpperCase()
  return HTTP_METHODS.find((method) => method === upper) ?? 'GET'
}

/** Exported so the shared contract test can compare it against the Rust MCP service. */
export const BODY_MODE_IDS = new Set(['json', 'text', 'urlencoded', 'formdata', 'none'])

export function normalizeBodyMode(value: string | null): string {
  return value && BODY_MODE_IDS.has(value) ? value : 'none'
}

export function normalizeHeaders(value: unknown): ApiHeader[] {
  return asArray(value)
    .map((item): ApiHeader | null => {
      const obj = asRecord(item)
      if (!obj) return null
      const key = asString(obj['key'])
      if (!key) return null
      return {
        key,
        value: typeof obj['value'] === 'string' ? obj['value'] : '',
        enabled: typeof obj['enabled'] === 'boolean' ? obj['enabled'] : !obj['disabled'],
      }
    })
    .filter((header): header is ApiHeader => header !== null)
}

export function normalizeAuth(
  value: unknown,
  fallback: ApiRequestAuth = { type: 'none' }
): ApiRequestAuth {
  const obj = asRecord(value)
  if (!obj) return fallback

  if (obj['type'] === 'none') return { type: 'none' }
  if (obj['type'] === 'bearer') {
    const token = postmanAuthValue(obj, 'token') ?? asString(obj['token'])
    return token ? { type: 'bearer', token } : fallback
  }
  if (obj['type'] === 'basic') {
    const username = postmanAuthValue(obj, 'username') ?? asString(obj['username']) ?? ''
    const password = postmanAuthValue(obj, 'password') ?? asString(obj['password']) ?? ''
    return { type: 'basic', username, password }
  }
  if (obj['type'] === 'noauth') return { type: 'none' }

  return fallback
}

function postmanAuthValue(auth: PlainRecord, key: string): string | null {
  const type = asString(auth['type'])
  const entries = type ? asArray(auth[type]) : []
  for (const entry of entries) {
    const obj = asRecord(entry)
    if (obj && obj['key'] === key && typeof obj['value'] === 'string') return obj['value']
  }
  return null
}

export function getInfoTitle(root: PlainRecord): string | null {
  return asString(asRecord(root['info'])?.['title'])
}

export function appendPath(baseUrl: string, pathName: string): string {
  if (!baseUrl) return pathName
  const left = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const right = pathName.startsWith('/') ? pathName : `/${pathName}`
  return `${left}${right}`
}

export function convertPathParams(pathName: string): string {
  return pathName.replace(/\{([^}]+)\}/g, '{{$1}}')
}

export function appendQueryParams(url: string, params: string[]): string {
  if (params.length === 0) return url
  return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`
}

export function readExample(media: PlainRecord): unknown {
  if ('example' in media) return media['example']
  const examples = asRecord(media['examples'])
  if (!examples) return undefined
  const first = asRecord(Object.values(examples)[0])
  return first && 'value' in first ? first['value'] : undefined
}

export function stringifyBody(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

export function schemaToExample(schema: PlainRecord): unknown {
  if ('example' in schema) return schema['example']
  const type = asString(schema['type'])
  if (type === 'array') return [schemaToExample(asRecord(schema['items']) ?? {})]
  if (type === 'object' || asRecord(schema['properties'])) {
    const result: PlainRecord = {}
    const properties = asRecord(schema['properties']) ?? {}
    for (const [key, prop] of Object.entries(properties)) {
      result[key] = schemaToExample(asRecord(prop) ?? {})
    }
    return result
  }
  if (type === 'integer' || type === 'number') return 0
  if (type === 'boolean') return false
  return ''
}
