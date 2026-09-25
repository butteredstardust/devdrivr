import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { readTextWithLimit } from '@/lib/http-body'

const MAX_REMOTE_REF_DEPTH = 8
export const MAX_REMOTE_SCHEMA_BYTES = 2_000_000
const MAX_REMOTE_SCHEMA_CACHE = 32
const remoteSchemaCache = new Map<string, unknown>()

function resolveJsonPointer(value: unknown, fragment: string): unknown {
  if (!fragment) return value
  if (!fragment.startsWith('#/')) throw new Error(`Unsupported remote $ref fragment: ${fragment}`)
  let current = value
  for (const part of fragment.slice(2).split('/')) {
    if (current === null || typeof current !== 'object') return undefined
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~')
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export async function resolveRemoteRefs(
  value: unknown,
  baseUrl: string,
  signal: AbortSignal,
  depth = 0,
  rootHost = new URL(baseUrl).host,
  documentRoot: unknown = value
): Promise<unknown> {
  if (depth > MAX_REMOTE_REF_DEPTH || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) => resolveRemoteRefs(item, baseUrl, signal, depth, rootHost, documentRoot))
    )
  }
  const object = value as Record<string, unknown>
  if (typeof object.$ref === 'string' && object.$ref.startsWith('#')) {
    const referenced = resolveJsonPointer(documentRoot, object.$ref)
    if (referenced === undefined) throw new Error(`Local $ref target was not found: ${object.$ref}`)
    const resolved = await resolveRemoteRefs(
      referenced,
      baseUrl,
      signal,
      depth + 1,
      rootHost,
      documentRoot
    )
    const siblings = Object.fromEntries(Object.entries(object).filter(([key]) => key !== '$ref'))
    return Object.keys(siblings).length > 0 && resolved && typeof resolved === 'object'
      ? { ...(resolved as Record<string, unknown>), ...siblings }
      : resolved
  }
  if (typeof object.$ref === 'string') {
    const refUrl = new URL(object.$ref, baseUrl)
    if (!/^https?:$/.test(refUrl.protocol) || refUrl.host !== rootHost) {
      throw new Error(`Remote $ref host is not allowed: ${refUrl.host}`)
    }
    const documentUrl = new URL(refUrl.href)
    documentUrl.hash = ''
    let referenced = remoteSchemaCache.get(documentUrl.href)
    if (referenced === undefined) {
      const response = await tauriFetch(documentUrl.href, { signal })
      if (!response.ok) {
        // The HTTP plugin keeps an unread body open on the Rust side until it is cancelled.
        await response.body?.cancel().catch(() => {})
        throw new Error(`Remote $ref answered ${response.status}: ${refUrl.href}`)
      }
      const text = await readTextWithLimit(
        response,
        MAX_REMOTE_SCHEMA_BYTES,
        `Remote $ref is larger than ${MAX_REMOTE_SCHEMA_BYTES / 1_000_000} MB`
      )
      try {
        referenced = JSON.parse(text) as unknown
      } catch {
        throw new Error(`Remote $ref is not valid JSON: ${refUrl.href}`)
      }
      if (remoteSchemaCache.size >= MAX_REMOTE_SCHEMA_CACHE) {
        const oldest = remoteSchemaCache.keys().next().value
        if (oldest) remoteSchemaCache.delete(oldest)
      }
      remoteSchemaCache.set(documentUrl.href, referenced)
    }
    const remoteRoot = referenced
    referenced = resolveJsonPointer(remoteRoot, refUrl.hash)
    if (referenced === undefined)
      throw new Error(`Remote $ref target was not found: ${refUrl.href}`)
    const resolved = await resolveRemoteRefs(
      referenced,
      refUrl.href,
      signal,
      depth + 1,
      rootHost,
      remoteRoot
    )
    const siblings = Object.fromEntries(Object.entries(object).filter(([key]) => key !== '$ref'))
    return Object.keys(siblings).length > 0 && resolved && typeof resolved === 'object'
      ? { ...(resolved as Record<string, unknown>), ...siblings }
      : resolved
  }
  const entries = await Promise.all(
    Object.entries(object).map(
      async ([key, child]) =>
        [
          key,
          await resolveRemoteRefs(child, baseUrl, signal, depth, rootHost, documentRoot),
        ] as const
    )
  )
  return Object.fromEntries(entries)
}
