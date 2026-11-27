import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { importApiSpec } from '@/lib/api-import'
import { ImportSpecModal } from '@/tools/api-client/components/ImportSpecModal'
import type { ApiImportResult } from '@/types/models'

vi.mock('@/lib/api-import', () => ({
  importApiSpec: vi.fn(),
  MAX_API_IMPORT_BYTES: 20 * 1024 * 1024,
}))

describe('API import preview', () => {
  it('ignores a preview that finishes after the source changes', async () => {
    let finishPreview!: (result: ApiImportResult) => void
    vi.mocked(importApiSpec).mockReturnValueOnce(
      new Promise((resolve) => {
        finishPreview = resolve
      })
    )
    render(<ImportSpecModal onImport={vi.fn()} onClose={vi.fn()} />)

    const source = screen.getByPlaceholderText('Paste API specification content here...')
    fireEvent.change(source, { target: { value: 'original source' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('button', { name: 'Previewing…' })).toBeDisabled()

    fireEvent.change(source, { target: { value: 'new source' } })
    await act(async () => {
      finishPreview({
        format: 'graphql',
        sourceTitle: 'Stale preview',
        requests: [],
        collections: [],
        warnings: [],
      })
    })

    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled()
    expect(screen.queryByText('Detected:')).not.toBeInTheDocument()
  })
})
