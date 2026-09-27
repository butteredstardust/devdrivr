import { describe, expect, it } from 'vitest'
import { detectLogEncoding, LogStream, parseLogRange, stripAnsi } from '@/lib/log-tail'
import { logReadResponse, utf8 } from './log-range-fixture'

/** Reads as `useLogTail` does. `maxBytes` replaces the size that `nextRead` asks for. */
function read(stream: LogStream, file: Uint8Array, maxBytes?: number, identity = 1n) {
  const next = stream.nextRead(false)
  const response = logReadResponse(file, next.start, maxBytes ?? next.maxBytes, identity)
  return stream.accept(parseLogRange(response))
}

describe('parseLogRange', () => {
  it('reads the header from a number array and from an ArrayBuffer', () => {
    const response = logReadResponse(utf8('one\ntwo\n'), 4, 100, 9n)
    const fromArray = parseLogRange(response)
    const fromBuffer = parseLogRange(Uint8Array.from(response).buffer)

    for (const range of [fromArray, fromBuffer]) {
      expect(range.size).toBe(8)
      expect(range.begin).toBe(4)
      expect(range.identity).toBe(9n)
      expect(Array.from(range.head)).toEqual(Array.from(utf8('one\n')))
      expect(new TextDecoder().decode(range.bytes)).toBe('two\n')
    }
  })

  it('rejects a response shorter than the header', () => {
    expect(() => parseLogRange([1, 2, 3])).toThrow('incomplete')
  })
})

describe('detectLogEncoding', () => {
  it('detects a byte order mark before the content', () => {
    expect(detectLogEncoding(new Uint8Array([0xef, 0xbb, 0xbf]), new Uint8Array())).toEqual({
      encoding: 'utf-8',
      bomLength: 3,
    })
    expect(detectLogEncoding(new Uint8Array([0xff, 0xfe]), new Uint8Array()).encoding).toBe(
      'utf-16le'
    )
    expect(detectLogEncoding(new Uint8Array([0xfe, 0xff]), new Uint8Array()).encoding).toBe(
      'utf-16be'
    )
  })

  it('accepts UTF-8 that starts and ends inside a character', () => {
    const bytes = utf8('é log ü é')
    const sample = bytes.subarray(1, bytes.length - 1)
    expect(detectLogEncoding(new Uint8Array(), sample).encoding).toBe('utf-8')
  })

  it('falls back to Windows-1252 for bytes that are not UTF-8', () => {
    expect(
      detectLogEncoding(new Uint8Array(), new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a]))
    ).toMatchObject({ encoding: 'windows-1252', bomLength: 0 })
  })

  it('does not take an incomplete character at the end as proof of UTF-8', () => {
    const sample = new Uint8Array([0x63, 0x61, 0x66, 0xe9])
    expect(detectLogEncoding(new Uint8Array(), sample).encoding).toBe('windows-1252')
  })
})

describe('LogStream', () => {
  it('opens a small file whole and appends only the new bytes', () => {
    const stream = new LogStream()
    expect(read(stream, utf8('one\n'))).toEqual({ kind: 'replace', text: 'one\n', reason: 'open' })
    expect(stream.startsMidFile).toBe(false)

    expect(read(stream, utf8('one\ntwo\n'))).toEqual({ kind: 'append', text: 'two\n' })
    expect(read(stream, utf8('one\ntwo\n'))).toEqual({ kind: 'append', text: '' })
    expect(stream.offset).toBe(8)
  })

  it('starts a tail at the next whole line', () => {
    const stream = new LogStream()
    const update = read(stream, utf8('first line\nsecond\nthird\n'), 10)
    expect(update).toEqual({ kind: 'replace', text: 'third\n', reason: 'open' })
    expect(stream.startsMidFile).toBe(true)
  })

  it('keeps a tail that is part of one long line', () => {
    const stream = new LogStream()
    expect(read(stream, utf8('abcdefghij'), 4)).toMatchObject({ text: 'ghij' })
  })

  it('joins a character that two appends split', () => {
    const stream = new LogStream()
    const file = utf8('a\n€\n')
    read(stream, file.subarray(0, 3))
    expect(read(stream, file.subarray(0, 4))).toEqual({ kind: 'append', text: '' })
    expect(read(stream, file)).toEqual({ kind: 'append', text: '€\n' })
  })

  it('reports a rotation when the file gets shorter', () => {
    const stream = new LogStream()
    read(stream, utf8('old line one\nold line two\n'))
    expect(read(stream, utf8('new\n'))).toBeNull()
    expect(read(stream, utf8('new\n'))).toEqual({
      kind: 'replace',
      text: 'new\n',
      reason: 'rotated',
    })
  })

  it('reports a rotation when the path names a new file of the same size', () => {
    const stream = new LogStream()
    read(stream, utf8('aaaa\n'), 1024, 1n)
    // The first read starts at the old offset, so it asks for the tail of the new file.
    expect(read(stream, utf8('bbbb\n'), 1024, 2n)).toBeNull()
    expect(stream.offset).toBeNull()
    expect(read(stream, utf8('bbbb\n'), 1024, 2n)).toMatchObject({
      kind: 'replace',
      reason: 'rotated',
      text: 'bbbb\n',
    })
  })

  it('reports a rotation when the file was truncated and grew past the old size', () => {
    const stream = new LogStream()
    read(stream, utf8('aaaa\nbbbb\n'))
    const file = utf8('cccc\ndddd\neeee\n')
    expect(read(stream, file)).toBeNull()
    expect(read(stream, file)).toEqual({
      kind: 'replace',
      text: 'cccc\ndddd\neeee\n',
      reason: 'rotated',
    })
  })

  it('keeps a whole line that starts exactly at the tail', () => {
    const stream = new LogStream()
    // 7 bytes of tail and 2 bytes before it, as `nextRead` asks for.
    expect(read(stream, utf8('first\nsecond\n'), 7 + 2)).toMatchObject({ text: 'second\n' })
  })

  it('does not start a one-line UTF-8 tail with a broken character', () => {
    const stream = new LogStream()
    const update = read(stream, utf8('aéaéaé'), 4)
    expect(update).toMatchObject({ text: 'aé' })
    expect(stream.encoding).toBe('utf-8')
  })

  it('decides the encoding of an ASCII log at the first byte above 0x7f', () => {
    const latin = new LogStream()
    read(latin, utf8('ascii\n'))
    const file = new Uint8Array([...utf8('ascii\n'), 0x63, 0x61, 0x66, 0xe9, 0x0a])
    expect(read(latin, file)).toEqual({ kind: 'append', text: 'café\n' })
    expect(latin.encoding).toBe('windows-1252')

    const unicode = new LogStream()
    read(unicode, utf8('ascii\n'))
    expect(read(unicode, utf8('ascii\ncafé\n'))).toEqual({ kind: 'append', text: 'café\n' })
    expect(unicode.encoding).toBe('utf-8')

    const copyright = new LogStream()
    read(copyright, utf8('a\n'))
    const withSign = new Uint8Array([...utf8('a\n'), 0xa9, 0x20, 0x31, 0x0a])
    expect(read(copyright, withSign)).toEqual({ kind: 'append', text: '© 1\n' })
  })

  it('holds back an incomplete last character until the next bytes decide the encoding', () => {
    const stream = new LogStream()
    const file = [0x63, 0x61, 0x66, 0xe9]
    expect(read(stream, new Uint8Array(file))).toMatchObject({ text: 'caf' })
    expect(read(stream, new Uint8Array([...file, 0x0a]))).toEqual({ kind: 'append', text: 'é\n' })
    expect(stream.encoding).toBe('windows-1252')
  })

  it('replaces the text when an append is larger than one read', () => {
    const stream = new LogStream()
    read(stream, utf8('a\n'))
    const update = read(stream, utf8('a\nlost line\nkept\n'), 7)
    expect(update).toEqual({ kind: 'replace', text: 'kept\n', reason: 'skipped' })
  })

  it('decodes UTF-16 after the byte order mark, also from an odd tail offset', () => {
    const text = 'one\ntwo\n'
    const file = new Uint8Array(2 + text.length * 2)
    file.set([0xff, 0xfe])
    for (let index = 0; index < text.length; index++) file[2 + index * 2] = text.charCodeAt(index)

    const whole = new LogStream()
    expect(read(whole, file)).toMatchObject({ text: 'one\ntwo\n' })
    expect(whole.encoding).toBe('utf-16le')

    // 11 bytes start in the second half of a code unit.
    const tail = new LogStream()
    expect(read(tail, file, 11)).toMatchObject({ text: 'two\n' })
  })

  it('changes CRLF to LF, also when two reads split the pair', () => {
    const stream = new LogStream()
    const file = utf8('one\r\ntwo\r\n')
    expect(read(stream, file.subarray(0, 4))).toMatchObject({ text: 'one\n' })
    expect(read(stream, file)).toEqual({ kind: 'append', text: 'two\n' })
  })

  it('removes ANSI escapes, also when two reads split one', () => {
    const stream = new LogStream()
    const file = utf8('\x1b[31mred\x1b[0m\n\x1b[1;32mgreen\x1b[0m\n')
    expect(read(stream, file.subarray(0, 14))).toMatchObject({ text: 'red\n' })
    expect(read(stream, file.subarray(0, 18))).toEqual({ kind: 'append', text: '' })
    expect(read(stream, file)).toEqual({ kind: 'append', text: 'green\n' })
  })

  it('probes for new bytes and a new file without reading them', () => {
    const stream = new LogStream()
    read(stream, utf8('abc'), 1024, 1n)
    const probe = (file: Uint8Array, identity: bigint) => {
      const { start, maxBytes } = stream.nextRead(true)
      return stream.hasChanged(parseLogRange(logReadResponse(file, start, maxBytes, identity)))
    }

    expect(probe(utf8('abc'), 1n)).toBe(false)
    expect(probe(utf8('abcd'), 1n)).toBe(true)
    expect(probe(utf8('xyz'), 2n)).toBe(true)
    expect(probe(utf8('xyz'), 1n)).toBe(true)
    expect(stream.offset).toBe(3)
  })
})

describe('stripAnsi', () => {
  it('removes colour, cursor and title sequences and keeps the text', () => {
    expect(stripAnsi('\x1b[2K\x1b[1Gdone \x1b]0;title\x07ok \x1b(B')).toBe('done ok ')
  })
})
