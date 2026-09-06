import { describe, expect, it } from 'vitest'
import type { ApiCollection, ApiRequest, Note, ResourceFolder } from '@/types/models'
import {
  backlinksForResource,
  buildWikiResources,
  findWikiTrigger,
  parseInternalResourceHref,
  parseWikiLinks,
  renderWikiLinks,
  wikiToken,
} from '@/lib/wiki-links'

const folders: ResourceFolder[] = [
  {
    id: 'notes-inbox',
    name: 'Inbox',
    parentId: null,
    kind: 'notes',
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'notes-project',
    name: 'Project',
    parentId: 'notes-inbox',
    kind: 'notes',
    sortOrder: 1,
    createdAt: 0,
    updatedAt: 0,
  },
]

function note(id: string, title: string, content = '', folderId = 'notes-inbox'): Note {
  return {
    id,
    title,
    content,
    color: 'yellow',
    pinned: false,
    poppedOut: false,
    tags: [],
    sortOrder: 0,
    folderId,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('stable wiki links', () => {
  it('parses stable identities and leaves legacy title-only content untouched', () => {
    const content = 'See [[note:note-1|Plan]] and legacy [[Plan]].'
    expect(parseWikiLinks(content)).toEqual([
      expect.objectContaining({ kind: 'note', id: 'note-1', label: 'Plan' }),
    ])
    expect(renderWikiLinks(content, [])).toContain('legacy [[Plan]]')
  })

  it('renders only live targets as safe internal fragment links', () => {
    const resources = buildWikiResources([note('note-1', 'Renamed plan')], [], [], folders, [])
    const rendered = renderWikiLinks('[[note:note-1|Old title]] [[snippet:gone|Gone]]', resources)
    expect(rendered).toContain('[Renamed plan](#devdrivr-resource:note:note-1)')
    expect(rendered).toContain('Gone *(unavailable)*')
    expect(parseInternalResourceHref('#devdrivr-resource:note:note-1')).toEqual({
      kind: 'note',
      id: 'note-1',
    })
    expect(parseInternalResourceHref('javascript:alert(1)')).toBeNull()
  })

  it('uses folder paths and IDs only when duplicate titles require disambiguation', () => {
    const resources = buildWikiResources(
      [note('note-1', 'Plan'), note('note-2', 'Plan', '', 'notes-project')],
      [],
      [],
      folders,
      []
    )
    expect(resources.map((resource) => resource.label)).toEqual([
      'Inbox / Plan',
      'Inbox / Project / Plan',
    ])
    expect(wikiToken(resources[1]!)).toBe('[[note:note-2|Inbox / Project / Plan]]')
  })

  it('uses API collection paths to disambiguate request titles', () => {
    const collections: ApiCollection[] = [
      { id: 'api-root', name: 'Inbox', createdAt: 1, updatedAt: 1 },
      {
        id: 'api-project',
        name: 'Project API',
        parentId: 'api-root',
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    const request: ApiRequest = {
      id: 'request-1',
      collectionId: 'api-project',
      name: 'Plan',
      method: 'GET',
      url: 'https://example.com/plan',
      headers: [],
      body: '',
      bodyMode: 'none',
      auth: { type: 'none' },
      createdAt: 1,
      updatedAt: 1,
    }

    const resources = buildWikiResources(
      [note('note-1', 'Plan')],
      [],
      [request],
      folders,
      collections
    )

    expect(resources.map((resource) => resource.label)).toEqual([
      'Inbox / Plan',
      'Inbox / Project API / Plan',
    ])
  })

  it('finds an unfinished same-line trigger at the caret', () => {
    expect(findWikiTrigger('Before\n[[pla', 12)).toEqual({ start: 7, end: 12, query: 'pla' })
    expect(findWikiTrigger('[[closed]]', 10)).toBeNull()
    expect(findWikiTrigger('[[note:', 7)).toBeNull()
  })

  it('derives backlinks by stable identity after source title changes', () => {
    const source = note('source', 'Renamed source', 'See [[note:target|Old target title]]')
    expect(
      backlinksForResource([source, note('target', 'New target title')], {
        kind: 'note',
        id: 'target',
      })
    ).toEqual([source])
  })
})
