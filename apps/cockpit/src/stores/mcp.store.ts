import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'
import { getSetting, setSetting } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'
import type {
  McpAction,
  McpPermissions,
  McpResource,
  McpResourcePermissions,
  McpSettings,
  McpStatus,
} from '@/types/models'

const MCP_SETTINGS_KEY = 'mcpSettings'
export const DEFAULT_MCP_PORT = 17347
export const MCP_RESOURCES: McpResource[] = ['notes', 'snippets', 'promptTemplates', 'apiRequests']
export const MCP_ACTIONS: McpAction[] = ['read', 'create', 'update', 'delete']

export const MCP_RESOURCE_LABELS: Record<McpResource, string> = {
  notes: 'Notes',
  snippets: 'Snippets',
  promptTemplates: 'Prompt Templates',
  apiRequests: 'API Requests',
}

const READ_ONLY_PERMISSION: McpResourcePermissions = {
  read: true,
  create: false,
  update: false,
  delete: false,
}

export const DEFAULT_MCP_PERMISSIONS: McpPermissions = {
  notes: { ...READ_ONLY_PERMISSION },
  snippets: { ...READ_ONLY_PERMISSION },
  promptTemplates: { ...READ_ONLY_PERMISSION },
  apiRequests: { ...READ_ONLY_PERMISSION },
}

function emptyStatus(settings: Pick<McpSettings, 'host' | 'port'>): McpStatus {
  return {
    running: false,
    host: settings.host,
    port: settings.port,
    url: `http://${settings.host}:${settings.port}/mcp`,
    lastError: null,
  }
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function normalizePort(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MCP_PORT
  return Math.min(65535, Math.max(1024, Math.trunc(value)))
}

function mergePermissions(saved: Partial<McpPermissions> | undefined): McpPermissions {
  return {
    notes: { ...DEFAULT_MCP_PERMISSIONS.notes, ...saved?.notes },
    snippets: { ...DEFAULT_MCP_PERMISSIONS.snippets, ...saved?.snippets },
    promptTemplates: {
      ...DEFAULT_MCP_PERMISSIONS.promptTemplates,
      ...saved?.promptTemplates,
    },
    apiRequests: { ...DEFAULT_MCP_PERMISSIONS.apiRequests, ...saved?.apiRequests },
  }
}

function normalizeSettings(saved: Partial<McpSettings> | null): McpSettings {
  return {
    enabled: saved?.enabled ?? true,
    host: '127.0.0.1',
    port: normalizePort(saved?.port ?? DEFAULT_MCP_PORT),
    apiKey: saved?.apiKey || generateApiKey(),
    permissions: mergePermissions(saved?.permissions),
    apiRequestsExposeSecrets: saved?.apiRequestsExposeSecrets ?? false,
  }
}

type McpStore = {
  initialized: boolean
  pending: boolean
  settings: McpSettings
  status: McpStatus
  init: () => Promise<void>
  refreshStatus: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
  updateSettings: (patch: Partial<McpSettings>) => Promise<void>
  updatePermission: (resource: McpResource, action: McpAction, enabled: boolean) => Promise<void>
  rotateKey: () => Promise<void>
}

let initPromise: Promise<void> | null = null

async function persistSettings(settings: McpSettings): Promise<void> {
  await setSetting(MCP_SETTINGS_KEY, settings)
}

async function invokeStatus(settings: McpSettings): Promise<McpStatus> {
  return invoke<McpStatus>('mcp_status', { settings })
}

export const useMcpStore = create<McpStore>()((set, get) => ({
  initialized: false,
  pending: false,
  settings: normalizeSettings(null),
  status: emptyStatus({ host: '127.0.0.1', port: DEFAULT_MCP_PORT }),

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const saved = await getSetting<Partial<McpSettings> | null>(MCP_SETTINGS_KEY, null)
        const settings = normalizeSettings(saved)
        await persistSettings(settings)
        set({ settings, status: emptyStatus(settings), initialized: true })

        try {
          const status = settings.enabled
            ? await invoke<McpStatus>('mcp_start', { settings })
            : await invokeStatus(settings)
          set({ status })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          set({ status: { ...emptyStatus(settings), lastError: msg } })
          useUiStore.getState().addToast('Failed to start MCP server: ' + msg, 'error')
        }
      })()
    }
    return initPromise
  },

  refreshStatus: async () => {
    const settings = get().settings
    try {
      const status = await invokeStatus(settings)
      set({ status })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ status: { ...get().status, running: false, lastError: msg } })
    }
  },

  start: async () => {
    const settings = { ...get().settings, enabled: true }
    set({ pending: true, settings })
    try {
      await persistSettings(settings)
      const status = await invoke<McpStatus>('mcp_start', { settings })
      set({ status })
    } finally {
      set({ pending: false })
    }
  },

  stop: async () => {
    const settings = { ...get().settings, enabled: false }
    set({ pending: true, settings })
    try {
      await persistSettings(settings)
      const status = await invoke<McpStatus>('mcp_stop', { settings })
      set({ status })
    } finally {
      set({ pending: false })
    }
  },

  restart: async () => {
    const settings = { ...get().settings, enabled: true }
    set({ pending: true, settings })
    try {
      await persistSettings(settings)
      const status = await invoke<McpStatus>('mcp_restart', { settings })
      set({ status })
    } finally {
      set({ pending: false })
    }
  },

  updateSettings: async (patch) => {
    const next = normalizeSettings({ ...get().settings, ...patch })
    set({ pending: true, settings: next })
    try {
      await persistSettings(next)
      const status = await invoke<McpStatus>('mcp_apply_settings', { settings: next })
      set({ status })
    } finally {
      set({ pending: false })
    }
  },

  updatePermission: async (resource, action, enabled) => {
    const settings = get().settings
    await get().updateSettings({
      permissions: {
        ...settings.permissions,
        [resource]: {
          ...settings.permissions[resource],
          [action]: enabled,
        },
      },
    })
  },

  rotateKey: async () => {
    await get().updateSettings({ apiKey: generateApiKey() })
  },
}))
