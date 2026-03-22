import { lazy } from 'react'
import type { ToolDefinition } from '@/types/tools'

const UuidGenerator = lazy(() => import('@/tools/uuid-generator/UuidGenerator'))
const JsonTools = lazy(() => import('@/tools/json-tools/JsonTools'))
const CodeFormatter = lazy(() => import('@/tools/code-formatter/CodeFormatter'))
const XmlTools = lazy(() => import('@/tools/xml-tools/XmlTools'))
const DiffViewer = lazy(() => import('@/tools/diff-viewer/DiffViewer'))
const MarkdownEditor = lazy(() => import('@/tools/markdown-editor/MarkdownEditor'))
const MermaidEditor = lazy(() => import('@/tools/mermaid-editor/MermaidEditor'))
const TsPlayground = lazy(() => import('@/tools/ts-playground/TsPlayground'))
const RefactoringToolkit = lazy(() => import('@/tools/refactoring-toolkit/RefactoringToolkit'))
const CaseConverter = lazy(() => import('@/tools/case-converter/CaseConverter'))
const ColorConverter = lazy(() => import('@/tools/color-converter/ColorConverter'))
const TimestampConverter = lazy(() => import('@/tools/timestamp-converter/TimestampConverter'))
const Base64Tool = lazy(() => import('@/tools/base64/Base64Tool'))
const UrlCodec = lazy(() => import('@/tools/url-codec/UrlCodec'))
const CurlToFetch = lazy(() => import('@/tools/curl-to-fetch/CurlToFetch'))
const HashGenerator = lazy(() => import('@/tools/hash-generator/HashGenerator'))
const RegexTester = lazy(() => import('@/tools/regex-tester/RegexTester'))
const JwtDecoder = lazy(() => import('@/tools/jwt-decoder/JwtDecoder'))
const JsonSchemaValidator = lazy(() => import('@/tools/json-schema-validator/JsonSchemaValidator'))
const CssValidator = lazy(() => import('@/tools/css-validator/CssValidator'))
const HtmlValidator = lazy(() => import('@/tools/html-validator/HtmlValidator'))
const CssSpecificity = lazy(() => import('@/tools/css-specificity/CssSpecificity'))
const CssToTailwind = lazy(() => import('@/tools/css-to-tailwind/CssToTailwind'))
const ApiClient = lazy(() => import('@/tools/api-client/ApiClient'))
const DocsBrowser = lazy(() => import('@/tools/docs-browser/DocsBrowser'))
const SnippetsManager = lazy(() => import('@/tools/snippets/SnippetsManager'))

export const TOOLS: ToolDefinition[] = [
  // --- Code ---
  { id: 'code-formatter', name: 'Code Formatter', group: 'code', icon: '⌨', description: 'Format and beautify code (JS, TS, CSS, HTML, SQL, Python)', component: CodeFormatter },
  { id: 'ts-playground', name: 'TypeScript Playground', group: 'code', icon: 'TS', description: 'Transpile TypeScript to JavaScript', component: TsPlayground },
  { id: 'diff-viewer', name: 'Diff Viewer', group: 'code', icon: '±', description: 'Compare text with syntax highlighting, auto-diff, stats, and patch export', component: DiffViewer },
  { id: 'refactoring-toolkit', name: 'Refactoring Toolkit', group: 'code', icon: '♻', description: 'Regex code transforms with diff preview (12 transforms, JS/TS)', component: RefactoringToolkit },
  // --- Data ---
  { id: 'json-tools', name: 'JSON Tools', group: 'data', icon: '{}', description: 'Validate, format, minify, sort keys, path query, and tree view for JSON', component: JsonTools },
  { id: 'xml-tools', name: 'XML Tools', group: 'data', icon: '<>', description: 'Validate and format XML', component: XmlTools },
  { id: 'json-schema-validator', name: 'JSON Schema Validator', group: 'data', icon: '✓{', description: 'Validate JSON against a schema', component: JsonSchemaValidator },
  // --- Web ---
  { id: 'css-validator', name: 'CSS Validator', group: 'web', icon: '#', description: 'Validate CSS syntax', component: CssValidator },
  { id: 'html-validator', name: 'HTML Validator', group: 'web', icon: '<h>', description: 'Validate HTML structure and accessibility', component: HtmlValidator },
  { id: 'css-specificity', name: 'CSS Specificity', group: 'web', icon: '!#', description: 'Calculate CSS selector specificity', component: CssSpecificity },
  { id: 'css-to-tailwind', name: 'CSS → Tailwind', group: 'web', icon: '→T', description: 'Convert CSS rules to Tailwind classes', component: CssToTailwind },
  // --- Convert ---
  { id: 'case-converter', name: 'Case Converter', group: 'convert', icon: 'Aa', description: 'Convert text between cases (camel, snake, kebab, etc)', component: CaseConverter },
  { id: 'color-converter', name: 'Color Converter', group: 'convert', icon: '🎨', description: 'Convert between hex, rgb, hsl, oklch', component: ColorConverter },
  { id: 'timestamp-converter', name: 'Timestamp Converter', group: 'convert', icon: '⏱', description: 'Convert between Unix timestamps and human dates', component: TimestampConverter },
  { id: 'base64', name: 'Base64', group: 'convert', icon: 'B64', description: 'Encode and decode Base64', component: Base64Tool },
  { id: 'url-codec', name: 'URL Encode/Decode', group: 'convert', icon: '%', description: 'URL encode and decode strings', component: UrlCodec },
  { id: 'curl-to-fetch', name: 'cURL → Fetch', group: 'convert', icon: '→f', description: 'Convert cURL commands to fetch/axios', component: CurlToFetch },
  { id: 'uuid-generator', name: 'UUID Generator', group: 'convert', icon: '#!', description: 'Generate and validate UUIDs', component: UuidGenerator },
  { id: 'hash-generator', name: 'Hash Generator', group: 'convert', icon: '##', description: 'Generate MD5, SHA-1, SHA-256, SHA-512 hashes', component: HashGenerator },
  // --- Test ---
  { id: 'regex-tester', name: 'Regex Tester', group: 'test', icon: '.*', description: 'Test and replace with match highlighting, groups, and export', component: RegexTester },
  { id: 'jwt-decoder', name: 'JWT Decoder', group: 'test', icon: 'JWT', description: 'Decode and inspect JWT tokens', component: JwtDecoder },
  // --- Network ---
  { id: 'api-client', name: 'API Client', group: 'network', icon: '↗', description: 'HTTP client with params editor, body modes, and response inspector', component: ApiClient },
  { id: 'docs-browser', name: 'Docs Browser', group: 'network', icon: '📖', description: 'Browse devdocs.io documentation', component: DocsBrowser },
  // --- Write ---
  { id: 'markdown-editor', name: 'Markdown Editor', group: 'write', icon: 'MD', description: 'Edit and preview markdown with Mermaid support', component: MarkdownEditor },
  { id: 'mermaid-editor', name: 'Mermaid Editor', group: 'write', icon: '◇', description: 'Edit and preview Mermaid diagrams', component: MermaidEditor },
  { id: 'snippets', name: 'Snippets', group: 'write', icon: '✂', description: 'Manage code snippets with tags and search', component: SnippetsManager },
]

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id)
}

export function getToolsByGroup(group: string): ToolDefinition[] {
  return TOOLS.filter((t) => t.group === group)
}
