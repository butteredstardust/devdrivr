import type { Snippet, SnippetFragment } from '@/types/models'

export function fragmentsForSnippet(snippet: Snippet): SnippetFragment[] {
  if (snippet.fragments?.length) {
    return [...snippet.fragments].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt
    )
  }
  return [
    {
      id: `${snippet.id}:fragment:1`,
      name: 'main',
      content: snippet.content,
      language: snippet.language || 'text',
      sortOrder: 0,
      createdAt: snippet.createdAt,
      updatedAt: snippet.updatedAt,
    },
  ]
}

export function normalizeSnippet(snippet: Snippet): Snippet {
  const sourceFragments = snippet.fragments?.length
    ? [...snippet.fragments]
    : fragmentsForSnippet(snippet)
  const fragments = sourceFragments.map((fragment, index) => ({
    ...fragment,
    name: fragment.name.trim() || `fragment ${index + 1}`,
    language: fragment.language || 'text',
    sortOrder: index,
  }))
  const primary = fragments[0]!
  return {
    ...snippet,
    description: snippet.description ?? '',
    fragments,
    content: primary.content,
    language: primary.language,
  }
}
