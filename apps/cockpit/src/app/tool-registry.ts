import { lazy } from 'react'
import type { ToolDefinition } from '@/types/tools'

const Placeholder = lazy(() => import('@/tools/placeholder/Placeholder'))
const UuidGenerator = lazy(() => import('@/tools/uuid-generator/UuidGenerator'))

export const TOOLS: ToolDefinition[] = [
  // --- Code ---
  { id: 'code-formatter', name: 'Code Formatter', group: 'code', icon: '⌨', description: 'Format and beautify code (JS, TS, CSS, HTML, SQL, Python)', component: Placeholder },
  { id: 'ts-playground', name: 'TypeScript Playground', group: 'code', icon: 'TS', description: 'Transpile TypeScript to JavaScript', component: Placeholder },
  { id: 'diff-viewer', name: 'Diff Viewer', group: 'code', icon: '±', description: 'Compare text side-by-side or inline', component: Placeholder },
  { id: 'refactoring-toolkit', name: 'Refactoring Toolkit', group: 'code', icon: '♻', description: 'AST-based code transforms (var to let, then to await)', component: Placeholder },
  // --- Data ---
  { id: 'json-tools', name: 'JSON Tools', group: 'data', icon: '{}', description: 'Validate, format, tree view, and table view for JSON', component: Placeholder },
  { id: 'xml-tools', name: 'XML Tools', group: 'data', icon: '<>', description: 'Validate and format XML', component: Placeholder },
  { id: 'json-schema-validator', name: 'JSON Schema Validator', group: 'data', icon: '✓{', description: 'Validate JSON against a schema', component: Placeholder },
  // --- Web ---
  { id: 'css-validator', name: 'CSS Validator', group: 'web', icon: '#', description: 'Validate CSS syntax', component: Placeholder },
  { id: 'html-validator', name: 'HTML Validator', group: 'web', icon: '<h>', description: 'Validate HTML structure and accessibility', component: Placeholder },
  { id: 'css-specificity', name: 'CSS Specificity', group: 'web', icon: '!#', description: 'Calculate CSS selector specificity', component: Placeholder },
  { id: 'css-to-tailwind', name: 'CSS → Tailwind', group: 'web', icon: '→T', description: 'Convert CSS rules to Tailwind classes', component: Placeholder },
  // --- Convert ---
  { id: 'case-converter', name: 'Case Converter', group: 'convert', icon: 'Aa', description: 'Convert text between cases (camel, snake, kebab, etc)', component: Placeholder },
  { id: 'color-converter', name: 'Color Converter', group: 'convert', icon: '🎨', description: 'Convert between hex, rgb, hsl, oklch', component: Placeholder },
  { id: 'timestamp-converter', name: 'Timestamp Converter', group: 'convert', icon: '⏱', description: 'Convert between Unix timestamps and human dates', component: Placeholder },
  { id: 'base64', name: 'Base64', group: 'convert', icon: 'B64', description: 'Encode and decode Base64', component: Placeholder },
  { id: 'url-codec', name: 'URL Encode/Decode', group: 'convert', icon: '%', description: 'URL encode and decode strings', component: Placeholder },
  { id: 'curl-to-fetch', name: 'cURL → Fetch', group: 'convert', icon: '→f', description: 'Convert cURL commands to fetch/axios', component: Placeholder },
  { id: 'uuid-generator', name: 'UUID Generator', group: 'convert', icon: '#!', description: 'Generate and validate UUIDs', component: UuidGenerator },
  { id: 'hash-generator', name: 'Hash Generator', group: 'convert', icon: '##', description: 'Generate MD5, SHA-1, SHA-256, SHA-512 hashes', component: Placeholder },
  // --- Test ---
  { id: 'regex-tester', name: 'Regex Tester', group: 'test', icon: '.*', description: 'Test regular expressions with match highlighting', component: Placeholder },
  { id: 'jwt-decoder', name: 'JWT Decoder', group: 'test', icon: 'JWT', description: 'Decode and inspect JWT tokens', component: Placeholder },
  // --- Network ---
  { id: 'api-client', name: 'API Client', group: 'network', icon: '↗', description: 'Send HTTP requests and view responses', component: Placeholder },
  { id: 'docs-browser', name: 'Docs Browser', group: 'network', icon: '📖', description: 'Browse devdocs.io documentation', component: Placeholder },
  // --- Write ---
  { id: 'markdown-editor', name: 'Markdown Editor', group: 'write', icon: 'MD', description: 'Edit and preview markdown with Mermaid support', component: Placeholder },
  { id: 'mermaid-editor', name: 'Mermaid Editor', group: 'write', icon: '◇', description: 'Edit and preview Mermaid diagrams', component: Placeholder },
  { id: 'snippets', name: 'Snippets', group: 'write', icon: '✂', description: 'Manage code snippets with tags and search', component: Placeholder },
]

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id)
}

export function getToolsByGroup(group: string): ToolDefinition[] {
  return TOOLS.filter((t) => t.group === group)
}
