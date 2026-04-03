// Mock for @tauri-apps/plugin-sql — used in jsdom test environment
const mockConn = {
  execute: () => Promise.resolve({ rowsAffected: 0, lastInsertId: 0 }),
  select: () => Promise.resolve([]),
}

const Database = {
  load: (_path: string) => Promise.resolve(mockConn),
}

export default Database
