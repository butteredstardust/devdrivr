/**
 * Case conversions shared by the Case Converter and the Text Editor.
 *
 * Each conversion works on one line. The caller splits the text into lines, so a line break never
 * becomes a word separator.
 */

export function toWords(str: string): string[] {
  return str
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/[-_./]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export type CaseConversion = {
  id: string
  label: string
  convert: (line: string) => string
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
const lowerWords = (line: string) => toWords(line).map((word) => word.toLowerCase())

export const CASE_CONVERSIONS: CaseConversion[] = [
  { id: 'upper', label: 'UPPERCASE', convert: (line) => line.toUpperCase() },
  { id: 'lower', label: 'lowercase', convert: (line) => line.toLowerCase() },
  {
    id: 'title',
    label: 'Title Case',
    convert: (line) => lowerWords(line).map(capitalize).join(' '),
  },
  {
    id: 'sentence',
    label: 'Sentence case',
    convert: (line) =>
      lowerWords(line)
        .map((word, index) => (index === 0 ? capitalize(word) : word))
        .join(' '),
  },
  {
    id: 'camel',
    label: 'camelCase',
    convert: (line) =>
      lowerWords(line)
        .map((word, index) => (index === 0 ? word : capitalize(word)))
        .join(''),
  },
  {
    id: 'pascal',
    label: 'PascalCase',
    convert: (line) => lowerWords(line).map(capitalize).join(''),
  },
  { id: 'snake', label: 'snake_case', convert: (line) => lowerWords(line).join('_') },
  {
    id: 'screaming',
    label: 'SCREAMING_SNAKE',
    convert: (line) => lowerWords(line).join('_').toUpperCase(),
  },
  { id: 'kebab', label: 'kebab-case', convert: (line) => lowerWords(line).join('-') },
  { id: 'dot', label: 'dot.case', convert: (line) => lowerWords(line).join('.') },
  { id: 'path', label: 'path/case', convert: (line) => lowerWords(line).join('/') },
]
