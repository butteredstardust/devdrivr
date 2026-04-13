// Mock for worker imports with ?worker suffix
// This handles Vite's worker import syntax in tests

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

// Mock the worker factory pattern used in the app
export default function MockWorkerFactory() {
  return new MockWorker()
}

// Export the worker class for direct use
export { MockWorker as Worker }
