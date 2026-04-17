import * as yaml from 'js-yaml'
import {
  Kind,
  parse as parseGraphql,
  print as printGraphql,
  type DefinitionNode,
  type DocumentNode,
  type FieldDefinitionNode,
  type FragmentDefinitionNode,
  type ObjectTypeDefinitionNode,
  type ObjectTypeExtensionNode,
  type OperationDefinitionNode,
  type SchemaDefinitionNode,
} from 'graphql'
import type {
  ApiHeader,
  ApiImportCollectionDraft,
  ApiImportFormat,
  ApiImportRequestDraft,
  ApiImportResult,
  ApiRequestAuth,
} from '@/types/models'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

type HttpMethod = (typeof HTTP_METHODS)[number]
type PlainRecord = Record<string, unknown>
type GraphqlObjectTypeNode = ObjectTypeDefinitionNode | ObjectTypeExtensionNode

type ImportBuilder = {
  format: ApiImportFormat
  sourceTitle: string
  collections: Map<string, ApiImportCollectionDraft>
  requests: ApiImportRequestDraft[]
  warnings: string[]
}

type SourceInput = {
  content: string
  filename?: string
}

const DEFAULT_HEADER: ApiHeader = {
  key: 'Content-Type',
  value: 'application/json',
  enabled: true,
}

export function importApiSpec(input: SourceInput): ApiImportResult {
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
    case 'cockpit-json':
      return importCockpitJson(content)
    default:
      throw new Error('Import failed - unsupported API specification')
  }
}

export function detectApiImportFormat(content: string, filename?: string): ApiImportFormat | null {
  const lowerName = filename?.toLowerCase() ?? ''
  if (lowerName.endsWith('.proto')) return 'protobuf'
  if (lowerName.endsWith('.graphql') || lowerName.endsWith('.gql')) return 'graphql'

  const parsed = parseJsonOrYaml(content)
  if (Array.isArray(parsed)) return 'cockpit-json'
  const root = asRecord(parsed)
  if (root) {
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

function importCockpitJson(content: string): ApiImportResult {
  const parsed = JSON.parse(content) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Import failed - cockpit JSON must be an array')
  }

  const builder = createBuilder('cockpit-json', 'Cockpit Import')
  for (const item of parsed) {
    const obj = asRecord(item)
    if (!obj) {
      builder.warnings.push('Skipped a non-object request entry')
      continue
    }
    const name = asString(obj['name']) ?? 'Imported Request'
    const url = asString(obj['url'])
    if (!url) {
      builder.warnings.push(`Skipped "${name}" because it has no URL`)
      continue
    }

    let collectionKey: string | null = null
    const collectionName = asString(obj['collectionName'])
    if (collectionName) collectionKey = addCollection(builder, collectionName)

    builder.requests.push({
      name,
      method: normalizeMethod(asString(obj['method'])),
      url,
      headers: normalizeHeaders(obj['headers']),
      body: asString(obj['body']) ?? '',
      bodyMode: normalizeBodyMode(asString(obj['bodyMode'])),
      auth: normalizeAuth(obj['auth']),
      collectionKey,
    })
  }

  return finishBuilder(builder)
}

function importPostman(content: string): ApiImportResult {
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

  const body = postmanBodyToText(request['body'])
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
    bodyMode: body ? detectBodyMode(body) : 'none',
    auth: normalizeAuth(authValue),
    collectionKey,
  })
}

function importOpenApi(content: string): ApiImportResult {
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

function importAsyncApi(content: string): ApiImportResult {
  const root = parseStructuredRecord(content, 'AsyncAPI document')
  const title = getInfoTitle(root) ?? 'AsyncAPI Import'
  const builder = createBuilder('asyncapi', title)
  const channels = asRecord(root['channels'])
  if (!channels) {
    builder.warnings.push('AsyncAPI document has no channels')
    return finishBuilder(builder)
  }

  const fallbackServerUrl = firstAsyncApiServerUrl(root) ?? '{{baseUrl}}'
  for (const [channelName, channelValue] of Object.entries(channels)) {
    const channel = asRecord(channelValue)
    if (!channel) continue
    const channelBindings = asRecord(channel['bindings'])
    const channelHttpBinding = asRecord(channelBindings?.['http'])

    for (const operationKey of ['publish', 'subscribe']) {
      const operation = asRecord(channel[operationKey])
      if (!operation) continue
      const httpBinding = asRecord(asRecord(operation['bindings'])?.['http']) ?? channelHttpBinding
      if (!httpBinding) {
        builder.warnings.push(
          `Skipped ${operationKey} ${channelName} because it has no HTTP binding`
        )
        continue
      }

      const method = normalizeMethod(asString(httpBinding['method']))
      const body = asyncApiMessageBodyToText(operation['message'])
      const serverUrl = asyncApiOperationServerUrl(root, operation) ?? fallbackServerUrl
      const collectionKey = addCollection(builder, title)

      builder.requests.push({
        name: asString(operation['operationId']) ?? `${method} ${channelName}`,
        method,
        url: appendPath(serverUrl, convertPathParams(channelName)),
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

function importProtobuf(content: string, filename?: string): ApiImportResult {
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

function importGraphql(content: string, filename?: string): ApiImportResult {
  let document: DocumentNode
  try {
    document = parseGraphql(content)
  } catch (err) {
    throw new Error(`Import failed - invalid GraphQL: ${(err as Error).message}`, { cause: err })
  }

  const sourceTitle = filename?.replace(/\.[^.]+$/, '') || 'GraphQL Import'
  const builder = createBuilder('graphql', sourceTitle)
  const collectionKey = addCollection(builder, sourceTitle)
  const operations = document.definitions.filter(isOperationDefinition)
  const fragments = document.definitions.filter(isFragmentDefinition)

  if (operations.length > 0) {
    for (const operation of operations) {
      if (operation.operation === 'subscription') {
        builder.warnings.push(`Skipped subscription ${operation.name?.value ?? 'operation'}`)
        continue
      }
      const operationName = operation.name?.value ?? `${capitalize(operation.operation)} Operation`
      const queryDocument: DocumentNode = {
        kind: Kind.DOCUMENT,
        definitions: [operation, ...fragments],
      }
      builder.requests.push(
        makeGraphqlRequest(operationName, printGraphql(queryDocument), {}, collectionKey)
      )
    }
    return finishBuilder(builder)
  }

  const roots = findGraphqlRootTypes(document)
  for (const definition of document.definitions) {
    if (!isGraphqlObjectTypeDefinition(definition)) continue
    const operation =
      definition.name.value === roots.mutation
        ? 'mutation'
        : definition.name.value === roots.query
          ? 'query'
          : null
    if (!operation) continue

    for (const field of definition.fields ?? []) {
      const operationName = `${capitalize(operation)} ${field.name.value}`
      const generated = buildGraphqlFieldOperation(operation, field)
      builder.requests.push(
        makeGraphqlRequest(operationName, generated.query, generated.variables, collectionKey)
      )
    }
  }

  if (builder.requests.length === 0) {
    builder.warnings.push('No GraphQL operations or root Query/Mutation fields found')
  }

  return finishBuilder(builder)
}

function createBuilder(format: ApiImportFormat, sourceTitle: string): ImportBuilder {
  return {
    format,
    sourceTitle,
    collections: new Map(),
    requests: [],
    warnings: [],
  }
}

function finishBuilder(builder: ImportBuilder): ApiImportResult {
  return {
    format: builder.format,
    sourceTitle: builder.sourceTitle,
    collections: Array.from(builder.collections.values()),
    requests: builder.requests,
    warnings: builder.warnings,
  }
}

function addCollection(builder: ImportBuilder, rawName: string): string {
  const name = rawName.trim() || builder.sourceTitle
  const key = name.toLowerCase()
  if (!builder.collections.has(key)) {
    builder.collections.set(key, { key, name })
  }
  return key
}

function parseJsonOrYaml(content: string): unknown {
  try {
    return JSON.parse(content) as unknown
  } catch {
    try {
      return yaml.load(content)
    } catch {
      return null
    }
  }
}

function parseStructuredRecord(content: string, label: string): PlainRecord {
  const parsed = parseJsonOrYaml(content)
  const root = asRecord(parsed)
  if (!root) throw new Error(`Import failed - ${label} must be an object`)
  return root
}

function asRecord(value: unknown): PlainRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as PlainRecord)
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  )
}

function normalizeMethod(value: string | null | undefined): HttpMethod {
  const upper = value?.toUpperCase()
  return HTTP_METHODS.find((method) => method === upper) ?? 'GET'
}

function normalizeBodyMode(value: string | null): string {
  return value === 'json' || value === 'text' || value === 'none' ? value : 'none'
}

function normalizeHeaders(value: unknown): ApiHeader[] {
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

function normalizeAuth(
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

  const type = asString(obj['type'])
  if (type === 'bearer') {
    const token = postmanAuthValue(obj, 'token')
    return token ? { type: 'bearer', token } : fallback
  }
  if (type === 'basic') {
    return {
      type: 'basic',
      username: postmanAuthValue(obj, 'username') ?? '',
      password: postmanAuthValue(obj, 'password') ?? '',
    }
  }

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

function isPostmanCollection(root: PlainRecord): boolean {
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

function postmanBodyToText(value: unknown): string {
  const body = asRecord(value)
  if (!body) return ''
  const mode = asString(body['mode'])
  if (mode === 'raw') return typeof body['raw'] === 'string' ? body['raw'] : ''
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
    return new URLSearchParams(entries).toString()
  }
  return ''
}

function detectBodyMode(body: string): string {
  try {
    JSON.parse(body)
    return 'json'
  } catch {
    return 'text'
  }
}

function getInfoTitle(root: PlainRecord): string | null {
  return asString(asRecord(root['info'])?.['title'])
}

function firstOpenApiServerUrl(root: PlainRecord): string | null {
  const server = asRecord(asArray(root['servers'])[0])
  return asString(server?.['url'])
}

function firstAsyncApiServerUrl(root: PlainRecord): string | null {
  const servers = asRecord(root['servers'])
  if (!servers) return null
  for (const value of Object.values(servers)) {
    const url = asString(asRecord(value)?.['url'])
    if (url) return url
  }
  return null
}

function asyncApiOperationServerUrl(root: PlainRecord, operation: PlainRecord): string | null {
  const serverNames = asStringArray(operation['servers'])
  if (serverNames.length === 0) return null
  const servers = asRecord(root['servers'])
  return asString(asRecord(servers?.[serverNames[0] ?? ''])?.['url'])
}

function appendPath(baseUrl: string, pathName: string): string {
  if (!baseUrl) return pathName
  const left = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const right = pathName.startsWith('/') ? pathName : `/${pathName}`
  return `${left}${right}`
}

function convertPathParams(pathName: string): string {
  return pathName.replace(/\{([^}]+)\}/g, '{{$1}}')
}

function appendQueryParams(url: string, params: string[]): string {
  if (params.length === 0) return url
  return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`
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

function readExample(media: PlainRecord): unknown {
  if ('example' in media) return media['example']
  const examples = asRecord(media['examples'])
  if (!examples) return undefined
  const first = asRecord(Object.values(examples)[0])
  return first && 'value' in first ? first['value'] : undefined
}

function stringifyBody(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function schemaToExample(schema: PlainRecord): unknown {
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

function asyncApiMessageBodyToText(value: unknown): string {
  const messages = Array.isArray(value) ? value : [value]
  const message = asRecord(messages.find((item) => asRecord(item)))
  if (!message) return ''
  const example = readExample(message)
  if (example !== undefined) return stringifyBody(example)
  const examples = asArray(message['examples'])
  const firstExample = asRecord(examples[0])
  if (firstExample && 'payload' in firstExample) return stringifyBody(firstExample['payload'])
  const payload = asRecord(message['payload'])
  return payload ? JSON.stringify(schemaToExample(payload), null, 2) : ''
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

function isOperationDefinition(definition: DefinitionNode): definition is OperationDefinitionNode {
  return definition.kind === Kind.OPERATION_DEFINITION
}

function isFragmentDefinition(definition: DefinitionNode): definition is FragmentDefinitionNode {
  return definition.kind === Kind.FRAGMENT_DEFINITION
}

function isGraphqlObjectTypeDefinition(
  definition: DefinitionNode
): definition is GraphqlObjectTypeNode {
  return (
    definition.kind === Kind.OBJECT_TYPE_DEFINITION ||
    definition.kind === Kind.OBJECT_TYPE_EXTENSION
  )
}

function makeGraphqlRequest(
  name: string,
  query: string,
  variables: PlainRecord,
  collectionKey: string
): ApiImportRequestDraft {
  return {
    name,
    method: 'POST',
    url: '{{graphqlUrl}}',
    headers: [DEFAULT_HEADER],
    body: JSON.stringify({ query, variables }, null, 2),
    bodyMode: 'json',
    auth: { type: 'none' },
    collectionKey,
  }
}

function findGraphqlRootTypes(document: DocumentNode): { query: string; mutation: string } {
  const schema = document.definitions.find(
    (definition): definition is SchemaDefinitionNode => definition.kind === Kind.SCHEMA_DEFINITION
  )
  const query = schema?.operationTypes.find((operation) => operation.operation === 'query')?.type
    .name.value
  const mutation = schema?.operationTypes.find((operation) => operation.operation === 'mutation')
    ?.type.name.value
  return {
    query: query ?? 'Query',
    mutation: mutation ?? 'Mutation',
  }
}

function buildGraphqlFieldOperation(
  operation: 'query' | 'mutation',
  field: FieldDefinitionNode
): { query: string; variables: PlainRecord } {
  const variables: PlainRecord = {}
  const variableDefs: string[] = []
  const args: string[] = []
  for (const arg of field.arguments ?? []) {
    const name = arg.name.value
    variableDefs.push(`$${name}: ${printGraphql(arg.type)}`)
    args.push(`${name}: $${name}`)
    variables[name] = null
  }
  const operationName = `${capitalize(operation)}${capitalize(field.name.value)}`
  const variableText = variableDefs.length > 0 ? `(${variableDefs.join(', ')})` : ''
  const argText = args.length > 0 ? `(${args.join(', ')})` : ''
  return {
    query: `${operation} ${operationName}${variableText} {\n  ${field.name.value}${argText}\n}`,
    variables,
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
