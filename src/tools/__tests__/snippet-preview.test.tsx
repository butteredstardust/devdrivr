import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SnippetWebPreview } from '@/tools/snippets/SnippetWebPreview'
import {
  buildWebPreviewDocument,
  previewKindFor,
  SNIPPET_PREVIEW_CSP,
} from '@/tools/snippets/snippet-preview'
import type { SnippetFragment } from '@/types/models'

function fragment(
  id: string,
  language: string,
  content: string,
  sortOrder: number
): SnippetFragment {
  return { id, name: `${id}.${language}`, language, content, sortOrder, createdAt: 1, updatedAt: 1 }
}

describe('snippet contextual preview', () => {
  it('chooses JSON only for the active JSON fragment and web for an HTML composition', () => {
    const html = fragment('page', 'html', '<main>Hello</main>', 0)
    const css = fragment('styles', 'css', 'main { display: grid }', 1)
    const json = fragment('data', 'json', '{"ok":true}', 2)
    expect(previewKindFor(json, [html, css, json])).toBe('json')
    expect(previewKindFor(css, [html, css, json])).toBe('web')
    expect(previewKindFor(fragment('py', 'python', 'print(1)', 0), [])).toBeNull()
  })

  it('composes ordered CSS with inert HTML and a deny-by-default CSP', () => {
    const document = buildWebPreviewDocument(
      [
        fragment('late', 'css', 'main { color: CanvasText }', 2),
        fragment(
          'page',
          'html',
          '<main onclick="alert(1)"><a href="https://example.com">Open</a><img src="https://example.com/a.png"><script>window.__TAURI__</script></main>',
          0
        ),
        fragment('early', 'css', 'main { display: grid }</style><script>alert(2)</script>', 1),
      ],
      'page'
    )
    expect(document).toContain(SNIPPET_PREVIEW_CSP)
    expect(document.indexOf('display: grid')).toBeLessThan(document.indexOf('color: CanvasText'))
    expect(document).not.toContain('onclick=')
    expect(document).not.toContain('href=')
    expect(document).not.toContain('src=')
    expect(document).not.toContain('<script>')
    expect(document).not.toContain('window.__TAURI__')
    expect(document).toContain('\\3c /style>')
  })

  it('renders in an opaque sandbox with no referrer', () => {
    render(<SnippetWebPreview document="<!doctype html><p>Safe</p>" onClose={vi.fn()} />)
    const frame = screen.getByTitle('Rendered snippet preview')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.getByText(/remote requests are disabled/i)).toBeInTheDocument()
  })
})
