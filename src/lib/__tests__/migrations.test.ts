import { describe, expect, it } from 'vitest'
import snippetsFolderMigration from '@/../src-tauri/migrations/005_snippets_folder.sql?raw'
import promptTemplateAuthorsMigration from '@/../src-tauri/migrations/007_prompt_template_authors.sql?raw'
import notesSortOrderMigration from '@/../src-tauri/migrations/008_notes_sort_order.sql?raw'
import persistenceBackfillsMigration from '@/../src-tauri/migrations/009_persistence_backfills.sql?raw'
import resourceFoldersMigration from '@/../src-tauri/migrations/013_resource_folders.sql?raw'
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

  it('creates typed Inboxes and explicitly backfills resource folder references', () => {
    expect(resourceFoldersMigration).toContain("'notes-inbox', 'Inbox', NULL, 'notes'")
    expect(resourceFoldersMigration).toContain("'snippets-inbox', 'Inbox', NULL, 'snippets'")
    expect(resourceFoldersMigration).toContain("'api-requests-inbox', 'Inbox', NULL, 'apiRequests'")
    expect(resourceFoldersMigration).toMatch(
      /UPDATE\s+notes\s+SET\s+folder_id\s*=\s*'notes-inbox'\s+WHERE\s+folder_id\s+IS\s+NULL/i
    )
    expect(resourceFoldersMigration).toMatch(
      /UPDATE\s+snippets\s+SET\s+folder_id\s*=\s*'snippets-inbox'[\s\S]*folder\s*=\s*''/i
    )
    expect(resourceFoldersMigration).toMatch(
      /UPDATE\s+api_requests\s+SET\s+collection_id\s*=\s*'api-requests-inbox'\s+WHERE\s+collection_id\s+IS\s+NULL/i
    )
    expect(resourceFoldersMigration).toMatch(/GROUP BY\s+folder/i)
    expect(resourceFoldersMigration).toMatch(
      /ALTER TABLE\s+api_collections\s+ADD COLUMN\s+parent_id/i
    )
  })

  it('registers the resource folder migration with the Tauri SQL plugin', () => {
    expect(tauriLib).toMatch(/version:\s*13/)
    expect(tauriLib).toContain('include_str!("../migrations/013_resource_folders.sql")')
  })
})
