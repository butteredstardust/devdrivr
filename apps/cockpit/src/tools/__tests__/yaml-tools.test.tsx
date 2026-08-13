import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import YamlTools from '@/tools/yaml-tools/YamlTools'
import { jsonToYaml, parseYaml, yamlToJson } from '@/tools/yaml-tools/yaml-helpers'
import { renderTool } from '@/tools/__tests__/test-utils'

describe('yaml-tools helpers', () => {
  it('renders the registered tool shell', () => {
    renderTool(YamlTools)

    expect(screen.getByText('Lint & Format')).toBeInTheDocument()
    expect(screen.getByText('Tree View')).toBeInTheDocument()
    expect(screen.getByText('JSON ↔ YAML')).toBeInTheDocument()
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('populates the editor from Load Sample and hides the button once content exists', () => {
    renderTool(YamlTools)
    const editor = screen.getByTestId('monaco-editor')
    expect(screen.getByText('Load Sample')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Load Sample'))

    expect((editor as HTMLTextAreaElement).value).toContain('service: cockpit')
    expect(screen.queryByText('Load Sample')).not.toBeInTheDocument()
  })

  it('accepts YAML null documents as valid input', () => {
    expect(parseYaml('null')).toEqual({ ok: true, data: null, error: null })
  })

  it('converts YAML null to JSON null', () => {
    expect(yamlToJson('null')).toBe('null')
  })

  it('converts JSON null to YAML null', () => {
    expect(jsonToYaml('null')).toBe('null\n')
  })
})
