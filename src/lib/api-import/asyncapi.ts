import type { ApiImportResult } from '@/types/models'
import {
  addCollection,
  appendPath,
  asArray,
  asRecord,
  asString,
  asStringArray,
  convertPathParams,
  createBuilder,
  DEFAULT_HEADER,
  finishBuilder,
  getInfoTitle,
  normalizeMethod,
  parseStructuredRecord,
  readExample,
  schemaToExample,
  stringifyBody,
  type PlainRecord,
} from '@/lib/api-import/shared'

export function importAsyncApi(content: string): ApiImportResult {
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
