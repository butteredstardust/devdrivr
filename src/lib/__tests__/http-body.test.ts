import { describe, expect, it, vi } from 'vitest'
import { readTextWithLimit } from '@/lib/http-body'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift()
      if (chunk === undefined) controller.close()
      else controller.enqueue(encoder.encode(chunk))
    },
  })
}

describe('readTextWithLimit', () => {
  it('returns the whole body when it is within the limit', async () => {
    const response = new Response(streamOf(['{"a":', '"é"}']))

    await expect(readTextWithLimit(response, 100, 'too large')).resolves.toBe('{"a":"é"}')
  })

  it('counts bytes, not characters', async () => {
    // Two characters, four bytes.
    const response = new Response('éé')

    await expect(readTextWithLimit(response, 3, 'too large')).rejects.toThrow('too large')
  })

  it('cancels the stream as soon as the limit is passed', async () => {
    const chunks = ['aaaa', 'bbbb', 'cccc']
    const cancel = vi.fn()
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const chunk = chunks.shift()
          if (chunk === undefined) controller.close()
          else controller.enqueue(encoder.encode(chunk))
        },
        cancel,
      },
      { highWaterMark: 0 }
    )

    await expect(readTextWithLimit(new Response(stream), 6, 'too large')).rejects.toThrow(
      'too large'
    )
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(chunks).toEqual(['cccc'])
  })

  it('rejects a declared length above the limit without reading', async () => {
    const response = new Response('small', { headers: { 'content-length': '999' } })
    const cancel = vi.spyOn(response.body!, 'cancel')

    await expect(readTextWithLimit(response, 100, 'too large')).rejects.toThrow('too large')
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
