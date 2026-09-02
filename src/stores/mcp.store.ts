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
    enabled: saved?.enabled ?? false,
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

async function restoreAppliedSettings(
  settings: McpSettings
): Promise<{ status: McpStatus | null; error: string | null }> {
  const errors: string[] = []
  try {
    await persistSettings(settings)
  } catch (err) {
    errors.push(`settings persistence: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    const status = await invoke<McpStatus>('mcp_apply_settings', { settings })
    return { status, error: errors.length > 0 ? errors.join('; ') : null }
  } catch (err) {
    errors.push(`native settings: ${err instanceof Error ? err.message : String(err)}`)
    return { status: null, error: errors.join('; ') }
  }
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
      let failed = false
      initPromise = (async () => {
        let settings = normalizeSettings(null)
        try {
          const saved = await getSetting<Partial<McpSettings> | null>(MCP_SETTINGS_KEY, null)
          settings = normalizeSettings(saved)
          await persistSettings(settings)
          set({ settings, status: emptyStatus(settings), initialized: true })

          const status = settings.enabled
            ? await invoke<McpStatus>('mcp_start', { settings })
            : await invokeStatus(settings)
          set({ status })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          set({
            settings,
            initialized: true,
            status: { ...emptyStatus(settings), lastError: msg },
          })
          failed = true
          // MCP is an optional, disabled-by-default feature. init() must
          // never reject: providers.tsx awaits it during bootstrap, and a
          // rejection there sends the whole app to the startup error
          // screen — strictly worse than a degraded MCP server. Guard the
          // toast call too, so even an unexpected addToast failure can't
          // turn this into an unhandled rejection.
          try {
            useUiStore.getState().addToast('Failed to initialize MCP server: ' + msg, 'error')
          } catch {
            // Swallow — see comment above.
          }
        }
      })().then(() => {
        // Clear the cached promise on failure so a transient error doesn't latch
        // the app in a broken state for the rest of the process lifetime — a later
        // init() call retries. This must happen in a `.then()` rather than inside
        // the catch above: a *synchronous* throw from getSetting() runs that catch
        // during the IIFE's synchronous prologue, i.e. before the
        // `initPromise = ...` assignment completes, so clearing there would be
        // immediately clobbered and the retry would never happen. A `.then()`
        // callback is always a later microtask, so the assignment has landed.
        if (failed) initPromise = null
      })
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
    const previous = get().settings
    const settings = { ...previous, enabled: true }
    set({ pending: true, settings })
    try {
      await persistSettings(settings)
      const status = await invoke<McpStatus>('mcp_start', { settings })
      set({ status })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const restored = await restoreAppliedSettings(previous)
      const lastError = restored.error
        ? `${msg}; failed to fully restore MCP settings: ${restored.error}`
        : msg
      set({
        settings: previous,
        status: restored.status
          ? { ...restored.status, lastError }
          : { ...get().status, running: false, lastError },
      })
      if (restored.error) throw new Error(lastError, { cause: err })
      throw err
    } finally {
      set({ pending: false })
    }
  },

  stop: async () => {
    const previous = get().settings
    const settings = { ...previous, enabled: false }
    set({ pending: true, settings })
    try {
      await persistSettings(settings)
      const status = await invoke<McpStatus>('mcp_stop', { settings })
      set({ status })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const restored = await restoreAppliedSettings(previous)
      const lastError = restored.error
        ? `${msg}; failed to fully restore MCP settings: ${restored.error}`
        : msg
      set({
        settings: previous,
        status: restored.status
          ? { ...restored.status, lastError }
          : { ...get().status, running: false, lastError },
      })
      if (restored.error) throw new Error(lastError, { cause: err })
      throw err
    } finally {
      set({ pending: false })
    }
  },

  restart: async () => {
    const previous = get().settings
    const settings = { ...previous, enabled: true }
    set({ pending: true, settings })
    try {
      await persistSettings(settings)
      const status = await invoke<McpStatus>('mcp_restart', { settings })
      set({ status })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const restored = await restoreAppliedSettings(previous)
      const lastError = restored.error
        ? `${msg}; failed to fully restore MCP settings: ${restored.error}`
        : msg
      set({
        settings: previous,
        status: restored.status
          ? { ...restored.status, lastError }
          : { ...get().status, running: false, lastError },
      })
      if (restored.error) throw new Error(lastError, { cause: err })
      throw err
    } finally {
      set({ pending: false })
    }
  },

  updateSettings: async (patch) => {
    const previous = get().settings
    const next = normalizeSettings({ ...previous, ...patch })
    set({ pending: true, settings: next })
    try {
      await persistSettings(next)
      const status = await invoke<McpStatus>('mcp_apply_settings', { settings: next })
      set({ status })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const restored = await restoreAppliedSettings(previous)
      const lastError = restored.error
        ? `${msg}; failed to fully restore MCP settings: ${restored.error}`
        : msg
      set({
        settings: previous,
        status: restored.status
          ? { ...restored.status, lastError }
          : { ...get().status, running: false, lastError },
      })
      if (restored.error) throw new Error(lastError, { cause: err })
      throw err
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
