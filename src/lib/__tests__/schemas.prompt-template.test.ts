import { describe, expect, it } from 'vitest'
import { promptTemplateRowSchema } from '@/lib/schemas'
import type { PromptTemplateVariable } from '@/types/models'

function makeRow(variables: PromptTemplateVariable[]) {
  return {
    id: 'saved',
    name: 'Saved Template',
    description: '',
    category: 'security',
    tags: '[]',
    prompt: 'Model {{feature}}',
    variables_schema: JSON.stringify(variables),
    estimated_tokens: 3,
    optimized_for: 'Generic',
    author: 'user',
    version: '1.0.0',
    tips: '[]',
    created_at: 1,
    updated_at: 1,
  }
}

describe('promptTemplateRowSchema', () => {
  it('keeps a variable description and example across a save and load', () => {
    // The row transform rebuilds each variable field by field. A field it does not copy is lost on
    // every reload, so the user writes help text once and never sees it again.
    const result = promptTemplateRowSchema.safeParse(
      makeRow([
        {
          name: 'feature',
          label: 'Feature',
          type: 'textarea',
          required: true,
          description: 'What the feature does.',
          example: 'A share link that expires after 24 hours.',
        },
      ])
    )

    expect(result.success).toBe(true)
    expect(result.data?.variables[0]).toMatchObject({
      description: 'What the feature does.',
      example: 'A share link that expires after 24 hours.',
    })
  })

  it('accepts the security category', () => {
    const result = promptTemplateRowSchema.safeParse(makeRow([]))

    expect(result.success).toBe(true)
    expect(result.data?.category).toBe('security')
  })
})
