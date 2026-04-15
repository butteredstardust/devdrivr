import { create } from 'zustand'
import {
  deleteUserPromptTemplate,
  loadUserPromptTemplates,
  saveUserPromptTemplate,
  saveUserPromptTemplates,
} from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'
import type { PromptTemplate } from '@/types/models'
import {
  estimateTokens,
  syncVariablesToPrompt,
  type PromptTemplateDraft,
} from '@/tools/prompt-templates/template-utils'

type PromptTemplatesStore = {
  userTemplates: PromptTemplate[]
  initialized: boolean
  saving: boolean
  init: () => Promise<void>
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

export const usePromptTemplatesStore = create<PromptTemplatesStore>()((set, get) => ({
  userTemplates: [],
  initialized: false,
  saving: false,

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const userTemplates = await loadUserPromptTemplates()
        set({ userTemplates, initialized: true })
      })()
    }
    return initPromise
  },

  create: async (draft) => {
    const template = toUserTemplate(draft)
    set({ saving: true })
    try {
      await saveUserPromptTemplate(template)
      set((state) => ({
        userTemplates: [template, ...state.userTemplates].sort(byUpdatedDesc),
        saving: false,
      }))
      return template
    } catch (err) {
      set({ saving: false })
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
    set({ saving: true })
    try {
      await saveUserPromptTemplate(updated)
      set((state) => ({
        userTemplates: state.userTemplates
          .map((template) => (template.id === id ? updated : template))
          .sort(byUpdatedDesc),
        saving: false,
      }))
      return updated
    } catch (err) {
      set({ saving: false })
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to save prompt template: ' + msg, 'error')
      throw err
    }
  },

  remove: async (id) => {
    set({ saving: true })
    try {
      await deleteUserPromptTemplate(id)
      set((state) => ({
        userTemplates: state.userTemplates.filter((template) => template.id !== id),
        saving: false,
      }))
    } catch (err) {
      set({ saving: false })
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to delete prompt template: ' + msg, 'error')
      throw err
    }
  },

  importMany: async (drafts) => {
    const templates = drafts.map((draft) => toUserTemplate(draft))
    set({ saving: true })
    try {
      await saveUserPromptTemplates(templates)
      set((state) => ({
        userTemplates: [...templates, ...state.userTemplates].sort(byUpdatedDesc),
        saving: false,
      }))
      return templates
    } catch (err) {
      set({ saving: false })
      const msg = err instanceof Error ? err.message : String(err)
      useUiStore.getState().addToast('Failed to import prompt templates: ' + msg, 'error')
      throw err
    }
  },
}))
