import type { SnippetFragment } from '@/types/models'

export type SnippetPreviewKind = 'web' | 'json'

export const SNIPPET_PREVIEW_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ')

const NETWORK_ATTRIBUTES = new Set([
  'action',
  'background',
  'cite',
  'data',
  'formaction',
  'href',
  'ping',
  'poster',
  'src',
  'srcset',
])

export function previewKindFor(
  activeFragment: SnippetFragment | null,
  fragments: SnippetFragment[]
): SnippetPreviewKind | null {
  if (!activeFragment) return null
  if (activeFragment.language === 'json') return 'json'
  if (
    activeFragment.language === 'html' ||
    activeFragment.language === 'css' ||
    fragments.some((fragment) => fragment.language === 'html')
  ) {
    return 'web'
  }
  return null
}

function inertHtml(source: string): string {
  const document = new DOMParser().parseFromString(source, 'text/html')
  document
    .querySelectorAll('script, iframe, object, embed, link, meta, base')
    .forEach((element) => {
      element.remove()
    })
  document.body.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || NETWORK_ATTRIBUTES.has(name)) {
        element.removeAttribute(attribute.name)
      }
    }
  })
  return document.body.innerHTML
}

function safeStyleText(source: string): string {
  // A CSS fragment sits inside a raw-text <style> element. Escaping every less-than sign with
  // CSS syntax prevents a literal closing tag from ending that element and re-entering HTML.
  return source.replaceAll('<', '\\3c ')
}

export function buildWebPreviewDocument(
  fragments: SnippetFragment[],
  activeFragmentId: string
): string {
  const ordered = [...fragments].sort((left, right) => left.sortOrder - right.sortOrder)
  const active = ordered.find((fragment) => fragment.id === activeFragmentId)
  const html =
    (active?.language === 'html'
      ? active
      : ordered.find((fragment) => fragment.language === 'html')
    )?.content ?? ''
  const css = ordered
    .filter((fragment) => fragment.language === 'css')
    .map((fragment) => fragment.content)
    .join('\n\n')

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="color-scheme" content="light dark">',
    `<meta http-equiv="Content-Security-Policy" content="${SNIPPET_PREVIEW_CSP}">`,
    `<style>${safeStyleText(css)}</style>`,
    '</head>',
    `<body>${inertHtml(html)}</body>`,
    '</html>',
  ].join('')
}
