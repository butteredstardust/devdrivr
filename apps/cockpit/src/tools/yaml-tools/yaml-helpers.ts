import * as yaml from 'js-yaml'
import { documentStats, sortKeysDeepBounded } from '@/lib/traversal'

/** Where js-yaml says the problem is, 1-based so it can go straight to Monaco. */
export type YamlErrorLocation = { line: number; column: number }

export type YamlParse =
  | { status: 'empty' }
  | { status: 'valid'; documents: unknown[] }
  | { status: 'invalid'; message: string; location: YamlErrorLocation | null }

type YamlMark = { line?: number; column?: number }

/**
 * Parses the whole stream, not just the first document.
 *
 * `yaml.load` rejects anything with a `---` separator ("expected a single
 * document in the stream"), which is most Kubernetes manifests — exactly the
 * files somebody opens a YAML tool for.
 */
export function parseYamlStream(input: string): YamlParse {
  if (!input.trim()) return { status: 'empty' }
  try {
    return { status: 'valid', documents: yaml.loadAll(input) }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const reason = e instanceof yaml.YAMLException ? e.reason : null
    const mark = (e as { mark?: YamlMark }).mark
    return {
      status: 'invalid',
      // The full message repeats the offending snippet over several lines; the
      // reason alone fits a status line.
      message: reason ?? message,
      location:
        mark?.line !== undefined ? { line: mark.line + 1, column: (mark.column ?? 0) + 1 } : null,
    }
  }
}

export function stringifyYaml(data: unknown, options?: yaml.DumpOptions): string {
  return yaml.dump(data, { indent: 2, lineWidth: 120, noRefs: true, ...options })
}

/** One YAML stream from many documents, so a multi-doc file survives a round trip. */
export function stringifyYamlStream(documents: unknown[], options?: yaml.DumpOptions): string {
  // Without this an empty list dumps `undefined` as '', silently blanking the
  // buffer instead of failing.
  if (documents.length === 0) return ''
  if (documents.length === 1) return stringifyYaml(documents[0], options)
  return documents.map((document) => stringifyYaml(document, options)).join('---\n')
}

/**
 * True if the source carries anything js-yaml cannot round-trip.
 *
 * Every reshaping action goes through parse → dump, which silently drops
 * comments and expands anchors. Losing a `# why this value` to a Sort keys
 * click is the kind of thing you only notice in review.
 */
export function hasUnpreservableSyntax(input: string): boolean {
  return input
    .split('\n')
    .some((line) => /(^|\s)#/.test(line) || /(^|\s)[&*][A-Za-z0-9_-]+/.test(line))
}

/** The stream as JSON: a single document stays an object, many become an array. */
export function documentsToJson(documents: unknown[], indent = 2): string {
  return JSON.stringify(documents.length === 1 ? documents[0] : documents, null, indent)
}

export function jsonToYaml(jsonInput: string): string {
  if (!jsonInput.trim()) {
    throw new Error('JSON input is empty')
  }
  try {
    const data: unknown = JSON.parse(jsonInput)
    return stringifyYaml(data)
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${e.message}`, { cause: e })
    }
    throw e instanceof Error ? e : new Error(String(e))
  }
}

export function sortKeysDeep(data: unknown): unknown {
  return sortKeysDeepBounded(data)
}

export function yamlStats(documents: unknown[]): { keys: number; depth: number; size: string } {
  return documentStats(documents)
}
