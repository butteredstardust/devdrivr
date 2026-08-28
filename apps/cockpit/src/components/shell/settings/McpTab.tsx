/** Settings → MCP: the local MCP server's lifecycle, token and exposed surface. */
import { useCallback, useEffect, useState } from 'react'
import { MCP_ACTIONS, MCP_RESOURCES, MCP_RESOURCE_LABELS, useMcpStore } from '@/stores/mcp.store'
import { useUiStore } from '@/stores/ui.store'
import {
  ArrowClockwiseIcon,
  CopyIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  PlugsConnectedIcon,
  PowerIcon,
  ShieldCheckIcon,
  SpinnerIcon,
  StopCircleIcon,
} from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Toggle } from '@/components/shared/Toggle'
import { Input } from '@/components/shared/Input'
import { SettingRow } from '@/components/shell/settings/SettingControls'

const MIN_MCP_PORT = 1024
const MAX_MCP_PORT = 65535

function McpActionButton({
  label,
  icon,
  pending,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  pending: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex items-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? <SpinnerIcon size={12} className="animate-spin" /> : icon}
      {label}
    </button>
  )
}

export function McpTab() {
  const initialized = useMcpStore((s) => s.initialized)
  const pending = useMcpStore((s) => s.pending)
  const settings = useMcpStore((s) => s.settings)
  const status = useMcpStore((s) => s.status)
  const start = useMcpStore((s) => s.start)
  const stop = useMcpStore((s) => s.stop)
  const restart = useMcpStore((s) => s.restart)
  const updateSettings = useMcpStore((s) => s.updateSettings)
  const updatePermission = useMcpStore((s) => s.updatePermission)
  const rotateKey = useMcpStore((s) => s.rotateKey)
  const refreshStatus = useMcpStore((s) => s.refreshStatus)
  const addToast = useUiStore((s) => s.addToast)
  const [keyVisible, setKeyVisible] = useState(false)
  const [portDraft, setPortDraft] = useState(String(settings.port))

  useEffect(() => {
    setPortDraft(String(settings.port))
  }, [settings.port])

  useEffect(() => {
    void refreshStatus()
    const id = setInterval(() => {
      void refreshStatus()
    }, 5000)
    return () => clearInterval(id)
  }, [refreshStatus])

  const runAction = useCallback(
    async (action: () => Promise<void>, success: string) => {
      try {
        await action()
        addToast(success, 'success')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        addToast(msg, 'error')
      }
    },
    [addToast]
  )

  const copyText = useCallback(
    async (text: string, success: string) => {
      try {
        await navigator.clipboard.writeText(text)
        addToast(success, 'success')
      } catch {
        addToast('Failed to copy to clipboard', 'error')
      }
    },
    [addToast]
  )

  const applyPort = useCallback(() => {
    const trimmed = portDraft.trim()
    if (!/^\d+$/.test(trimmed)) {
      addToast('MCP port must be a number between 1024 and 65535', 'error')
      return
    }

    const port = Number(trimmed)
    if (!Number.isSafeInteger(port) || port < MIN_MCP_PORT || port > MAX_MCP_PORT) {
      addToast('MCP port must be between 1024 and 65535', 'error')
      return
    }

    setPortDraft(String(port))
    void runAction(() => updateSettings({ port }), 'MCP port updated')
  }, [addToast, portDraft, runAction, updateSettings])

  const envCommand = `export COCKPIT_MCP_KEY=${settings.apiKey}`
  const codexCommand = `codex mcp add cockpit --url ${status.url} --bearer-token-env-var COCKPIT_MCP_KEY`
  const claudeCommand = `claude mcp add --transport http cockpit ${status.url} --header "Authorization: Bearer ${settings.apiKey}"`
  const genericJson = JSON.stringify(
    {
      mcpServers: {
        cockpit: {
          type: 'http',
          url: status.url,
          headers: {
            Authorization: 'Bearer <your cockpit MCP key>',
          },
        },
      },
    },
    null,
    2
  )

  if (!initialized) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <SpinnerIcon size={12} className="animate-spin" />
        Initializing MCP settings…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  status.running ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'
                }`}
              />
              <span className="text-sm font-semibold text-[var(--color-text)]">
                {status.running ? 'MCP server running' : 'MCP server stopped'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void copyText(status.url, 'MCP URL copied')}
              className="mt-1 font-mono text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {status.url}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <McpActionButton
              label="Start"
              icon={<PowerIcon size={12} />}
              pending={pending}
              onClick={() => void runAction(start, 'MCP server started')}
            />
            <McpActionButton
              label="Stop"
              icon={<StopCircleIcon size={12} />}
              pending={pending}
              onClick={() => void runAction(stop, 'MCP server stopped')}
            />
            <McpActionButton
              label="Restart"
              icon={<ArrowClockwiseIcon size={12} />}
              pending={pending}
              onClick={() => void runAction(restart, 'MCP server restarted')}
            />
          </div>
        </div>
        {status.lastError && (
          <div className="mt-2 rounded border border-[var(--color-error)]/40 bg-[var(--color-error)]/10 px-2 py-1 text-xs text-[var(--color-error)]">
            {status.lastError}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <SettingRow label="Auto-start MCP" hint="Start the local MCP server when cockpit opens">
          <Toggle
            checked={settings.enabled}
            onChange={(v) =>
              void runAction(() => updateSettings({ enabled: v }), 'MCP setting saved')
            }
          />
        </SettingRow>
        <SettingRow label="Port" hint="Localhost port for Streamable HTTP">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={portDraft}
              onChange={(event) => setPortDraft(event.target.value)}
              min={MIN_MCP_PORT}
              max={MAX_MCP_PORT}
              className="w-24 text-right"
            />
            <button
              type="button"
              onClick={applyPort}
              disabled={pending}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </SettingRow>
      </div>

      <div>
        <SectionLabel as="h4" className="mb-2">
          <KeyIcon size={12} />
          Authentication
        </SectionLabel>
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-[var(--color-surface)] px-2 py-1 font-mono text-xs text-[var(--color-text)]">
              {keyVisible ? settings.apiKey : '•'.repeat(Math.min(32, settings.apiKey.length))}
            </code>
            <button
              type="button"
              onClick={() => setKeyVisible((v) => !v)}
              className="rounded border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              aria-label={keyVisible ? 'Hide MCP key' : 'Show MCP key'}
            >
              {keyVisible ? <EyeSlashIcon size={14} /> : <EyeIcon size={14} />}
            </button>
            <button
              type="button"
              onClick={() => void copyText(settings.apiKey, 'MCP key copied')}
              className="rounded border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              aria-label="Copy MCP key"
            >
              <CopyIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => void runAction(rotateKey, 'MCP key rotated')}
              disabled={pending}
              className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-warning)] hover:text-[var(--color-warning)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50"
            >
              Rotate
            </button>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel as="h4" className="mb-2">
          <ShieldCheckIcon size={12} />
          Permissions
        </SectionLabel>
        <div className="overflow-hidden rounded border border-[var(--color-border)]">
          <div className="grid grid-cols-[1.4fr_repeat(4,0.7fr)] border-b border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
            <span>Resource</span>
            {MCP_ACTIONS.map((action) => (
              <span key={action} className="text-center">
                {action}
              </span>
            ))}
          </div>
          {MCP_RESOURCES.map((resource) => (
            <div
              key={resource}
              className="grid grid-cols-[1.4fr_repeat(4,0.7fr)] items-center border-b border-[var(--color-border)] px-2 py-2 last:border-b-0"
            >
              <span className="text-xs text-[var(--color-text)]">
                {MCP_RESOURCE_LABELS[resource]}
              </span>
              {MCP_ACTIONS.map((action) => (
                <div key={action} className="flex justify-center">
                  <Toggle
                    checked={settings.permissions[resource][action]}
                    onChange={(v) =>
                      void runAction(
                        () => updatePermission(resource, action, v),
                        'MCP permission saved'
                      )
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
        <SettingRow
          label="Expose API request secrets"
          hint="Allow authenticated MCP clients to read saved bearer/basic auth values"
        >
          <Toggle
            checked={settings.apiRequestsExposeSecrets}
            onChange={(v) =>
              void runAction(
                () => updateSettings({ apiRequestsExposeSecrets: v }),
                'MCP secret permission saved'
              )
            }
          />
        </SettingRow>
      </div>

      <div>
        <SectionLabel as="h4" className="mb-2">
          <PlugsConnectedIcon size={12} />
          Client Setup
        </SectionLabel>
        <div className="space-y-2">
          {(
            [
              ['Shell key', envCommand],
              ['Codex', codexCommand],
              ['Claude Code', claudeCommand],
              ['Generic JSON', genericJson],
            ] as const
          ).map(([label, command]) => (
            <button
              key={label}
              type="button"
              onClick={() => void copyText(command, `${label} setup copied`)}
              className="flex w-full items-start gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-left transition-colors hover:border-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <CopyIcon size={14} className="mt-0.5 shrink-0 text-[var(--color-text-muted)]" />
              <span className="min-w-24 text-xs font-semibold text-[var(--color-text)]">
                {label}
              </span>
              <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-2xs text-[var(--color-text-muted)]">
                {command}
              </code>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
