/** Starter schema + matching sample pairs, offered from the toolbar picker. */
export type SchemaTemplate = {
  label: string
  /** One line explaining what the template demonstrates. */
  hint: string
  schema: object
  sample: object
}

export const TEMPLATES: Record<string, SchemaTemplate> = {
  basic: {
    label: 'Basic object',
    hint: 'Types, minimum, required, and an email format',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer', minimum: 0 },
        email: { type: 'string', format: 'email' },
      },
      required: ['name', 'email'],
    },
    sample: { name: 'Alice', age: 30, email: 'alice@example.com' },
  },
  array: {
    label: 'Array of objects',
    hint: 'Item schema plus minItems',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string', minLength: 1 },
          done: { type: 'boolean' },
        },
        required: ['id', 'title'],
      },
      minItems: 1,
    },
    sample: [
      { id: 1, title: 'Buy groceries', done: false },
      { id: 2, title: 'Walk the dog', done: true },
    ],
  },
  nested: {
    label: 'Nested objects',
    hint: 'Objects inside objects with a pattern',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                zip: { type: 'string', pattern: '^\\d{5}$' },
              },
              required: ['street', 'city'],
            },
          },
          required: ['name'],
        },
      },
    },
    sample: {
      user: {
        name: 'Bob',
        address: { street: '123 Main St', city: 'Springfield', zip: '62704' },
      },
    },
  },
  enum: {
    label: 'Enum / oneOf',
    hint: 'Fixed value sets and alternative shapes',
    schema: {
      type: 'object',
      properties: {
        status: { enum: ['active', 'inactive', 'pending'] },
        priority: {
          oneOf: [
            { type: 'integer', minimum: 1, maximum: 5 },
            { type: 'string', enum: ['low', 'medium', 'high'] },
          ],
        },
      },
      required: ['status'],
    },
    sample: { status: 'active', priority: 3 },
  },
  formats: {
    label: 'String formats',
    hint: 'email, uri, date-time, ipv4, uuid',
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        website: { type: 'string', format: 'uri' },
        created: { type: 'string', format: 'date-time' },
        ip: { type: 'string', format: 'ipv4' },
        uuid: { type: 'string', format: 'uuid' },
      },
    },
    sample: {
      email: 'test@example.com',
      website: 'https://example.com',
      created: '2026-03-23T12:00:00Z',
      ip: '192.168.1.1',
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    },
  },
  allOf: {
    label: 'allOf composition',
    hint: 'Two schemas that must both hold',
    schema: {
      allOf: [
        {
          type: 'object',
          properties: { id: { type: 'integer' } },
          required: ['id'],
        },
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'user', 'guest'] },
          },
          required: ['name', 'role'],
        },
      ],
    },
    sample: { id: 1, name: 'Admin', role: 'admin' },
  },
  conditional: {
    label: 'Conditional (if/then)',
    hint: 'A field required only for one variant',
    schema: {
      type: 'object',
      properties: {
        type: { enum: ['personal', 'business'] },
        company: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['type', 'name'],
      // `type: 'object'` on both branches, and `properties` repeated in `then`,
      // keep the template compilable under the tool's own strict mode — Ajv
      // rejects `properties`/`required` on a subschema of unstated type.
      if: { type: 'object', properties: { type: { const: 'business' } } },
      then: { type: 'object', properties: { company: { type: 'string' } }, required: ['company'] },
    },
    sample: { type: 'business', name: 'Bob', company: 'Acme Corp' },
  },
}

export const DEFAULT_TEMPLATE_KEY = 'basic'

/** The template whose schema matches `schema`, if any — used for samples. */
export function findMatchingTemplate(schema: unknown): SchemaTemplate | null {
  const serialized = JSON.stringify(schema)
  for (const template of Object.values(TEMPLATES)) {
    if (JSON.stringify(template.schema) === serialized) return template
  }
  return null
}
