import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

type MonacoWorkerEnvironment = typeof globalThis & {
  monaco?: typeof monaco
  MonacoEnvironment?: {
    getWorker: (_moduleId: string, label: string) => Worker
  }
}

// @monaco-editor/react defaults to jsDelivr's AMD loader. devdrivr is a local-first desktop app,
// so the editor runtime and every language worker must come from the production bundle instead.
//
// Import this for its side effects from anything that touches Monaco, never from `main.tsx`:
// the runtime is a 3.8MB chunk and belongs in the lazy tool chunks, not in app startup. ESM
// evaluates it before the importing module's body, so `loader.config` always lands before the
// `loader.init()` in `useMonaco` — which is the ordering that actually matters here.
;(globalThis as MonacoWorkerEnvironment).monaco = monaco
;(globalThis as MonacoWorkerEnvironment).MonacoEnvironment = {
  getWorker: (_moduleId, label) => {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker()
    return new EditorWorker()
  },
}

loader.config({ monaco })
