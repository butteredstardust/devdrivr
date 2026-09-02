import '@testing-library/jest-dom'
import { JSDOM } from 'jsdom'

console.log('TEST SETUP LOADED')

// Set up JSDOM environment manually
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
  resources: 'usable',
  runScripts: 'dangerously',
})

globalThis.window = dom.window as unknown as Window & typeof globalThis
globalThis.document = dom.window.document

// The DOM constructors are globals in every browser, but this harness runs in Vitest's `node`
// environment and only `window`/`document` were copied across. Product code doing the ordinary
// `x instanceof HTMLElement` narrowing therefore threw ReferenceError in tests and nowhere else.
for (const name of [
  'Node',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'HTMLButtonElement',
  'HTMLAnchorElement',
  'HTMLImageElement',
  'HTMLCanvasElement',
  'HTMLIFrameElement',
  'SVGElement',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'DragEvent',
  'ClipboardEvent',
  'FocusEvent',
  'InputEvent',
  'DOMParser',
  'XMLSerializer',
  'NodeFilter',
  'Range',
  'Selection',
  'DataTransfer',
] as const) {
  if (name in dom.window && !(name in globalThis)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: (dom.window as unknown as Record<string, unknown>)[name],
    })
  }
}

// Only set navigator if it doesn't already exist or isn't read-only
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    writable: true,
    enumerable: true,
    configurable: true,
  })
}

// Worker is not available in jsdom — provide a no-op stub so components
// using useWorker() can mount without crashing in tests.
class MockWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null
  onmessageerror: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: ErrorEvent) => void) | null = null
  postMessage(_message: unknown) {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent(): boolean {
    return false
  }
}

Object.defineProperty(globalThis, 'Worker', { writable: true, value: MockWorker })

// matchMedia is not implemented in jsdom — stub it so components that call
// getEffectiveTheme('system') don't crash. Defaults to dark mode (matches: false
// means light, true means dark — we default to dark to match the app default).
Object.defineProperty(globalThis.window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// vi.mocked is available by default in vitest 4.1.0+
