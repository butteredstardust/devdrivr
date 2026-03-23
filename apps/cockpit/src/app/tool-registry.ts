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
  { id: 'xml-tools', name: 'XML Tools', group: 'data', icon: '<>', description: 'Validate, format, minify XML with tree view, JSON conversion, XPath, and stats', component: XmlTools },
  { id: 'json-schema-validator', name: 'JSON Schema Validator', group: 'data', icon: '✓{', description: 'Validate JSON against schemas with 7 templates, inference, sample generation, and strict mode', component: JsonSchemaValidator },
  // --- Web ---
  { id: 'css-validator', name: 'CSS Validator', group: 'web', icon: '#', description: 'Validate CSS syntax', component: CssValidator },
  { id: 'html-validator', name: 'HTML Validator', group: 'web', icon: '<h>', description: 'Validate HTML with live preview, configurable rules, heading outline, and starter templates', component: HtmlValidator },
  { id: 'css-specificity', name: 'CSS Specificity', group: 'web', icon: '!#', description: 'Calculate specificity with segmented bars, component breakdown, winner detection, and !important', component: CssSpecificity },
  { id: 'css-to-tailwind', name: 'CSS → Tailwind', group: 'web', icon: '→T', description: 'Convert CSS rules to Tailwind classes', component: CssToTailwind },
  // --- Convert ---
  { id: 'case-converter', name: 'Case Converter', group: 'convert', icon: 'Aa', description: 'Convert between 12 cases with detection, word splitting, and chaining', component: CaseConverter },
  { id: 'color-converter', name: 'Color Converter', group: 'convert', icon: '🎨', description: 'Convert hex/rgb/hsl/hsb/oklch with 148 named colors, shade scale, harmony, and history', component: ColorConverter },
  { id: 'timestamp-converter', name: 'Timestamp Converter', group: 'convert', icon: '⏱', description: 'Timestamps with presets, date picker, timezone, day/week info', component: TimestampConverter },
  { id: 'base64', name: 'Base64', group: 'convert', icon: 'B64', description: 'Encode/decode Base64 with URL-safe, line wrap, image preview, data URIs', component: Base64Tool },
  { id: 'url-codec', name: 'URL Encode/Decode', group: 'convert', icon: '%', description: 'URL encode/decode with swap, double-encode detection, color-coded parts', component: UrlCodec },
  { id: 'curl-to-fetch', name: 'cURL → Fetch', group: 'convert', icon: '→f', description: 'Convert cURL to fetch, axios, ky, XHR, Node.js with syntax highlighting', component: CurlToFetch },
  { id: 'uuid-generator', name: 'UUID Generator', group: 'convert', icon: '#!', description: 'Generate v1/v4/v7 UUIDs with universal validation, parsing, and bulk export', component: UuidGenerator },
  { id: 'hash-generator', name: 'Hash Generator', group: 'convert', icon: '##', description: 'Generate hashes and HMAC with comparison and export', component: HashGenerator },
  // --- Test ---
  { id: 'regex-tester', name: 'Regex Tester', group: 'test', icon: '.*', description: 'Test and replace with match highlighting, groups, and export', component: RegexTester },
  { id: 'jwt-decoder', name: 'JWT Decoder', group: 'test', icon: 'JWT', description: 'Decode JWTs with claim annotations, live expiry, and color-coded parts', component: JwtDecoder },
  // --- Network ---
  { id: 'api-client', name: 'API Client', group: 'network', icon: '↗', description: 'HTTP client with params editor, body modes, and response inspector', component: ApiClient },
  { id: 'docs-browser', name: 'Docs Browser', group: 'network', icon: '📖', description: 'Browse devdocs.io documentation', component: DocsBrowser },
  // --- Write ---
  { id: 'markdown-editor', name: 'Markdown Editor', group: 'write', icon: 'MD', description: 'Edit markdown with toolbar, templates, TOC, reading time, and download export', component: MarkdownEditor },
  { id: 'mermaid-editor', name: 'Mermaid Editor', group: 'write', icon: '◇', description: 'Edit and preview Mermaid diagrams', component: MermaidEditor },
  { id: 'snippets', name: 'Snippets', group: 'write', icon: '✂', description: 'Manage snippets with favorites, tag filters, sort, duplicate, and download', component: SnippetsManager },
]

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id)
}

export function getToolsByGroup(group: string): ToolDefinition[] {
  return TOOLS.filter((t) => t.group === group)
}
