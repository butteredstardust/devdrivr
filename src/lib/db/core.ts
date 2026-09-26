import Database from '@tauri-apps/plugin-sql'
import { invoke } from '@tauri-apps/api/core'

// Promise singleton prevents TOCTOU race when multiple callers hit getDb() concurrently
// (e.g., StrictMode double-mount or parallel store inits).
let dbPromise: Promise<Database> | null = null
let writeQueue: Promise<void> = Promise.resolve()

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    // Legacy filename kept deliberately so existing installations retain their local data.
    dbPromise = Database.load('sqlite:cockpit.db')
      .then(async (conn) => {
        await conn.execute('PRAGMA journal_mode=WAL')
        await conn.execute('PRAGMA busy_timeout=5000')
        return conn
      })
      .catch((err: unknown) => {
        // Clear the cached promise on failure — whether Database.load() itself
        // rejected or one of the PRAGMA statements did — so a transient failure
        // (e.g. a locked database at launch) doesn't latch every later getDb()
        // call for the rest of the process lifetime. A later call retries.
        dbPromise = null
        throw err
      })
  }
  return dbPromise
}

export function enqueueWrite<T>(operation: (conn: Database) => Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => {
    const conn = await getDb()
    return operation(conn)
  })
  writeQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/** A parameterised statement destined for the atomic batch command. */
export type BatchStatement = { sql: string; params: unknown[]; stopOnZeroRows?: boolean }
type BatchStatementResult = { rowsAffected: number }

/**
 * Runs a group of statements atomically.
 *
 * These cannot be driven from JS with `BEGIN` / `COMMIT` through
 * `@tauri-apps/plugin-sql`: the plugin executes every statement via `pool.execute(...)`
 * on a multi-connection pool, so the statements of a "transaction" can land on different
 * connections — auto-committing individually, erroring on `COMMIT`, or stranding an open
 * transaction on a pooled connection. The `db_execute_batch` Tauri command owns a
 * dedicated single-connection pool and wraps the batch in a real sqlx transaction.
 * See ADR-013 in documentation/infrastructure/ARCHITECTURE_DECISIONS.md.
 *
 * Still routed through `writeQueue` so batches stay ordered against single-statement
 * writes going through the plugin pool.
 */
export function runBatch(
  statements: BatchStatement[],
  immediate = false
): Promise<BatchStatementResult[]> {
  if (statements.length === 0) return Promise.resolve([])
  // enqueueWrite awaits getDb() first, which guarantees the plugin has opened the
  // database and applied migrations before the Rust pool touches the same file.
  return enqueueWrite(() =>
    invoke<BatchStatementResult[]>('db_execute_batch', { statements, immediate })
  )
}
