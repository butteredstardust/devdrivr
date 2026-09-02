import type { ApiHeader, ApiRequest, ApiRequestAuth } from '@/types/models'
import { FORMDATA_MODE, URLENCODED_MODE } from '@/tools/api-client/form-body'
import type { OnMount } from '@monaco-editor/react'

/**
 * The API Client's request model: its constants, its types, and the pure functions that move a
 * draft from one shape to another.
 *
 * `ApiClient.tsx` was 2,076 lines and held all of this alongside transport, persistence and two
 * large panes, so none of it could be exercised — or read — without the component. Nothing here
 * touches React or the network.
 */
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
export const DEFAULT_REQUEST_NAME = 'Untitled Request'
export const DEFAULT_TIMEOUT_MS = 30_000
export const MAX_DISPLAY_BYTES = 1_000_000

/**
 * Hard ceiling on how much of a response we will hold in renderer memory. The display cap above
 * only bounds what is *shown*; without this a multi-gigabyte download would still be read whole
 * and then copied again into the response Blob, freezing or exhausting the WebView.
 */
export const MAX_RESPONSE_BYTES = 50 * 1024 * 1024
export const MAX_HISTORY_RESPONSE_CHARS = 100_000

export type Param = { key: string; value: string }

export function removeIndexedFile(
  files: Record<number, File>,
  removedIndex: number
): Record<number, File> {
  const next: Record<number, File> = {}
  for (const [rawIndex, file] of Object.entries(files)) {
    const current = Number(rawIndex)
    if (current < removedIndex) next[current] = file
    if (current > removedIndex) next[current - 1] = file
  }
  return next
}

export type RequestDraft = {
  name: string
  method: string
  url: string
  headers: ApiHeader[]
  body: string
  bodyMode: string
  auth: ApiRequestAuth
}

export type ApiClientState = {
  activeRequestId: string | null
  /** Library sidebar visibility — persisted so narrow windows stay where the user left them. */
  libraryOpen: boolean
  timeoutMs: number
  // We keep a working draft independent of the saved request
  draft: RequestDraft
}

export type ResponseData = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  blob: Blob
  mimeType: string
  isBinary: boolean
  displayTruncated: boolean
  time: number
  size: number
}

export type CollectionRun = {
  collectionId: string
  running: boolean
  results: Record<string, { status: 'running' | 'passed' | 'failed'; detail: string }>
}

export type EditorInstance = Parameters<OnMount>[0]

/** A navigation that would discard unsaved edits, held until the user confirms. */
export type PendingNavigation = { description: string; perform: () => void }

export const RESPONSE_TABS = [
  { id: 'body', label: 'Body' },
  { id: 'headers', label: 'Headers' },
]

export const BODY_MODES = [
  { id: 'json', label: 'JSON' },
  { id: 'text', label: 'Text' },
  { id: URLENCODED_MODE, label: 'Form URL-encoded' },
  { id: FORMDATA_MODE, label: 'Multipart' },
  { id: 'none', label: 'None' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function splitUrlParts(url: string): { base: string; query: string; hash: string } {
  const hashIndex = url.indexOf('#')
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : ''
  const queryIndex = withoutHash.indexOf('?')

  return {
    base: queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash,
    query: queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '',
    hash,
  }
}

export function parseQueryParams(url: string): Param[] {
  const { query } = splitUrlParts(url)
  const params: Param[] = []
  new URLSearchParams(query).forEach((value, key) => {
    params.push({ key, value })
  })
  return params
}

export function buildUrlWithParams(url: string, params: Param[]): string {
  const { base, hash } = splitUrlParts(url)
  const search = new URLSearchParams()
  params
    .filter((p) => p.key.trim())
    .forEach((p) => {
      search.append(p.key, p.value)
    })

  const query = search.toString()
  return `${base}${query ? `?${query}` : ''}${hash}`
}

export function detectResponseLanguage(headers: Record<string, string>): string {
  const ct = (headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('json')) return 'json'
  if (ct.includes('html')) return 'html'
  if (ct.includes('xml')) return 'xml'
  if (ct.includes('css')) return 'css'
  if (ct.includes('javascript')) return 'javascript'
  return 'plaintext'
}

export function interpolate(text: string, vars: Record<string, string>): string {
  if (!text) return text
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    return vars[key.trim()] ?? match
  })
}

export function unresolvedVariableNames(values: string[], vars: Record<string, string>): string[] {
  const names = new Set<string>()
  for (const value of values) {
    for (const match of value.matchAll(/\{\{([^}]+)\}\}/g)) {
      const name = match[1]?.trim()
      if (name && vars[name] === undefined) names.add(name)
    }
  }
  return [...names].sort()
}

export function responseMime(headers: Record<string, string>): string {
  const contentType = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === 'content-type'
  )?.[1]
  return contentType?.split(';')[0]?.trim() || 'application/octet-stream'
}

export function isTextResponse(mimeType: string): boolean {
  return mimeType.startsWith('text/') || /(?:json|xml|javascript|yaml|graphql|svg)/i.test(mimeType)
}

export function base64EncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function createDefaultDraft(
  method = 'GET',
  patch: Partial<RequestDraft> = {}
): RequestDraft {
  return {
    name: DEFAULT_REQUEST_NAME,
    method,
    url: '',
    headers: BODY_METHODS.has(method)
      ? [{ key: 'Content-Type', value: 'application/json', enabled: true }]
      : [],
    body: '',
    bodyMode: BODY_METHODS.has(method) ? 'json' : 'none',
    auth: { type: 'none' },
    ...patch,
  }
}

/**
 * Structural comparison of the seven fields that make up a request. Used for
 * both "does this draft still match what's saved" and "is this a pristine new
 * draft" — the two questions that decide whether navigating away destroys work.
 */
export function draftsMatch(a: RequestDraft, b: RequestDraft): boolean {
  return (
    a.name === b.name &&
    a.method === b.method &&
    a.url === b.url &&
    a.body === b.body &&
    a.bodyMode === b.bodyMode &&
    JSON.stringify(a.auth) === JSON.stringify(b.auth) &&
    JSON.stringify(a.headers) === JSON.stringify(b.headers)
  )
}

export function isDraftDirty(draft: RequestDraft, saved: ApiRequest | undefined): boolean {
  if (saved) {
    return !draftsMatch(draft, {
      name: saved.name,
      method: saved.method,
      url: saved.url,
      headers: saved.headers,
      body: saved.body,
      bodyMode: saved.bodyMode,
      auth: saved.auth,
    })
  }
  // Unsaved draft: only "dirty" once it differs from a pristine draft for its
  // own method, so simply switching GET → POST never triggers a discard prompt.
  return !draftsMatch(draft, createDefaultDraft(draft.method))
}

export function applyMethodDefaults(draft: RequestDraft, nextMethod: string): RequestDraft {
  const nextSupportsBody = BODY_METHODS.has(nextMethod)
  const currentSupportsBody = BODY_METHODS.has(draft.method)

  if (!nextSupportsBody) {
    return { ...draft, method: nextMethod, bodyMode: 'none' }
  }

  if (currentSupportsBody) return { ...draft, method: nextMethod }

  const hasContentType = draft.headers.some((h) => h.key.toLowerCase() === 'content-type')
  return {
    ...draft,
    method: nextMethod,
    bodyMode: draft.bodyMode === 'none' ? 'json' : draft.bodyMode,
    headers: hasContentType
      ? draft.headers
      : [{ key: 'Content-Type', value: 'application/json', enabled: true }, ...draft.headers],
  }
}
