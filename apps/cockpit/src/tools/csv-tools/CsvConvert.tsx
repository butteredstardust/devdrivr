import Editor from '@monaco-editor/react'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { Select } from '@/components/shared/Select'
import { FORMAT_LANGUAGES, OUTPUT_FORMATS, type OutputFormat } from './csv-helpers'

type CsvConvertProps = {
  /** Converted text, computed once by the tool — this pane no longer re-parses. */
  output: string
  format: OutputFormat
  onFormatChange: (format: OutputFormat) => void
}

export default function CsvConvert({ output, format, onFormatChange }: CsvConvertProps) {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <Select
          aria-label="Output format"
          value={format}
          onChange={(e) => onFormatChange(e.target.value as OutputFormat)}
          className="w-52"
        >
          {OUTPUT_FORMATS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <CopyButton text={output} label="Copy converted" className="ml-auto" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Editor
          theme={monacoTheme}
          language={FORMAT_LANGUAGES[format]}
          value={output}
          options={{ ...monacoOptions, readOnly: true }}
        />
      </div>
    </div>
  )
}
