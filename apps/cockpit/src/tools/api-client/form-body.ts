/**
 * Form bodies and cURL export for the API client.
 *
 * The tool could only send JSON, plain text, or nothing, so every form-encoded endpoint — which is
 * most login endpoints and every file upload — had to be hand-written as a text blob with the
 * `Content-Type` typed in by hand. Imports made it worse: `postmanBodyToText` flattens Postman's
 * `urlencoded` and `formdata` bodies into a query string and labels the result `text`, so a
 * perfectly structured request arrived as an opaque line with no editor and no content type.
 *
 * The canonical storage for both new modes stays a `URLSearchParams`-shaped string. That is what
 * already round-trips through the saved-request schema, the importers and the export path, so
 * nothing downstream needs a migration; the key/value pairs are parsed out only inside the editor.
 */

import type { ApiHeader } from '@/types/models'

export type FormField = {
  key: string
  value: string
  enabled: boolean
  /**
   * Present only for multipart fields the user attached a file to.
   *
   * Deliberately not persisted — a `File` handle is a live OS reference and cannot survive a
   * reload, so a saved request remembers the field name and forgets the file. Pretending otherwise
   * would mean a "saved" upload that silently sends an empty part later.
   */
  file?: File
}

export const URLENCODED_MODE = 'urlencoded'
export const FORMDATA_MODE = 'formdata'

/** Body modes whose payload is a list of key/value pairs rather than a document. */
export function isFormMode(mode: string): boolean {
  return mode === URLENCODED_MODE || mode === FORMDATA_MODE
}

/**
 * Read the stored string into editable pairs.
 *
 * `URLSearchParams` is the parser rather than a hand-rolled split so `+`, percent-escapes and
 * repeated keys behave the way the wire format says they do.
 *
 * An empty body parses to no rows, not one blank row: a row the user has not named yet is editor
 * state, not payload, and `serializeFormBody` drops it. Anything blank on screen is owned by the
 * component — see `blankFormRows`.
 */
export function parseFormBody(body: string): FormField[] {
  if (!body.trim()) return []
  const fields: FormField[] = []
  new URLSearchParams(body).forEach((value, key) => {
    fields.push({ key, value, enabled: true })
  })
  return fields
}

/** How many un-named rows a field list is carrying — the editor's own state, not the body's. */
export function blankFormRows(fields: FormField[]): number {
  return fields.filter((f) => !f.key.trim()).length
}

/** The inverse. Disabled and unnamed rows are dropped — they are drafts, not payload. */
export function serializeFormBody(fields: FormField[]): string {
  const search = new URLSearchParams()
  for (const field of fields) {
    if (!field.enabled || !field.key.trim()) continue
    search.append(field.key, field.value)
  }
  return search.toString()
}

/** `Content-Type` a mode implies, or `null` when the mode doesn't dictate one. */
export function contentTypeFor(mode: string): string | null {
  if (mode === 'json') return 'application/json'
  if (mode === URLENCODED_MODE) return 'application/x-www-form-urlencoded'
  // multipart's type carries the boundary, so it is generated per request rather than fixed here.
  return null
}

/**
 * Content types the app itself puts in the header list, as opposed to ones the user typed.
 *
 * Switching body mode should retarget a boilerplate `Content-Type` — a POST starts life with
 * `application/json`, and leaving that in place while sending a form body is a request that lies
 * about itself. A value outside this set is someone's deliberate choice (`application/vnd.api+json`
 * and friends) and is never touched.
 */
const BOILERPLATE_CONTENT_TYPES = new Set([
  'application/json',
  'application/x-www-form-urlencoded',
  'text/plain',
])

export function isBoilerplateContentType(value: string): boolean {
  return BOILERPLATE_CONTENT_TYPES.has(value.split(';')[0]?.trim().toLowerCase() ?? '')
}

export function buildUrlEncodedBody(fields: FormField[]): string {
  return serializeFormBody(fields)
}

/**
 * A multipart boundary that cannot occur in the payload.
 *
 * Random rather than fixed: a constant boundary appearing inside an uploaded file would truncate
 * the request, and while unlikely it is the kind of failure that looks like a server bug for hours.
 */
export function createBoundary(): string {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('')
  return `----DevdrivrFormBoundary${random}`
}

/** RFC 2388 escaping for the `name`/`filename` parameters — quotes and newlines only. */
function escapeQuoted(value: string): string {
  return value.replace(/"/g, '%22').replace(/[\r\n]/g, '')
}

/**
 * `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`: the default parameter is
 * `ArrayBufferLike`, which includes `SharedArrayBuffer` and so is not assignable to `BodyInit`.
 */
export type MultipartBody = { body: Uint8Array<ArrayBuffer>; contentType: string }

/**
 * Assemble a `multipart/form-data` payload by hand.
 *
 * Built as bytes rather than handed to `FormData` because the request goes out through
 * `@tauri-apps/plugin-http`, where the body crosses the IPC bridge — a `FormData` object does not
 * survive that trip intact, and a hand-built buffer also lets the exact `Content-Type` header
 * (boundary included) be set explicitly instead of hoping the runtime adds it.
 */
export async function buildMultipartBody(fields: FormField[]): Promise<MultipartBody> {
  const boundary = createBoundary()
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []

  for (const field of fields) {
    if (!field.enabled || !field.key.trim()) continue
    const name = escapeQuoted(field.key)

    if (field.file) {
      const filename = escapeQuoted(field.file.name)
      const type = field.file.type || 'application/octet-stream'
      chunks.push(
        encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`
        )
      )
      chunks.push(new Uint8Array(await field.file.arrayBuffer()))
      chunks.push(encoder.encode('\r\n'))
    } else {
      chunks.push(
        encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${field.value}\r\n`
        )
      )
    }
  }

  chunks.push(encoder.encode(`--${boundary}--\r\n`))

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const body = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }

  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

// ── cURL export ────────────────────────────────────────────────────

/**
 * Single-quote a value for a POSIX shell.
 *
 * The only character that needs care inside single quotes is the single quote itself, closed and
 * re-opened around an escaped one. Everything else — `$`, backticks, newlines — is already literal,
 * which is exactly why this quoting style is the right one for pasting a URL or a JSON body.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export type CurlOptions = {
  method: string
  url: string
  headers: ApiHeader[]
  body: string
  bodyMode: string
  /** Multipart fields, when `bodyMode` is `formdata`. Files become `@filename` the way curl reads them. */
  formFields?: FormField[]
}

/**
 * Render a request as a runnable `curl` command.
 *
 * The inverse of the app's existing `curl-to-fetch` tool, and the format every bug report and API
 * doc asks for. Line continuations keep it readable while still pasting as one command.
 */
export function toCurl({ method, url, headers, body, bodyMode, formFields }: CurlOptions): string {
  const lines: string[] = [`curl -X ${method} ${shellQuote(url)}`]

  // A Content-Type is dropped for multipart: `-F` makes curl generate the header *and* the
  // boundary, and a hand-written one — typically a leftover `application/json` from the request
  // defaults — would override it with a boundary that matches nothing in the body.
  const enabled = headers.filter(
    (h) =>
      h.enabled &&
      h.key.trim() &&
      !(bodyMode === FORMDATA_MODE && h.key.toLowerCase() === 'content-type')
  )
  const hasContentType = enabled.some((h) => h.key.toLowerCase() === 'content-type')
  for (const header of enabled) {
    lines.push(`-H ${shellQuote(`${header.key}: ${header.value}`)}`)
  }

  if (bodyMode === FORMDATA_MODE) {
    // curl generates its own boundary for `-F`, so no Content-Type is added here — one written by
    // hand would carry the wrong boundary and break the request.
    for (const field of formFields ?? []) {
      if (!field.enabled || !field.key.trim()) continue
      const value = field.file ? `@${field.file.name}` : field.value
      lines.push(`-F ${shellQuote(`${field.key}=${value}`)}`)
    }
  } else if (bodyMode !== 'none' && body) {
    const implied = contentTypeFor(bodyMode)
    if (implied && !hasContentType) lines.push(`-H ${shellQuote(`Content-Type: ${implied}`)}`)
    lines.push(`-d ${shellQuote(body)}`)
  }

  return lines.join(' \\\n  ')
}
