import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Build with `bunx vite build --manifest` before running this against the output directory.
const buildDirectory = process.argv[2] ?? 'dist'
const manifest = JSON.parse(readFileSync(join(buildDirectory, '.vite/manifest.json'), 'utf8'))

function staticJavaScript(entry) {
  const visited = new Set()
  const files = new Set()

  function visit(key) {
    if (visited.has(key)) return
    visited.add(key)
    const chunk = manifest[key]
    if (!chunk) throw new Error(`Build manifest is missing ${key}`)
    if (chunk.file.endsWith('.js')) files.add(chunk.file)
    for (const dependency of chunk.imports ?? []) visit(dependency)
  }

  visit(entry)
  return files
}

function sizes(files) {
  let bytes = 0
  let gzipBytes = 0
  for (const file of files) {
    const content = readFileSync(join(buildDirectory, file))
    bytes += content.length
    gzipBytes += gzipSync(content).length
  }
  return { files: files.length, bytes, gzipBytes }
}

const initial = staticJavaScript('index.html')
const tools = {
  json: 'src/tools/json-tools/JsonTools.tsx',
  markdown: 'src/tools/markdown-editor/MarkdownEditor.tsx',
  apiClient: 'src/tools/api-client/ApiClient.tsx',
}
const firstTool = Object.fromEntries(
  Object.entries(tools).map(([tool, entry]) => [
    tool,
    sizes([...staticJavaScript(entry)].filter((file) => !initial.has(file))),
  ])
)

const workers = readdirSync(join(buildDirectory, 'assets'))
  .filter((file) => /\.worker-[^/]+\.js$/.test(file))
  .map((file) => ({ file, bytes: readFileSync(join(buildDirectory, 'assets', file)).length }))

console.log(JSON.stringify({ initial: sizes([...initial]), firstTool, workers }, null, 2))
