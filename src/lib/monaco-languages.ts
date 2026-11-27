// Vite enumerates the installed catalog so existing documents retain their syntax highlighting.
// Monaco's contribution modules register a language before they load its tokenizer.
const basicLanguages = import.meta.glob(
  '/node_modules/monaco-editor/esm/vs/basic-languages/*/*.contribution.js'
)

// A few contributions register IDs that differ from their directory name.
const contributionDirectories = new Map([
  ['aes', 'sophia'],
  ['c', 'cpp'],
  ['coffeescript', 'coffee'],
  ['proto', 'protobuf'],
  ['sol', 'solidity'],
  ['verilog', 'systemverilog'],
])

const loadCss = () => import('monaco-editor/esm/vs/language/css/monaco.contribution.js')
const loadHtml = () => import('monaco-editor/esm/vs/language/html/monaco.contribution.js')
const loadTypeScript = () =>
  import('monaco-editor/esm/vs/language/typescript/monaco.contribution.js')

const services = new Map<string, () => Promise<unknown>>([
  ['json', () => import('monaco-editor/esm/vs/language/json/monaco.contribution.js')],
  ['css', loadCss],
  ['scss', loadCss],
  ['less', loadCss],
  ['html', loadHtml],
  ['handlebars', loadHtml],
  ['razor', loadHtml],
  ['javascript', loadTypeScript],
  ['typescript', loadTypeScript],
])

const loaded = new Set<string>()
const loading = new Map<string, Promise<void>>()

function basicLoader(language: string) {
  const directory = language.startsWith('freemarker2.')
    ? 'freemarker2'
    : (contributionDirectories.get(language) ?? language)
  return basicLanguages[
    `/node_modules/monaco-editor/esm/vs/basic-languages/${directory}/${directory}.contribution.js`
  ]
}

export function isMonacoLanguageReady(language: string): boolean {
  return loaded.has(language) || (!basicLoader(language) && !services.has(language))
}

export function loadMonacoLanguage(language: string): Promise<void> {
  if (isMonacoLanguageReady(language)) return Promise.resolve()
  const pending = loading.get(language)
  if (pending) return pending

  const task = (async () => {
    await basicLoader(language)?.()
    await services.get(language)?.()
    loaded.add(language)
  })().finally(() => loading.delete(language))
  loading.set(language, task)
  return task
}
