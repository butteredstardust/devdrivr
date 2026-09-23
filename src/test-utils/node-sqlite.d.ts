declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | Uint8Array

  type SQLResultRow = Record<string, null | number | bigint | string | Uint8Array>

  type StatementResult = {
    changes: number | bigint
    lastInsertRowid: number | bigint
  }

  class StatementSync {
    all(...anonymousParameters: SQLInputValue[]): SQLResultRow[]
    run(...anonymousParameters: SQLInputValue[]): StatementResult
  }

  export class DatabaseSync {
    constructor(location: string)
    close(): void
    exec(sql: string): void
    prepare(sql: string): StatementSync
  }
}
