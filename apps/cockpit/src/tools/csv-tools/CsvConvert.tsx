import { useState, useMemo, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { parseCsv, toColumnarFormat } from './utils'
import type { Delimiter } from './utils'

interface CsvConvertProps {
  csvText: string
  delimiter: Delimiter
  hasHeader: boolean
  outputFormat?: 'array-of-objects' | 'object-of-arrays'
  onOutputFormatChange?: (format: 'array-of-objects' | 'object-of-arrays') => void
}

export default function CsvConvert({
  csvText,
  delimiter,
  hasHeader,
  outputFormat = 'array-of-objects',
  onOutputFormatChange,
}: CsvConvertProps) {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()

  const [internalFormat, setInternalFormat] =
    useState<'array-of-objects' | 'object-of-arrays'>(outputFormat)

  const convertedJson = useMemo(() => {
    if (!csvText.trim()) return ''

    const result = parseCsv(csvText, delimiter, hasHeader)
    if (result.errors.length > 0) return ''

    const data = result.data as Record<string, unknown>[]

    if (internalFormat === 'object-of-arrays') {
      const columnar = toColumnarFormat(data)
      const metadata = {
        __csv_meta__: {
          columnOrder: Object.keys(data[0] ?? {}),
          types: Object.fromEntries(Object.keys(data[0] ?? {}).map((key) => [key, 'string'])),
        },
      }
      return JSON.stringify({ ...metadata, ...columnar }, null, 2)
    }

    return JSON.stringify(data, null, 2)
  }, [csvText, delimiter, hasHeader, internalFormat])

  const handleFormatChange = useCallback(
    (format: 'array-of-objects' | 'object-of-arrays') => {
      setInternalFormat(format)
      onOutputFormatChange?.(format)
    },
    [onOutputFormatChange]
  )

  return (
    <div className="flex h-full flex-col">
      {/* Format selector */}
      <div className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-2">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="format"
            checked={internalFormat === 'array-of-objects'}
            onChange={() => handleFormatChange('array-of-objects')}
          />
          <span className="text-xs">Array of objects</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="format"
            checked={internalFormat === 'object-of-arrays'}
            onChange={() => handleFormatChange('object-of-arrays')}
          />
          <span className="text-xs">Object of arrays</span>
        </label>

        {convertedJson && <CopyButton text={convertedJson} />}
      </div>

      {/* Output */}
      <div className="flex-1">
        <Editor
          theme={monacoTheme}
          language="json"
          value={convertedJson}
          options={{ ...monacoOptions, readOnly: true }}
        />
      </div>
    </div>
  )
}
