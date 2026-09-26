import type { ApiImportFormat, ApiImportResult } from '@/types/models'
import { importAsyncApi } from '@/lib/api-import/asyncapi'
import { importDevdrivrJson } from '@/lib/api-import/devdrivr'
import { importGraphql } from '@/lib/api-import/graphql'
import { importOpenApi } from '@/lib/api-import/openapi'
import { importPostman, isPostmanCollection } from '@/lib/api-import/postman'
import { importProtobuf } from '@/lib/api-import/protobuf'
import {
  asRecord,
  MAX_API_IMPORT_BYTES,
  parseJsonOrYaml,
  type SourceInput,
} from '@/lib/api-import/shared'

export { BODY_MODE_IDS, MAX_API_IMPORT_BYTES } from '@/lib/api-import/shared'

export function importApiSpec(input: SourceInput): ApiImportResult {
  if (new TextEncoder().encode(input.content).length > MAX_API_IMPORT_BYTES) {
    throw new Error('Import failed - input exceeds the 20 MB limit')
  }
  const content = input.content.trim()
  if (!content) {
    throw new Error('Import failed - input is empty')
  }

  const detected = detectApiImportFormat(content, input.filename)
  switch (detected) {
    case 'postman':
      return importPostman(content)
    case 'openapi':
      return importOpenApi(content)
    case 'asyncapi':
      return importAsyncApi(content)
    case 'protobuf':
      return importProtobuf(content, input.filename)
    case 'graphql':
      return importGraphql(content, input.filename)
    case 'devdrivr-json':
      return importDevdrivrJson(content)
    default:
      throw new Error('Import failed - unsupported API specification')
  }
}

export function detectApiImportFormat(content: string, filename?: string): ApiImportFormat | null {
  const lowerName = filename?.toLowerCase() ?? ''
  if (lowerName.endsWith('.proto')) return 'protobuf'
  if (lowerName.endsWith('.graphql') || lowerName.endsWith('.gql')) return 'graphql'

  const parsed = parseJsonOrYaml(content)
  if (Array.isArray(parsed)) return 'devdrivr-json'
  const root = asRecord(parsed)
  if (root) {
    if ((root['version'] === 2 || root['version'] === 3) && Array.isArray(root['requests']))
      return 'devdrivr-json'
    if (isPostmanCollection(root)) return 'postman'
    if (typeof root['openapi'] === 'string' || typeof root['swagger'] === 'string') return 'openapi'
    if (typeof root['asyncapi'] === 'string') return 'asyncapi'
  }

  if (/\bsyntax\s*=\s*["']proto3?["']/.test(content) || /\bservice\s+\w+\s*\{/.test(content)) {
    return 'protobuf'
  }

  if (
    /\b(query|mutation|subscription|schema|type|interface|input|fragment)\b/.test(content) &&
    /[{}]/.test(content)
  ) {
    return 'graphql'
  }

  return null
}
