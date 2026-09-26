export { getDb } from './db/core'
export type { BatchStatement } from './db/core'

export { getSetting, setSetting } from './db/settings'

export { loadToolState, saveToolState, deleteToolState } from './db/tool-state'

export {
  loadNotes,
  loadTrashedNotes,
  loadNote,
  saveNote,
  saveNoteIfUnchanged,
  rebuildNoteLinks,
  saveNotesOrder,
  deleteNote,
  restoreNote,
  permanentlyDeleteNote,
  trashCompletedNotes,
} from './db/notes'

export {
  loadSnippets,
  loadTrashedSnippets,
  loadSnippet,
  saveSnippet,
  saveSnippetIfUnchanged,
  saveSnippetImport,
  deleteSnippet,
  restoreSnippet,
  permanentlyDeleteSnippet,
} from './db/snippets'

export {
  loadUserPromptTemplates,
  saveUserPromptTemplate,
  saveUserPromptTemplates,
  deleteUserPromptTemplate,
  seedBuiltinPromptTemplates,
} from './db/prompt-templates'

export { loadHistory, addHistoryEntry, pruneHistory } from './db/history'

export { clearAllNotes } from './db/notes'
export { clearAllSnippets } from './db/snippets'
export { clearAllHistory } from './db/history'
export { clearAllApiRequests } from './db/api-client'
export { clearAllUserPromptTemplates } from './db/prompt-templates'

export {
  loadResourceFolders,
  loadTrashedResourceFolders,
  saveResourceFolder,
  saveResourceFolderMove,
  saveResourceFolderOrder,
  trashResourceFolderSubtree,
  restoreResourceFolderSubtree,
  permanentlyDeleteResourceFolderSubtree,
  emptyResourceTrash,
} from './db/resource-folders'

export { restoreNotesFromBackup } from './db/notes'

export {
  loadApiEnvironments,
  saveApiEnvironment,
  deleteApiEnvironment,
  loadApiCollections,
  loadTrashedApiCollections,
  saveApiCollection,
  deleteApiCollection,
  restoreApiCollection,
  permanentlyDeleteApiCollection,
  loadApiRequests,
  loadTrashedApiRequests,
  saveApiRequest,
  saveApiImport,
  deleteApiRequest,
  restoreApiRequest,
  permanentlyDeleteApiRequest,
} from './db/api-client'
