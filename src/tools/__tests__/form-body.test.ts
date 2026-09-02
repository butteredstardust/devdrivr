import { describe, it, expect } from 'vitest'
import {
  blankFormRows,
  buildMultipartBody,
  contentTypeFor,
  createBoundary,
  FORMDATA_MODE,
  isBoilerplateContentType,
  isFormMode,
  parseFormBody,
  serializeFormBody,
  shellQuote,
  toCurl,
  URLENCODED_MODE,
} from '../api-client/form-body'

describe('isFormMode', () => {
  it('covers both form modes and nothing else', () => {
    expect(isFormMode(URLENCODED_MODE)).toBe(true)
    expect(isFormMode(FORMDATA_MODE)).toBe(true)
    expect(isFormMode('json')).toBe(false)
    expect(isFormMode('none')).toBe(false)
  })
})

describe('parseFormBody / serializeFormBody', () => {
  it('round-trips pairs', () => {
    const fields = parseFormBody('a=1&b=2')
    expect(fields).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true },
    ])
    expect(serializeFormBody(fields)).toBe('a=1&b=2')
  })

  it('decodes percent- and plus-escapes the way the wire format defines them', () => {
    expect(parseFormBody('q=hello+world&t=a%26b')).toEqual([
      { key: 'q', value: 'hello world', enabled: true },
      { key: 't', value: 'a&b', enabled: true },
    ])
  })

  it('keeps repeated keys as separate rows', () => {
    expect(parseFormBody('tag=a&tag=b')).toHaveLength(2)
  })

  it('parses an empty body to no rows — blank rows belong to the editor, not the payload', () => {
    expect(parseFormBody('')).toEqual([])
  })

  it('counts un-named rows so the editor can keep them', () => {
    expect(
      blankFormRows([
        { key: 'a', value: '1', enabled: true },
        { key: '', value: '', enabled: true },
        { key: '  ', value: 'x', enabled: true },
      ])
    ).toBe(2)
  })

  it('drops disabled and unnamed rows on the way out', () => {
    const serialized = serializeFormBody([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: false },
      { key: '  ', value: '3', enabled: true },
    ])
    expect(serialized).toBe('a=1')
  })
})

describe('contentTypeFor', () => {
  it('maps the modes that dictate one', () => {
    expect(contentTypeFor('json')).toBe('application/json')
    expect(contentTypeFor(URLENCODED_MODE)).toBe('application/x-www-form-urlencoded')
  })

  it('returns null for multipart, whose type carries a per-request boundary', () => {
    expect(contentTypeFor(FORMDATA_MODE)).toBeNull()
    expect(contentTypeFor('text')).toBeNull()
  })
})

describe('isBoilerplateContentType', () => {
  it('recognises the values the app itself sets', () => {
    expect(isBoilerplateContentType('application/json')).toBe(true)
    expect(isBoilerplateContentType('application/x-www-form-urlencoded')).toBe(true)
    expect(isBoilerplateContentType('application/json; charset=utf-8')).toBe(true)
  })

  it('leaves a deliberately chosen type alone', () => {
    expect(isBoilerplateContentType('application/vnd.api+json')).toBe(false)
  })
})

describe('createBoundary', () => {
  it('is unique per call', () => {
    expect(createBoundary()).not.toBe(createBoundary())
  })
})

describe('buildMultipartBody', () => {
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

  it('emits a part per field and a closing boundary', async () => {
    const { body, contentType } = await buildMultipartBody([
      { key: 'name', value: 'ada', enabled: true },
      { key: 'skip', value: 'no', enabled: false },
    ])
    const text = decode(body)
    const boundary = contentType.split('boundary=')[1] ?? ''
    expect(boundary).not.toBe('')
    expect(text).toContain('Content-Disposition: form-data; name="name"')
    expect(text).toContain('ada')
    expect(text).not.toContain('skip')
    expect(text.endsWith(`--${boundary}--\r\n`)).toBe(true)
  })

  it('includes filename and content type for file parts', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'notes.txt', { type: 'text/plain' })
    const { body } = await buildMultipartBody([
      { key: 'upload', value: 'notes.txt', enabled: true, file },
    ])
    const text = decode(body)
    expect(text).toContain('name="upload"; filename="notes.txt"')
    expect(text).toContain('Content-Type: text/plain')
  })

  it('escapes quotes in field names rather than breaking the header', async () => {
    const { body } = await buildMultipartBody([{ key: 'a"b', value: 'v', enabled: true }])
    expect(decode(body)).toContain('name="a%22b"')
  })
})

describe('shellQuote', () => {
  it('leaves shell metacharacters literal', () => {
    expect(shellQuote('a$b`c')).toBe(`'a$b\`c'`)
  })

  it('closes and reopens around an embedded single quote', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
  })
})

describe('toCurl', () => {
  it('renders method, url and headers', () => {
    const command = toCurl({
      method: 'GET',
      url: 'https://example.com/x?a=1',
      headers: [
        { key: 'Accept', value: 'application/json', enabled: true },
        { key: 'X-Off', value: 'no', enabled: false },
      ],
      body: '',
      bodyMode: 'none',
    })
    expect(command).toContain(`curl -X GET 'https://example.com/x?a=1'`)
    expect(command).toContain(`-H 'Accept: application/json'`)
    expect(command).not.toContain('X-Off')
  })

  it('adds the implied Content-Type for a JSON body', () => {
    const command = toCurl({
      method: 'POST',
      url: 'https://example.com',
      headers: [],
      body: '{"a":1}',
      bodyMode: 'json',
    })
    expect(command).toContain(`-H 'Content-Type: application/json'`)
    expect(command).toContain(`-d '{"a":1}'`)
  })

  it('does not duplicate a Content-Type the user already set', () => {
    const command = toCurl({
      method: 'POST',
      url: 'https://example.com',
      headers: [{ key: 'content-type', value: 'application/vnd.api+json', enabled: true }],
      body: '{}',
      bodyMode: 'json',
    })
    expect(command.match(/Content-Type/gi)).toHaveLength(1)
  })

  it('drops a leftover Content-Type for multipart so curl owns the boundary', () => {
    const command = toCurl({
      method: 'POST',
      url: 'https://example.com',
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      body: 'a=1',
      bodyMode: FORMDATA_MODE,
      formFields: [{ key: 'a', value: '1', enabled: true }],
    })
    expect(command).not.toContain('Content-Type')
  })

  it('uses -F for multipart and leaves the boundary to curl', () => {
    const file = new File([new Uint8Array([1])], 'a.bin')
    const command = toCurl({
      method: 'POST',
      url: 'https://example.com',
      headers: [],
      body: 'upload=a.bin&note=hi',
      bodyMode: FORMDATA_MODE,
      formFields: [
        { key: 'upload', value: 'a.bin', enabled: true, file },
        { key: 'note', value: 'hi', enabled: true },
      ],
    })
    expect(command).toContain(`-F 'upload=@a.bin'`)
    expect(command).toContain(`-F 'note=hi'`)
    expect(command).not.toContain('boundary')
  })
})
