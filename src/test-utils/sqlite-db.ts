import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

type SqlParams = unknown[]

export type SqliteBatchStatement = {
  sql: string
  params: SqlParams
}

export type SqliteBatchPayload = {
  statements: SqliteBatchStatement[]
  immediate: boolean
}

export type SqliteTestConnection = {
  execute(sql: string, params?: SqlParams): Promise<{ rowsAffected: number; lastInsertId: number }>
  select<T>(sql: string, params?: SqlParams): Promise<T>
}

export type SqliteTestDatabase = {
  connection: SqliteTestConnection
  invoke(command: string, payload?: unknown): Promise<void>
  close(): void
}

const migrationsDirectory = fileURLToPath(new URL('../../src-tauri/migrations/', import.meta.url))
const rustLibraryPath = fileURLToPath(new URL('../../src-tauri/src/lib.rs', import.meta.url))

function migrationFilesFromRust(): string[] {
  const source = readFileSync(rustLibraryPath, 'utf8')
  const blockPattern =
    /Migration\s*\{\s*version:\s*(\d+),[\s\S]*?sql:\s*include_str!\("\.\.\/migrations\/([^"/]+\.sql)"\)/g
  const migrations = [...source.matchAll(blockPattern)].map((match) => ({
    version: Number(match[1]),
    file: match[2] ?? '',
  }))

  if (migrations.length === 0) {
    throw new Error(`No migrations found in ${rustLibraryPath}`)
  }

  const listedFiles = migrations.map(({ file }) => file)
  const directoryFiles = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  const sortedListedFiles = [...listedFiles].sort()
  if (JSON.stringify(directoryFiles) !== JSON.stringify(sortedListedFiles)) {
    throw new Error(
      `Migration list mismatch. lib.rs lists [${sortedListedFiles.join(', ')}], but the directory contains [${directoryFiles.join(', ')}]`
    )
  }

  const uniqueFiles = new Set(listedFiles)
  if (uniqueFiles.size !== listedFiles.length) {
    throw new Error('The migration list in lib.rs contains a duplicate file')
  }

  for (const [index, migration] of migrations.entries()) {
    const fileVersion = Number(migration.file.slice(0, 3))
    if (fileVersion !== migration.version) {
      throw new Error(
        `Migration version ${migration.version} does not match file ${migration.file}`
      )
    }
    const previous = migrations[index - 1]
    if (previous && previous.version >= migration.version) {
      throw new Error('The migration list in lib.rs is not in ascending version order')
    }
  }

  return listedFiles
}

function rewriteParameters(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?$1')
}

function normalizeParameter(value: unknown): SQLInputValue {
  if (value == null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value
  }
  if (value instanceof Uint8Array) return value
  return JSON.stringify(value)
}

function prepareParameters(params: SqlParams): SQLInputValue[] {
  return params.map(normalizeParameter)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createSqliteTestDatabase(): SqliteTestDatabase {
  const database = new DatabaseSync(':memory:')
  database.exec('PRAGMA foreign_keys=ON')

  for (const migrationFile of migrationFilesFromRust()) {
    const migrationPath = `${migrationsDirectory}/${migrationFile}`
    database.exec('BEGIN')
    try {
      database.exec(readFileSync(migrationPath, 'utf8'))
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw new Error(`Migration ${migrationFile} failed: ${errorMessage(error)}`, {
        cause: error,
      })
    }
  }

  const connection: SqliteTestConnection = {
    async execute(sql, params = []) {
      const result = database.prepare(rewriteParameters(sql)).run(...prepareParameters(params))
      return {
        rowsAffected: Number(result.changes),
        lastInsertId: Number(result.lastInsertRowid),
      }
    },
    async select<T>(sql: string, params: SqlParams = []): Promise<T> {
      const rows = database
        .prepare(rewriteParameters(sql))
        .all(...prepareParameters(params))
        .map((row) => ({ ...row }))
      return rows as T
    },
  }

  return {
    connection,
    async invoke(command, payload) {
      if (command !== 'db_execute_batch') {
        throw new Error(`Unsupported test invoke command: ${command}`)
      }
      const { statements, immediate } = payload as SqliteBatchPayload
      if (statements.length === 0) return

      database.exec(immediate ? 'BEGIN IMMEDIATE' : 'BEGIN')
      try {
        for (const statement of statements) {
          database
            .prepare(rewriteParameters(statement.sql))
            .run(...prepareParameters(statement.params))
        }
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw new Error(`Batch statement failed: ${errorMessage(error)}`, { cause: error })
      }
    },
    close() {
      database.close()
    },
  }
}
