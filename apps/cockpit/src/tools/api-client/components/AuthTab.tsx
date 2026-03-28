import type { ApiRequestAuth } from '@/types/models'

type Props = {
  auth: ApiRequestAuth
  onChange: (auth: ApiRequestAuth) => void
}

const AUTH_TYPES = [
  { id: 'none', label: 'No Auth' },
  { id: 'bearer', label: 'Bearer Token' },
  { id: 'basic', label: 'Basic Auth' },
] as const

export function AuthTab({ auth, onChange }: Props) {
  return (
    <div className="flex flex-1 flex-col p-3">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-bold text-[var(--color-text-muted)]">Type:</span>
        <select
          value={auth.type}
          onChange={(e) => {
            const type = e.target.value as ApiRequestAuth['type']
            if (type === 'none') {
              onChange({ type: 'none' })
            } else if (type === 'bearer') {
              onChange({ type: 'bearer', token: '' })
            } else if (type === 'basic') {
              onChange({ type: 'basic', username: '', password: '' })
            }
          }}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        >
          {AUTH_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1">
        {auth.type === 'none' && (
          <div className="text-sm text-[var(--color-text-muted)] mt-8 text-center">
            This request does not use any authorization.
          </div>
        )}

        {auth.type === 'bearer' && (
          <div className="flex max-w-md flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-[var(--color-text)]">Token</span>
              <input
                type="text"
                value={auth.token}
                onChange={(e) => onChange({ ...auth, token: e.target.value })}
                placeholder="Token (or {{token}} variable)"
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-mono text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <p className="text-xs text-[var(--color-text-muted)]">
              The token will be sent in the <code>Authorization: Bearer &lt;token&gt;</code> header.
            </p>
          </div>
        )}

        {auth.type === 'basic' && (
          <div className="flex max-w-md flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-[var(--color-text)]">Username</span>
              <input
                type="text"
                value={auth.username}
                onChange={(e) => onChange({ ...auth, username: e.target.value })}
                placeholder="Username"
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-[var(--color-text)]">Password</span>
              <input
                type="password"
                value={auth.password}
                onChange={(e) => onChange({ ...auth, password: e.target.value })}
                placeholder="Password"
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <p className="text-xs text-[var(--color-text-muted)]">
              Sent as <code>Authorization: Basic &lt;base64&gt;</code> header.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
