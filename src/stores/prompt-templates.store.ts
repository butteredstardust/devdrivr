import { create } from 'zustand'
import {
  deleteUserPromptTemplate,
  loadUserPromptTemplates,
  saveUserPromptTemplate,
  saveUserPromptTemplates,
  seedBuiltinPromptTemplates,
} from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'
import type { PromptTemplate } from '@/types/models'
import { BUILTIN_PROMPT_TEMPLATES } from '@/tools/prompt-templates/builtin-templates'
import {
  estimateTokens,
  syncVariablesToPrompt,
  type PromptTemplateDraft,
} from '@/tools/prompt-templates/template-utils'

type PromptTemplatesStore = {
  userTemplates: PromptTemplate[]
  initialized: boolean
  /** True while at least one write is in flight. Derived from {@link savingCount}. */
  saving: boolean
  /**
   * Writes currently in flight. A single boolean lets the first operation to finish report
   * "done" while another is still running, so the count owns the flag instead.
   */
  savingCount: number
  init: () => Promise<void>
  refresh: () => Promise<void>
  create: (draft: PromptTemplateDraft) => Promise<PromptTemplate>
  update: (id: string, draft: PromptTemplateDraft) => Promise<PromptTemplate | null>
  remove: (id: string) => Promise<void>
  importMany: (drafts: PromptTemplateDraft[]) => Promise<PromptTemplate[]>
}

let initPromise: Promise<void> | null = null

function normalizeDraft(draft: PromptTemplateDraft): PromptTemplateDraft {
  const prompt = draft.prompt.trim()
  const variables = syncVariablesToPrompt(prompt, draft.variables)
  const tags = [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))]
  const tips = [...new Set(draft.tips.map((tip) => tip.trim()).filter(Boolean))]

  return {
    ...draft,
    name: draft.name.trim() || 'Untitled Prompt',
    description: draft.description.trim(),
    tags,
    tips,
    prompt,
    variables,
    estimatedTokens: estimateTokens(prompt),
    version: draft.version.trim() || '1.0.0',
  }
}

function byUpdatedDesc(a: PromptTemplate, b: PromptTemplate): number {
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
}

function toUserTemplate(draft: PromptTemplateDraft, id = crypto.randomUUID()): PromptTemplate {
  const normalized = normalizeDraft(draft)
  const now = Date.now()
  return {
    ...normalized,
    id,
    author: 'user',
    createdAt: now,
    updatedAt: now,
  }
}

/** One completed write: `saving` stays true until every in-flight write has finished. */
function endSaving(state: { savingCount: number }): { savingCount: number; saving: boolean } {
  const savingCount = Math.max(0, state.savingCount - 1)
  return { savingCount, saving: savingCount > 0 }
}

export const usePromptTemplatesStore = create<PromptTemplatesStore>()((set, get) => ({
  userTemplates: [],
  initialized: false,
  saving: false,
  savingCount: 0,

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        await seedBuiltinPromptTemplates(BUILTIN_PROMPT_TEMPLATES)
        const userTemplates = await loadUserPromptTemplates()
        set({ userTemplates, initialized: true })
      })().catch((err: unknown) => {
        // Clear the cached promise on failure so a later call retries
        // instead of latching a transient error for the process lifetime.
        initPromise = null
        throw err
      })
    }
    return initPromise
  },

  refresh: async () => {
    const userTemplates = await loadUserPromptTemplates()
    set({ userTemplates, initialized: true })
  },

  create: async (draft) => {
    const template = toUserTemplate(draft)
    set((state) => ({ savingCount: state.savingCount + 1, saving: true }))
    try {
      await saveUserPromptTemplate(template)
      set((state) => ({
        userTemplates: [template, ...state.userTemplates].sort(byUpdatedDesc),
        ...endSaving(state),
      }))
      return template
    } catch (err) {
      set((state) => endSaving(state))
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save prompt template: ' + msg, 'error')
      throw err
    }
  },

  update: async (id, draft) => {
    const current = get().userTemplates.find((template) => template.id === id)
    if (!current) return null
    const normalized = normalizeDraft(draft)
    const updated: PromptTemplate = {
      ...current,
      ...normalized,
      author: 'user',
      updatedAt: Date.now(),
    }
    set((state) => ({ savingCount: state.savingCount + 1, saving: true }))
    try {
      await saveUserPromptTemplate(updated)
      set((state) => ({
        userTemplates: state.userTemplates
          .map((template) => (template.id === id ? updated : template))
          .sort(byUpdatedDesc),
        ...endSaving(state),
      }))
      return updated
    } catch (err) {
      set((state) => endSaving(state))
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save prompt template: ' + msg, 'error')
      throw err
    }
  },

  remove: async (id) => {
    set((state) => ({ savingCount: state.savingCount + 1, saving: true }))
    try {
      await deleteUserPromptTemplate(id)
      set((state) => ({
        userTemplates: state.userTemplates.filter((template) => template.id !== id),
        ...endSaving(state),
      }))
    } catch (err) {
      set((state) => endSaving(state))
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to delete prompt template: ' + msg, 'error')
      throw err
    }
  },

  importMany: async (drafts) => {
    const templates = drafts.map((draft) => toUserTemplate(draft))
    set((state) => ({ savingCount: state.savingCount + 1, saving: true }))
    try {
      await saveUserPromptTemplates(templates)
      set((state) => ({
        userTemplates: [...templates, ...state.userTemplates].sort(byUpdatedDesc),
        ...endSaving(state),
      }))
      return templates
    } catch (err) {
      set((state) => endSaving(state))
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to import prompt templates: ' + msg, 'error')
      throw err
    }
  },
}))
