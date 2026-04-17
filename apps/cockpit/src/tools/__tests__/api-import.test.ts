import { describe, expect, it } from 'vitest'
import { detectApiImportFormat, importApiSpec } from '@/lib/api-import'

describe('api import parser', () => {
  it('imports nested Postman collection requests', () => {
    const result = importApiSpec({
      filename: 'collection.json',
      content: JSON.stringify({
        info: {
          name: 'Example API',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        auth: {
          type: 'apikey',
          apikey: [
            { key: 'key', value: 'X-API-Key' },
            { key: 'value', value: '{{apiKey}}' },
            { key: 'in', value: 'header' },
          ],
        },
        item: [
          {
            name: 'Users',
            item: [
              {
                name: 'Create user',
                request: {
                  method: 'POST',
                  url: '{{baseUrl}}/users',
                  header: [{ key: 'Content-Type', value: 'application/json' }],
                  body: { mode: 'raw', raw: '{"name":"Ada"}' },
                  auth: {
                    type: 'bearer',
                    bearer: [{ key: 'token', value: '{{token}}' }],
                  },
                },
              },
              {
                name: 'List users',
                request: {
                  method: 'GET',
                  url: '{{baseUrl}}/users',
                  header: [],
                },
              },
            ],
          },
        ],
      }),
    })

    expect(result.format).toBe('postman')
    expect(result.collections.map((collection) => collection.name)).toEqual(['Example API / Users'])
    expect(result.requests[0]).toMatchObject({
      name: 'Create user',
      method: 'POST',
      url: '{{baseUrl}}/users',
      bodyMode: 'json',
      auth: { type: 'bearer', token: '{{token}}' },
    })
    expect(result.requests[1]?.headers).toContainEqual({
      key: 'X-API-Key',
      value: '{{apiKey}}',
      enabled: true,
    })
  })

  it('imports OpenAPI operations from YAML', () => {
    const result = importApiSpec({
      filename: 'openapi.yaml',
      content: `
openapi: 3.0.3
info:
  title: Petstore
servers:
  - url: https://api.example.com
security:
  - ApiKey: []
components:
  securitySchemes:
    ApiKey:
      type: apiKey
      in: header
      name: X-API-Key
paths:
  /pets/{id}:
    get:
      tags: [pets]
      summary: Get pet
      parameters:
        - in: query
          name: include
          required: true
          schema: { type: string }
    post:
      tags: [pets]
      operationId: updatePet
      requestBody:
        content:
          application/json:
            example:
              name: Luna
`,
    })

    expect(result.format).toBe('openapi')
    expect(result.requests).toHaveLength(2)
    expect(result.requests[0]).toMatchObject({
      name: 'Get pet',
      method: 'GET',
      url: 'https://api.example.com/pets/{{id}}?include={{include}}',
      collectionKey: 'pets',
    })
    expect(result.requests[0]?.headers).toContainEqual({
      key: 'X-API-Key',
      value: '{{ApiKey}}',
      enabled: true,
    })
    expect(result.requests[1]).toMatchObject({
      name: 'updatePet',
      method: 'POST',
      bodyMode: 'json',
    })
    expect(result.requests[1]?.body).toContain('"name": "Luna"')
  })

  it('honors OpenAPI operation security overrides and skips optional query params', () => {
    const result = importApiSpec({
      filename: 'openapi.json',
      content: JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Security API' },
        security: [{ BearerAuth: [] }],
        components: {
          securitySchemes: {
            BearerAuth: { type: 'http', scheme: 'bearer' },
          },
        },
        paths: {
          '/public': {
            get: {
              security: [],
              parameters: [
                { in: 'query', name: 'optional', schema: { type: 'string' } },
                { in: 'query', name: 'required', required: true, schema: { type: 'string' } },
              ],
            },
          },
        },
      }),
    })

    expect(result.requests[0]).toMatchObject({
      auth: { type: 'none' },
      url: '{{baseUrl}}/public?required={{required}}',
    })
  })

  it('imports AsyncAPI HTTP bindings and skips non-HTTP operations', () => {
    const result = importApiSpec({
      filename: 'asyncapi.yaml',
      content: `
asyncapi: 2.6.0
info:
  title: Events API
servers:
  prod:
    url: https://events.example.com
channels:
  /events:
    publish:
      operationId: CreateEvent
      bindings:
        http:
          method: POST
      message:
        payload:
          type: object
          properties:
            name: { type: string }
  /ignored:
    publish:
      operationId: Ignored
`,
    })

    expect(result.format).toBe('asyncapi')
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0]).toMatchObject({
      name: 'CreateEvent',
      method: 'POST',
      url: 'https://events.example.com/events',
    })
    expect(result.warnings[0]).toContain('no HTTP binding')
  })

  it('imports protobuf google.api.http annotations', () => {
    const result = importApiSpec({
      filename: 'users.proto',
      content: `
syntax = "proto3";
package demo.users;

service Users {
  rpc GetUser (GetUserRequest) returns (User) {
    option (google.api.http) = {
      get: "/v1/users/{id}"
    };
  }
  rpc CreateUser (CreateUserRequest) returns (User) {
    option (google.api.http) = {
      post: "/v1/users"
      body: "*"
    };
  }
  rpc Internal (GetUserRequest) returns (User);
}

message GetUserRequest {
  string id = 1;
}

message CreateUserRequest {
  string name = 1;
  int32 age = 2;
  repeated string tags = 3;
}
`,
    })

    expect(result.format).toBe('protobuf')
    expect(result.collections[0]?.name).toBe('demo.users.Users')
    expect(result.requests).toHaveLength(2)
    expect(result.requests[0]).toMatchObject({
      name: 'GetUser',
      method: 'GET',
      url: '{{baseUrl}}/v1/users/{{id}}',
      bodyMode: 'none',
    })
    expect(result.requests[1]?.body).toContain('"name": ""')
    expect(result.requests[1]?.body).toContain('"tags": []')
    expect(result.warnings[0]).toContain('Internal')
  })

  it('imports GraphQL operation documents', () => {
    const result = importApiSpec({
      filename: 'users.graphql',
      content: `
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
  }
}

subscription UserEvents {
  userEvents { id }
}
`,
    })

    expect(result.format).toBe('graphql')
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0]).toMatchObject({
      name: 'GetUser',
      method: 'POST',
      url: '{{graphqlUrl}}',
      bodyMode: 'json',
    })
    expect(result.requests[0]?.body).toContain('GetUser')
    expect(result.warnings[0]).toContain('subscription')
  })

  it('imports GraphQL SDL root fields', () => {
    const result = importApiSpec({
      filename: 'schema.graphql',
      content: `
type Query {
  viewer: User
}

type Mutation {
  createUser(name: String!): User
}

type User {
  id: ID!
}
`,
    })

    expect(result.requests.map((request) => request.name)).toEqual([
      'Query viewer',
      'Mutation createUser',
    ])
    expect(result.requests[1]?.body).toContain('$name: String!')
  })

  it('imports GraphQL SDL root fields from extensions', () => {
    const result = importApiSpec({
      filename: 'schema.graphql',
      content: `
type Query {
  viewer: User
}

extend type Query {
  users: [User!]!
}

type User {
  id: ID!
}
`,
    })

    expect(result.requests.map((request) => request.name)).toEqual(['Query viewer', 'Query users'])
  })

  it('keeps cockpit JSON array import compatible', () => {
    const result = importApiSpec({
      content: JSON.stringify([
        {
          name: 'Health',
          method: 'GET',
          url: '{{baseUrl}}/health',
          headers: [],
          body: '',
          bodyMode: 'none',
          auth: { type: 'none' },
        },
      ]),
    })

    expect(result.format).toBe('cockpit-json')
    expect(result.requests[0]).toMatchObject({
      name: 'Health',
      method: 'GET',
      url: '{{baseUrl}}/health',
    })
  })

  it('detects protobuf and GraphQL by filename', () => {
    expect(detectApiImportFormat('service Test {}', 'test.proto')).toBe('protobuf')
    expect(detectApiImportFormat('type Query { viewer: User }', 'schema.gql')).toBe('graphql')
  })
})
