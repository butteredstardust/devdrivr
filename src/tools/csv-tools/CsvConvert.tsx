import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { useMonaco } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { Select } from '@/components/shared/Select'
import { Toolbar, ToolbarSpacer } from '@/components/shared/Toolbar'
import { FORMAT_LANGUAGES, OUTPUT_FORMATS, type OutputFormat } from './csv-helpers'

type CsvConvertProps = {
  /** Converted text, computed once by the tool — this pane no longer re-parses. */
  output: string
  format: OutputFormat
  onFormatChange: (format: OutputFormat) => void
}

export default function CsvConvert({ output, format, onFormatChange }: CsvConvertProps) {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar aria-label="CSV conversion">
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
        <ToolbarSpacer />
        <CopyButton text={output} label="Copy converted" />
      </Toolbar>

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
