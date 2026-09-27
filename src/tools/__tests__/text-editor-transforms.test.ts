import { describe, expect, it } from 'vitest'
import {
  CASE_TRANSFORMS,
  LINE_TRANSFORMS,
  selectedLineSpans,
  transformText,
} from '@/tools/text-editor/text-transforms'

const lineTransform = (id: string) => LINE_TRANSFORMS.find((item) => item.id === id)!
const caseTransform = (id: string) => CASE_TRANSFORMS.find((item) => item.id === `case-${id}`)!

describe('transformText', () => {
  it('sorts naturally and keeps the final line break last', () => {
    expect(transformText('b10\nB2\na\n', '\n', lineTransform('sort-ascending'))).toBe(
      'a\nB2\nb10\n'
    )
    expect(transformText('a\nc\nb', '\n', lineTransform('sort-descending'))).toBe('c\nb\na')
  })

  it('keeps the first of each duplicate line', () => {
    expect(transformText('x\ny\nx\ny\nz', '\n', lineTransform('remove-duplicates'))).toBe('x\ny\nz')
  })

  it('trims trailing whitespace and keeps CRLF line breaks', () => {
    expect(transformText('a \t\r\n b  \r\n', '\r\n', lineTransform('trim-trailing'))).toBe(
      'a\r\n b\r\n'
    )
  })

  it('changes case line by line', () => {
    expect(transformText('user name\nhttp request', '\n', caseTransform('camel'))).toBe(
      'userName\nhttpRequest'
    )
    expect(transformText('fooBar\r\n', '\r\n', caseTransform('snake'))).toBe('foo_bar\r\n')
  })
})

describe('selectedLineSpans', () => {
  const selection = (
    startLineNumber: number,
    startColumn: number,
    endLineNumber: number,
    endColumn: number
  ) => ({ startLineNumber, startColumn, endLineNumber, endColumn })

  it('uses the whole document when nothing is selected', () => {
    expect(selectedLineSpans([selection(3, 2, 3, 2)], 9)).toEqual([{ start: 1, end: 9 }])
  })

  it('leaves out a last line selected only up to column 1', () => {
    expect(selectedLineSpans([selection(2, 4, 5, 1)], 9)).toEqual([{ start: 2, end: 4 }])
  })

  it('merges overlapping selections and keeps separate ones apart', () => {
    expect(
      selectedLineSpans([selection(6, 1, 7, 3), selection(1, 1, 2, 5), selection(2, 1, 3, 2)], 9)
    ).toEqual([
      { start: 1, end: 3 },
      { start: 6, end: 7 },
    ])
  })
})
