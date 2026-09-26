import type { ApiHeader, ApiImportResult, ApiRequestAuth } from '@/types/models'
import {
  HTTP_METHODS,
  addCollection,
  appendPath,
  appendQueryParams,
  asArray,
  asRecord,
  asString,
  asStringArray,
  convertPathParams,
  createBuilder,
  DEFAULT_HEADER,
  finishBuilder,
  getInfoTitle,
  parseStructuredRecord,
  readExample,
  schemaToExample,
  stringifyBody,
  type ImportBuilder,
  type PlainRecord,
} from '@/lib/api-import/shared'

export function importOpenApi(content: string): ApiImportResult {
  const root = parseStructuredRecord(content, 'OpenAPI document')
  const title = getInfoTitle(root) ?? 'OpenAPI Import'
  const builder = createBuilder('openapi', title)
  const baseUrl = firstOpenApiServerUrl(root) ?? '{{baseUrl}}'
  const paths = asRecord(root['paths'])

  if (!paths) {
    builder.warnings.push('OpenAPI document has no paths')
    return finishBuilder(builder)
  }

  for (const [pathName, pathValue] of Object.entries(paths)) {
    const pathItem = asRecord(pathValue)
    if (!pathItem) continue
    for (const methodName of HTTP_METHODS) {
      const operation = asRecord(pathItem[methodName.toLowerCase()])
      if (!operation) continue

      const operationName =
        asString(operation['summary']) ??
        asString(operation['operationId']) ??
        `${methodName} ${pathName}`
      const tags = asStringArray(operation['tags'])
      const collectionKey = addCollection(builder, tags[0] ?? title)
      const url = appendPath(baseUrl, convertPathParams(pathName))
      const queryParams = collectOpenApiQueryParams(pathItem, operation)
      const body = openApiRequestBodyToText(operation['requestBody'])
      const auth = openApiAuth(root, operation, builder)
      const headers = openApiHeaders(operation, body)
      const apiKey = openApiApiKey(root, operation, builder)
      if (apiKey?.location === 'header') {
        headers.push({ key: apiKey.name, value: apiKey.value, enabled: true })
      } else if (apiKey?.location === 'query') {
        queryParams.push(`${encodeURIComponent(apiKey.name)}=${encodeURIComponent(apiKey.value)}`)
      }

      builder.requests.push({
        name: operationName,
        method: methodName,
        url: appendQueryParams(url, queryParams),
        headers,
        body,
        bodyMode: body ? 'json' : 'none',
        auth,
        collectionKey,
      })
    }
  }

  return finishBuilder(builder)
}

function firstOpenApiServerUrl(root: PlainRecord): string | null {
  const server = asRecord(asArray(root['servers'])[0])
  return asString(server?.['url'])
}

function collectOpenApiQueryParams(pathItem: PlainRecord, operation: PlainRecord): string[] {
  const params = [...asArray(pathItem['parameters']), ...asArray(operation['parameters'])]
  const seen = new Set<string>()
  const result: string[] = []
  for (const param of params) {
    const obj = asRecord(param)
    if (!obj || obj['in'] !== 'query') continue
    const name = asString(obj['name'])
    if (obj['required'] !== true) continue
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push(`${encodeURIComponent(name)}={{${name}}}`)
  }
  return result
}

function openApiRequestBodyToText(value: unknown): string {
  const body = asRecord(value)
  const content = asRecord(body?.['content'])
  if (!content) return ''
  const jsonMedia =
    asRecord(content['application/json']) ??
    Object.entries(content)
      .map(([, media]) => asRecord(media))
      .find((media) => media !== null)
  if (!jsonMedia) return ''

  const example = readExample(jsonMedia)
  if (example !== undefined) return stringifyBody(example)
  const schema = asRecord(jsonMedia['schema'])
  return schema ? JSON.stringify(schemaToExample(schema), null, 2) : ''
}

function openApiHeaders(operation: PlainRecord, body: string): ApiHeader[] {
  const headers = body ? [DEFAULT_HEADER] : []
  const params = asArray(operation['parameters'])
  for (const param of params) {
    const obj = asRecord(param)
    if (obj?.['in'] !== 'header') continue
    const name = asString(obj['name'])
    if (name) headers.push({ key: name, value: `{{${name}}}`, enabled: true })
  }
  return headers
}

function openApiAuth(
  root: PlainRecord,
  operation: PlainRecord,
  builder: ImportBuilder
): ApiRequestAuth {
  const securityReq = firstOpenApiSecurityRequirement(root, operation)
  if (!securityReq) return { type: 'none' }
  const schemes =
    asRecord(asRecord(root['components'])?.['securitySchemes']) ??
    asRecord(root['securityDefinitions'])
  if (!schemes) return { type: 'none' }

  const schemeName = Object.keys(securityReq)[0]
  const scheme = asRecord(schemeName ? schemes[schemeName] : null)
  if (!schemeName || !scheme) return { type: 'none' }

  const type = asString(scheme['type'])
  const httpScheme = asString(scheme['scheme'])?.toLowerCase()
  if (type === 'http' && httpScheme === 'bearer') {
    return { type: 'bearer', token: `{{${schemeName}}}` }
  }
  if (type === 'http' && httpScheme === 'basic') {
    return { type: 'basic', username: '{{username}}', password: '{{password}}' }
  }
  if (type === 'apiKey') {
    return { type: 'none' }
  }
  if (type) builder.warnings.push(`Skipped unsupported security scheme "${schemeName}" (${type})`)
  return { type: 'none' }
}

function openApiApiKey(
  root: PlainRecord,
  operation: PlainRecord,
  builder: ImportBuilder
): { location: 'header' | 'query'; name: string; value: string } | null {
  const securityReq = firstOpenApiSecurityRequirement(root, operation)
  if (!securityReq) return null
  const schemes =
    asRecord(asRecord(root['components'])?.['securitySchemes']) ??
    asRecord(root['securityDefinitions'])
  if (!schemes) return null

  const schemeName = Object.keys(securityReq)[0]
  const scheme = asRecord(schemeName ? schemes[schemeName] : null)
  if (!schemeName || !scheme || scheme['type'] !== 'apiKey') return null

  const location = asString(scheme['in'])
  const name = asString(scheme['name'])
  if ((location === 'header' || location === 'query') && name) {
    return { location, name, value: `{{${schemeName}}}` }
  }

  builder.warnings.push(`Skipped unsupported API key security "${schemeName}"`)
  return null
}

function firstOpenApiSecurityRequirement(
  root: PlainRecord,
  operation: PlainRecord
): PlainRecord | null {
  const security = Object.prototype.hasOwnProperty.call(operation, 'security')
    ? operation['security']
    : root['security']
  const requirements = asArray(security)
  if (requirements.length === 0) return null
  return asRecord(requirements[0])
}
