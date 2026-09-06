import type { ApiCollection, ApiRequest, Note, ResourceFolder, Snippet } from '@/types/models'
import { folderPath } from '@/lib/resource-folders'

export type WikiResourceKind = 'note' | 'snippet' | 'api-request'

export type WikiResourceRef = {
  kind: WikiResourceKind
  id: string
}

export type WikiLink = WikiResourceRef & {
  label: string
  start: number
  end: number
}

export type WikiResource = WikiResourceRef & {
  title: string
  label: string
  location: string
}

export type WikiTrigger = {
  start: number
  end: number
  query: string
}

const WIKI_LINK_PATTERN = /\[\[(note|snippet|api-request):([^|\]\r\n]+)\|([^\]\r\n]+)\]\]/g
const INTERNAL_LINK_PREFIX = '#devdrivr-resource:'

function resourceKey(resource: WikiResourceRef): string {
  return `${resource.kind}:${resource.id}`
}

function safeLabel(label: string): string {
  return (
    label
      .replace(/[\]|\r\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled'
  )
}

function markdownLabel(label: string): string {
  return label.replace(/([\\\[\]])/g, '\\$1')
}

export function parseWikiLinks(content: string): WikiLink[] {
  const links: WikiLink[] = []
  for (const match of content.matchAll(WIKI_LINK_PATTERN)) {
    const full = match[0]
    const kind = match[1] as WikiResourceKind | undefined
    const id = match[2]
    const label = match[3]
    if (!full || !kind || !id || !label || match.index === undefined) continue
    links.push({ kind, id, label, start: match.index, end: match.index + full.length })
  }
  return links
}

export function wikiToken(resource: WikiResource): string {
  return `[[${resource.kind}:${resource.id}|${safeLabel(resource.label)}]]`
}

export function internalResourceHref(resource: WikiResourceRef): string {
  return `${INTERNAL_LINK_PREFIX}${resource.kind}:${encodeURIComponent(resource.id)}`
}

export function parseInternalResourceHref(href: string): WikiResourceRef | null {
  if (!href.startsWith(INTERNAL_LINK_PREFIX)) return null
  const value = href.slice(INTERNAL_LINK_PREFIX.length)
  const separator = value.indexOf(':')
  if (separator < 1) return null
  const kind = value.slice(0, separator)
  if (kind !== 'note' && kind !== 'snippet' && kind !== 'api-request') return null
  try {
    const id = decodeURIComponent(value.slice(separator + 1))
    return id ? { kind, id } : null
  } catch {
    return null
  }
}

export function renderWikiLinks(content: string, resources: WikiResource[]): string {
  const available = new Map(resources.map((resource) => [resourceKey(resource), resource]))
  const links = parseWikiLinks(content)
  let rendered = content
  for (const link of links.reverse()) {
    const resource = available.get(resourceKey(link))
    const label = markdownLabel(resource?.label ?? link.label)
    const replacement = resource
      ? `[${label}](${internalResourceHref(resource)})`
      : `${label} *(unavailable)*`
    rendered = `${rendered.slice(0, link.start)}${replacement}${rendered.slice(link.end)}`
  }
  return rendered
}

export function findWikiTrigger(content: string, cursor: number): WikiTrigger | null {
  const beforeCursor = content.slice(0, Math.max(0, cursor))
  const lineStart = beforeCursor.lastIndexOf('\n') + 1
  const open = beforeCursor.lastIndexOf('[[')
  if (open < lineStart) return null
  const query = beforeCursor.slice(open + 2)
  if (query.includes(']]') || query.includes('|') || query.includes(':')) return null
  return { start: open, end: cursor, query }
}

function typeLabel(kind: WikiResourceKind): string {
  if (kind === 'api-request') return 'API request'
  return kind === 'note' ? 'Note' : 'Snippet'
}

function assignShortestLabels(resources: Array<Omit<WikiResource, 'label'>>): WikiResource[] {
  const titleCounts = new Map<string, number>()
  for (const resource of resources) {
    const key = resource.title.trim().toLocaleLowerCase()
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1)
  }
  return resources.map((resource) => {
    const title = safeLabel(resource.title)
    if ((titleCounts.get(resource.title.trim().toLocaleLowerCase()) ?? 0) === 1) {
      return { ...resource, label: title }
    }
    const pathLabel = resource.location ? `${resource.location} / ${title}` : title
    const pathMatches = resources.filter(
      (candidate) =>
        candidate.title.trim().toLocaleLowerCase() === resource.title.trim().toLocaleLowerCase() &&
        (candidate.location
          ? `${candidate.location} / ${safeLabel(candidate.title)}`
          : safeLabel(candidate.title)) === pathLabel
    )
    const label =
      pathMatches.length === 1
        ? pathLabel
        : `${typeLabel(resource.kind)} / ${pathLabel} / ${resource.id.slice(0, 8)}`
    return { ...resource, label }
  })
}

export function buildWikiResources(
  notes: Note[],
  snippets: Snippet[],
  requests: ApiRequest[],
  folders: ResourceFolder[],
  collections: ApiCollection[]
): WikiResource[] {
  const pathFor = (folderId: string | null | undefined) =>
    folderId ? folderPath(folders, folderId).join(' / ') : ''
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]))
  const collectionPath = (collectionId: string | null) => {
    if (!collectionId) return ''
    const names: string[] = []
    const visited = new Set<string>()
    let current = collectionById.get(collectionId)
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      names.unshift(current.name)
      current = current.parentId ? collectionById.get(current.parentId) : undefined
    }
    return names.join(' / ')
  }
  return assignShortestLabels([
    ...notes.map((note) => ({
      kind: 'note' as const,
      id: note.id,
      title: note.title || 'Untitled note',
      location: pathFor(note.folderId),
    })),
    ...snippets.map((snippet) => ({
      kind: 'snippet' as const,
      id: snippet.id,
      title: snippet.title || 'Untitled snippet',
      location: pathFor(snippet.folderId),
    })),
    ...requests.map((request) => ({
      kind: 'api-request' as const,
      id: request.id,
      title: request.name || 'Untitled request',
      location: collectionPath(request.collectionId),
    })),
  ])
}

export function backlinksForResource(notes: Note[], target: WikiResourceRef): Note[] {
  const key = resourceKey(target)
  return notes.filter(
    (note) =>
      resourceKey({ kind: 'note', id: note.id }) !== key &&
      parseWikiLinks(note.content).some((link) => resourceKey(link) === key)
  )
}
