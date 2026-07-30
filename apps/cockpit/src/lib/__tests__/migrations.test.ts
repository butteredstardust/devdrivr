import { describe, expect, it } from 'vitest'
import snippetsFolderMigration from '@/../src-tauri/migrations/005_snippets_folder.sql?raw'
import promptTemplateAuthorsMigration from '@/../src-tauri/migrations/007_prompt_template_authors.sql?raw'
import notesSortOrderMigration from '@/../src-tauri/migrations/008_notes_sort_order.sql?raw'
import persistenceBackfillsMigration from '@/../src-tauri/migrations/009_persistence_backfills.sql?raw'
import tauriLib from '@/../src-tauri/src/lib.rs?raw'

describe('persistence migrations', () => {
  it.each([
    ['snippet folders', snippetsFolderMigration, /UPDATE\s+snippets\s+SET\s+folder\s*=\s*''/i],
    [
      'prompt template authors',
      promptTemplateAuthorsMigration,
      /UPDATE\s+user_prompt_templates\s+SET\s+author\s*=\s*'user'/i,
    ],
    ['note sort order', notesSortOrderMigration, /UPDATE\s+notes\s+SET\s+sort_order\s*=/i],
  ])('explicitly backfills existing %s rows', (_name, migration, backfillPattern) => {
    expect(migration).toMatch(backfillPattern)
  })

  it('backfills nullable values without modifying already-applied migrations', () => {
    expect(persistenceBackfillsMigration).toMatch(
      /UPDATE\s+notes\s+SET\s+tags\s*=\s*'\[\]'\s+WHERE\s+tags\s+IS\s+NULL/i
    )
    expect(persistenceBackfillsMigration).toMatch(
      /UPDATE\s+history\s+SET\s+success\s*=\s*1\s+WHERE\s+success\s+IS\s+NULL/i
    )
    expect(persistenceBackfillsMigration).toMatch(
      /UPDATE\s+history\s+SET\s+starred\s*=\s*0\s+WHERE\s+starred\s+IS\s+NULL/i
    )
  })

  it('registers the corrective migration with the Tauri SQL plugin', () => {
    expect(tauriLib).toMatch(/version:\s*9/)
    expect(tauriLib).toContain('include_str!("../migrations/009_persistence_backfills.sql")')
  })
})
