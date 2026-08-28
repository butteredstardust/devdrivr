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

// @monaco-editor/react defaults to jsDelivr's AMD loader. Cockpit is a local-first desktop app,
// so the editor runtime and every language worker must come from the production bundle instead.
// Configure this before React mounts: the first lazy tool may call loader.init() immediately.
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
