import { describe, expect, it } from 'vitest'
import contract from '../../../shared/domain-contract.json'
import {
  NOTE_COLORS,
  PROMPT_TEMPLATE_CATEGORIES,
  PROMPT_TEMPLATE_TARGETS,
  RESOURCE_FOLDER_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/lib/domain-values'
import { INBOX_FOLDER_IDS } from '@/lib/resource-folders'

/**
 * The Rust MCP service enforces the same value sets on the same tables and asserts against the
 * same file. A row outside a set is dropped from its tool, so a value added on one side and
 * forgotten on the other fails here instead of making a user's data vanish.
 */
describe('shared domain contract', () => {
  it('matches the note colors', () => {
    expect([...NOTE_COLORS]).toEqual(contract.noteColors)
  })

  it('matches the task statuses and priorities', () => {
    expect([...TASK_STATUSES]).toEqual(contract.taskStatuses)
    expect([...TASK_PRIORITIES]).toEqual(contract.taskPriorities)
  })

  it('matches the prompt template categories and targets', () => {
    expect([...PROMPT_TEMPLATE_CATEGORIES]).toEqual(contract.promptTemplateCategories)
    expect([...PROMPT_TEMPLATE_TARGETS]).toEqual(contract.promptTemplateTargets)
  })

  it('matches the resource folder kinds and system inboxes', () => {
    expect([...RESOURCE_FOLDER_KINDS]).toEqual(contract.resourceFolderKinds)
    expect([...INBOX_FOLDER_IDS].sort()).toEqual([...contract.systemInboxFolderIds].sort())
  })
})
