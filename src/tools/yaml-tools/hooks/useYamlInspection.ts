import { useEffect, useMemo, useState } from 'react'
import { queryJsonPath } from '@/lib/json-path'
import { parseYamlStream, yamlStats, type YamlParse } from '@/tools/yaml-tools/yaml-helpers'

export function useYamlInspection(input: string, query: string) {
  // Parsing (and the stats walk over the result) runs off a debounced copy of
  // the buffer: on a large manifest doing it per keystroke costs a frame, and a
  // live region that re-announces the whole verdict on every character is
  // unusable with a screen reader.
  const [parseSource, setParseSource] = useState(input)
  useEffect(() => {
    const timer = setTimeout(() => setParseSource(input), 250)
    return () => clearTimeout(timer)
  }, [input])

  const parsed = useMemo<YamlParse>(() => parseYamlStream(parseSource), [parseSource])
  const isValid = parsed.status === 'valid'
  const documents = parsed.status === 'valid' ? parsed.documents : []
  const queryData = documents.length === 1 ? documents[0] : documents
  const queryResult = useMemo(
    () => (parsed.status === 'valid' && query.trim() ? queryJsonPath(queryData, query) : null),
    [parsed.status, queryData, query]
  )

  const stats = useMemo(
    () => (parsed.status === 'valid' ? yamlStats(parsed.documents) : null),
    [parsed]
  )

  const status =
    parsed.status === 'empty'
      ? 'Nothing to inspect yet'
      : parsed.status === 'invalid'
        ? parsed.location
          ? `Invalid YAML — ${parsed.message} — line ${parsed.location.line}, column ${parsed.location.column}`
          : `Invalid YAML — ${parsed.message}`
        : stats
          ? `Valid YAML · ${documents.length > 1 ? `${documents.length} documents · ` : ''}${stats.keys} key${stats.keys === 1 ? '' : 's'} · depth ${stats.depth} · ${stats.size}`
          : 'Valid YAML'

  return { parsed, isValid, documents, queryResult, stats, status }
}
