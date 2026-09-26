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
import type { ApiImportRequestDraft, ApiImportResult } from '@/types/models'
import {
  addCollection,
  createBuilder,
  DEFAULT_HEADER,
  finishBuilder,
  type PlainRecord,
} from '@/lib/api-import/shared'

type GraphqlObjectTypeNode = ObjectTypeDefinitionNode | ObjectTypeExtensionNode

export function importGraphql(content: string, filename?: string): ApiImportResult {
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
