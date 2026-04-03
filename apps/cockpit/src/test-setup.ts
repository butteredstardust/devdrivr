import '@testing-library/jest-dom'

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
