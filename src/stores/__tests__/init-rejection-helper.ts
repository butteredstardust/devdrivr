import { expect } from 'vitest'

/**
 * Shared assertion for the "clear initPromise on rejection" pattern used by every
 * Zustand store's init() in src/stores/*.store.ts:
 *
 *   let initPromise: Promise<void> | null = null
 *   init: async () => {
 *     if (!initPromise) {
 *       initPromise = (async () => { ... })().catch((err) => {
 *         initPromise = null
 *         throw err
 *       })
 *     }
 *     return initPromise
 *   }
 *
 * `initPromise` is module-level state, so it leaks across every test that shares the
 * same module instance within a test file. A rejected `init()` call latches a resolved
 * `initPromise` for every later test unless the module is reloaded fresh.
 *
 * Callers MUST:
 *   1. Call `vi.resetModules()` in `beforeEach` (or an isolated nested `describe`'s
 *      `beforeEach`), and
 *   2. Dynamically `await import('../x.store')` the store *inside* the test, then read
 *      `getState`/`init` off that fresh import.
 *
 * A top-level `import { useXStore } from '../x.store'` will not work here: it is one
 * shared module instance for the whole file, so a prior test's successful `init()` call
 * (or this helper's own second, successful call) has already latched a resolved
 * `initPromise` that a later test's rejection can never observe.
 */
export async function expectInitRejectionRecovers(config: {
  /** Runs init() on the freshly-imported store, e.g. `() => store.getState().init()`. */
  runInit: () => Promise<void>
  /** Arranges the mocked dependency to fail on the next call underlying init(). */
  arrangeFailure: () => void
  /** Arranges the mocked dependency to succeed on the next call underlying init(). */
  arrangeSuccess: () => void
  /** The message the first init() call is expected to reject with. */
  rejectMessage: string
  /** Assertion(s) about store state immediately after the rejected init() call. */
  assertAfterFailure: () => void
  /** Assertion(s) about store state after the retried, successful init() call. */
  assertAfterSuccess: () => void
  /** Returns how many times the underlying dependency mock has been called so far. */
  getCallCount: () => number
  /** Expected total call count after both init() calls. Defaults to 2 (one per call). */
  expectedCallCount?: number
}): Promise<void> {
  const {
    runInit,
    arrangeFailure,
    arrangeSuccess,
    rejectMessage,
    assertAfterFailure,
    assertAfterSuccess,
    getCallCount,
    expectedCallCount = 2,
  } = config

  arrangeFailure()
  await expect(runInit()).rejects.toThrow(rejectMessage)
  assertAfterFailure()

  arrangeSuccess()
  await runInit()
  assertAfterSuccess()

  expect(getCallCount()).toBe(expectedCallCount)
}
