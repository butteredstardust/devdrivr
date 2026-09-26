import type { ApiImportResult } from '@/types/models'
import {
  addCollection,
  convertPathParams,
  createBuilder,
  DEFAULT_HEADER,
  finishBuilder,
  normalizeMethod,
  type HttpMethod,
  type PlainRecord,
} from '@/lib/api-import/shared'

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

export function importProtobuf(content: string, filename?: string): ApiImportResult {
  const packageName = content.match(/\bpackage\s+([A-Za-z0-9_.]+)\s*;/)?.[1] ?? ''
  const sourceTitle = filename?.replace(/\.[^.]+$/, '') || packageName || 'Protobuf Import'
  const builder = createBuilder('protobuf', sourceTitle)
  const messageFields = parseProtoMessages(content)
  const services = extractNamedBlocks(content, 'service')

  if (services.length === 0) {
    builder.warnings.push('No protobuf services found')
  }

  for (const service of services) {
    const serviceName = packageName ? `${packageName}.${service.name}` : service.name
    const collectionKey = addCollection(builder, serviceName)
    const rpcBlocks = parseProtoRpcs(service.body)
    for (const rpc of rpcBlocks) {
      const http = parseProtoHttpAnnotation(rpc.body)
      if (!http) {
        builder.warnings.push(
          `Skipped ${service.name}.${rpc.name} because it has no google.api.http annotation`
        )
        continue
      }

      const method = http.method
      const body = BODY_METHODS.has(method)
        ? JSON.stringify(messageFields.get(rpc.requestType) ?? {}, null, 2)
        : ''

      builder.requests.push({
        name: rpc.name,
        method,
        url: `{{baseUrl}}${convertPathParams(http.path)}`,
        headers: body ? [DEFAULT_HEADER] : [],
        body,
        bodyMode: body ? 'json' : 'none',
        auth: { type: 'none' },
        collectionKey,
      })
    }
  }

  return finishBuilder(builder)
}

function parseProtoMessages(content: string): Map<string, PlainRecord> {
  const messages = new Map<string, PlainRecord>()
  for (const block of extractNamedBlocks(content, 'message')) {
    const example: PlainRecord = {}
    const fieldPattern =
      /^\s*(optional|required|repeated)?\s*([A-Za-z0-9_.<>]+)\s+([A-Za-z0-9_]+)\s*=\s*\d+/gm
    let match: RegExpExecArray | null
    while ((match = fieldPattern.exec(block.body))) {
      const label = match[1]
      const type = match[2] ?? 'string'
      const name = match[3]
      if (name) example[name] = label === 'repeated' ? [] : protoTypeExample(type)
    }
    messages.set(block.name, example)
  }
  return messages
}

function protoTypeExample(type: string): unknown {
  if (
    /^(double|float|int32|int64|uint32|uint64|sint32|sint64|fixed32|fixed64|sfixed32|sfixed64)$/.test(
      type
    )
  ) {
    return 0
  }
  if (type === 'bool') return false
  return ''
}

function extractNamedBlocks(
  content: string,
  keyword: string
): Array<{ name: string; body: string }> {
  const blocks: Array<{ name: string; body: string }> = []
  const pattern = new RegExp(`\\b${keyword}\\s+([A-Za-z0-9_]+)\\s*\\{`, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content))) {
    const name = match[1]
    const openIndex = pattern.lastIndex - 1
    if (!name) continue
    const closeIndex = findMatchingBrace(content, openIndex)
    if (closeIndex === -1) continue
    blocks.push({ name, body: content.slice(openIndex + 1, closeIndex) })
    pattern.lastIndex = closeIndex + 1
  }
  return blocks
}

function findMatchingBrace(content: string, openIndex: number): number {
  let depth = 0
  for (let i = openIndex; i < content.length; i++) {
    const char = content[i]
    if (char === '{') depth++
    if (char === '}') depth--
    if (depth === 0) return i
  }
  return -1
}

function parseProtoRpcs(
  serviceBody: string
): Array<{ name: string; requestType: string; body: string }> {
  const rpcs: Array<{ name: string; requestType: string; body: string }> = []
  const pattern = /\brpc\s+([A-Za-z0-9_]+)\s*\(\s*([A-Za-z0-9_.]+)\s*\)\s+returns\s*\([^)]*\)\s*/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(serviceBody))) {
    const name = match[1]
    const requestType = match[2]?.split('.').pop()
    if (!name || !requestType) continue
    const restIndex = pattern.lastIndex
    if (serviceBody[restIndex] === '{') {
      const closeIndex = findMatchingBrace(serviceBody, restIndex)
      const body = closeIndex === -1 ? '' : serviceBody.slice(restIndex + 1, closeIndex)
      rpcs.push({ name, requestType, body })
      pattern.lastIndex = closeIndex === -1 ? restIndex : closeIndex + 1
    } else {
      rpcs.push({ name, requestType, body: '' })
    }
  }
  return rpcs
}

function parseProtoHttpAnnotation(body: string): { method: HttpMethod; path: string } | null {
  const match = body.match(/\b(get|post|put|patch|delete)\s*:\s*"([^"]+)"/)
  if (!match) return null
  return {
    method: normalizeMethod(match[1]),
    path: match[2] ?? '/',
  }
}
