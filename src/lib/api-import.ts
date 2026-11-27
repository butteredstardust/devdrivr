import type { ApiImportFormat, ApiImportResult } from '@/types/models'
import {
  asRecord,
  isPostmanCollection,
  MAX_API_IMPORT_BYTES,
  type PlainRecord,
  type SourceInput,
} from '@/lib/api-import/shared'

export { BODY_MODE_IDS, MAX_API_IMPORT_BYTES } from '@/lib/api-import/shared'

type DetectedFormat =
  | { format: 'postman' | 'openapi' | 'asyncapi'; root: PlainRecord }
  | { format: 'protobuf' | 'graphql' | 'devdrivr-json' }

export async function importApiSpec(input: SourceInput): Promise<ApiImportResult> {
  if (new TextEncoder().encode(input.content).length > MAX_API_IMPORT_BYTES) {
    throw new Error('Import failed - input exceeds the 20 MB limit')
  }
  const content = input.content.trim()
  if (!content) throw new Error('Import failed - input is empty')

  const detected = await detectFormat(content, input.filename)
  switch (detected?.format) {
    case 'postman':
      return (await import('@/lib/api-import/postman')).importPostman(detected.root)
    case 'openapi':
      return (await import('@/lib/api-import/openapi')).importOpenApi(detected.root)
    case 'asyncapi':
      return (await import('@/lib/api-import/asyncapi')).importAsyncApi(detected.root)
    case 'protobuf':
      return (await import('@/lib/api-import/protobuf')).importProtobuf(content, input.filename)
    case 'graphql':
      return (await import('@/lib/api-import/graphql')).importGraphql(content, input.filename)
    case 'devdrivr-json':
      return (await import('@/lib/api-import/devdrivr')).importDevdrivrJson(content)
    default:
      throw new Error('Import failed - unsupported API specification')
  }
}

export async function detectApiImportFormat(
  content: string,
  filename?: string
): Promise<ApiImportFormat | null> {
  return (await detectFormat(content, filename))?.format ?? null
}

async function detectFormat(content: string, filename?: string): Promise<DetectedFormat | null> {
  const lowerName = filename?.toLowerCase() ?? ''
  if (lowerName.endsWith('.proto')) return { format: 'protobuf' }
  if (lowerName.endsWith('.graphql') || lowerName.endsWith('.gql')) return { format: 'graphql' }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = (await import('@/lib/api-import/yaml')).parseYaml(content)
  }

  if (Array.isArray(parsed)) return { format: 'devdrivr-json' }
  const root = asRecord(parsed)
  if (root) {
    if ((root['version'] === 2 || root['version'] === 3) && Array.isArray(root['requests']))
      return { format: 'devdrivr-json' }
    if (isPostmanCollection(root)) return { format: 'postman', root }
    if (typeof root['openapi'] === 'string' || typeof root['swagger'] === 'string')
      return { format: 'openapi', root }
    if (typeof root['asyncapi'] === 'string') return { format: 'asyncapi', root }
  }

  if (/\bsyntax\s*=\s*["']proto3?["']/.test(content) || /\bservice\s+\w+\s*\{/.test(content)) {
    return { format: 'protobuf' }
  }

  if (
    /\b(query|mutation|subscription|schema|type|interface|input|fragment)\b/.test(content) &&
    /[{}]/.test(content)
  ) {
    return { format: 'graphql' }
  }

  return null
}
