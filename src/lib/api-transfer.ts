/**
 * Serializes the API library to the `devdrivr-api` backup format.
 *
 * `src/lib/api-import.ts` reads this format back. Keep {@link API_EXPORT_VERSION} in step with the
 * versions that parser accepts, because an export it cannot read is a backup the user cannot
 * restore.
 */
import type { ApiCollection, ApiEnvironment, ApiRequest } from '@/types/models'

export const API_EXPORT_FORMAT = 'devdrivr-api'
export const API_EXPORT_VERSION = 3

export type ApiExportInput = {
  collections: ApiCollection[]
  requests: ApiRequest[]
  environments: ApiEnvironment[]
  activeEnvironmentId: string | null
}

/**
 * Builds the backup as pretty-printed JSON.
 *
 * Collections and environments travel by `key` rather than by database id. The importer mints new
 * ids, so a backup restored into the same workspace does not collide with the rows it came from.
 */
export function serializeApiExport(input: ApiExportInput): string {
  const { collections, requests, environments, activeEnvironmentId } = input

  const exportCollectionById = new Map(
    collections.map((collection) => [collection.id, { key: collection.id, name: collection.name }])
  )

  const exportRequests = requests.map((request) => {
    const collection = request.collectionId
      ? exportCollectionById.get(request.collectionId)
      : undefined
    return {
      name: request.name,
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      bodyMode: request.bodyMode,
      auth: request.auth,
      collectionKey: collection?.key ?? null,
      collectionName: collection?.name ?? null,
    }
  })

  return JSON.stringify(
    {
      format: API_EXPORT_FORMAT,
      version: API_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      folders: collections.map((collection) => ({
        key: collection.id,
        name: collection.name,
        parentKey: collection.parentId ?? null,
        sortOrder: collection.sortOrder ?? 0,
      })),
      requests: exportRequests,
      environments: environments.map((environment) => ({
        key: environment.id,
        name: environment.name,
        variables: environment.variables,
      })),
      activeEnvironmentKey: activeEnvironmentId,
    },
    null,
    2
  )
}
