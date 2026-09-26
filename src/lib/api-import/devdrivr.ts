import type { ApiImportResult } from '@/types/models'
import {
  addCollection,
  asArray,
  asRecord,
  asString,
  createBuilder,
  finishBuilder,
  normalizeAuth,
  normalizeBodyMode,
  normalizeHeaders,
  normalizeMethod,
} from '@/lib/api-import/shared'

const MAX_API_IMPORT_ENVIRONMENTS = 1_000

export function importDevdrivrJson(content: string): ApiImportResult {
  const parsed = JSON.parse(content) as unknown
  const builder = createBuilder('devdrivr-json', 'devdrivr Import')
  const envelope = asRecord(parsed)
  const items = Array.isArray(parsed) ? parsed : asArray(envelope?.['requests'])
  if (
    !Array.isArray(parsed) &&
    (!envelope || (envelope['version'] !== 2 && envelope['version'] !== 3))
  ) {
    throw new Error('Import failed - devdrivr JSON must be an array or version 2/3 library')
  }

  if (envelope?.['version'] === 2 || envelope?.['version'] === 3) {
    for (const item of asArray(envelope['folders'])) {
      const folder = asRecord(item)
      const key = asString(folder?.['key'])
      const name = asString(folder?.['name'])
      if (!folder || !key || !name) continue
      builder.collections.set(key, {
        key,
        name,
        parentKey: asString(folder['parentKey']),
        sortOrder: typeof folder['sortOrder'] === 'number' ? folder['sortOrder'] : 0,
      })
    }
  }

  for (const item of items) {
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
    if (collectionName) {
      collectionKey = addCollection(builder, collectionName, asString(obj['collectionKey']))
    }

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

  const result = finishBuilder(builder)
  if (envelope?.['version'] !== 3) return result

  const environments = asArray(envelope['environments']).flatMap((item) => {
    const environment = asRecord(item)
    const key = asString(environment?.['key'])
    const name = asString(environment?.['name'])
    const rawVariables = asRecord(environment?.['variables'])
    if (!key || !name || !rawVariables) {
      builder.warnings.push('Skipped an invalid API environment')
      return []
    }
    const variables = Object.fromEntries(
      Object.entries(rawVariables).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string'
      })
    )
    return [{ key, name, variables }]
  })
  if (environments.length > MAX_API_IMPORT_ENVIRONMENTS) {
    throw new Error(`Import failed - more than ${MAX_API_IMPORT_ENVIRONMENTS} environments`)
  }
  if (new Set(environments.map((environment) => environment.key)).size !== environments.length) {
    throw new Error('Import failed - duplicate API environment keys')
  }
  return {
    ...result,
    environments,
    activeEnvironmentKey: asString(envelope['activeEnvironmentKey']),
    warnings: builder.warnings,
  }
}
