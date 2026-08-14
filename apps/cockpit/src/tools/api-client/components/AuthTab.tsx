import { useId, useState } from 'react'
import { Select } from '@/components/shared/Select'
import { Field } from '@/components/shared/Field'
import { Input } from '@/components/shared/Input'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { EyeIcon, EyeSlashIcon, LockKeyOpenIcon } from '@phosphor-icons/react'
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

/** Reveal toggle for secret fields — secrets stay masked until asked for. */
function RevealButton({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="icon"
      size="sm"
      onClick={onToggle}
      aria-pressed={revealed}
      aria-label={revealed ? 'Hide value' : 'Reveal value'}
      title={revealed ? 'Hide value' : 'Reveal value'}
    >
      {revealed ? (
        <EyeSlashIcon size={15} aria-hidden="true" />
      ) : (
        <EyeIcon size={15} aria-hidden="true" />
      )}
    </Button>
  )
}

export function AuthTab({ auth, onChange }: Props) {
  const fieldId = useId()
  const [revealToken, setRevealToken] = useState(false)
  const [revealPassword, setRevealPassword] = useState(false)

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <Field label="Authorization type" htmlFor={`${fieldId}-type`} className="mb-4 max-w-xs">
        <Select
          id={`${fieldId}-type`}
          value={auth.type}
          onChange={(e) => {
            const type = e.target.value as ApiRequestAuth['type']
            setRevealToken(false)
            setRevealPassword(false)
            if (type === 'bearer') {
              onChange({ type: 'bearer', token: '' })
            } else if (type === 'basic') {
              onChange({ type: 'basic', username: '', password: '' })
            } else {
              onChange({ type: 'none' })
            }
          }}
        >
          {AUTH_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

      {auth.type === 'none' && (
        <EmptyState
          icon={LockKeyOpenIcon}
          size="sm"
          title="No authorization"
          description="This request is sent without an Authorization header."
        />
      )}

      {auth.type === 'bearer' && (
        <div className="flex max-w-md flex-col gap-3">
          <Field
            label="Token"
            htmlFor={`${fieldId}-token`}
            hint="Sent as Authorization: Bearer <token>. {{variables}} are resolved from the active environment."
          >
            <div className="flex items-center gap-1">
              <Input
                id={`${fieldId}-token`}
                type={revealToken ? 'text' : 'password'}
                value={auth.token}
                onChange={(e) => onChange({ ...auth, token: e.target.value })}
                placeholder="Token (or {{token}} variable)"
                size="md"
                className="min-w-0 flex-1 font-mono"
              />
              <RevealButton revealed={revealToken} onToggle={() => setRevealToken((r) => !r)} />
            </div>
          </Field>
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="flex max-w-md flex-col gap-3">
          <Field label="Username" htmlFor={`${fieldId}-username`}>
            <Input
              id={`${fieldId}-username`}
              value={auth.username}
              onChange={(e) => onChange({ ...auth, username: e.target.value })}
              placeholder="Username"
              size="md"
              className="font-mono"
            />
          </Field>
          <Field
            label="Password"
            htmlFor={`${fieldId}-password`}
            hint="Sent as Authorization: Basic <base64>."
          >
            <div className="flex items-center gap-1">
              <Input
                id={`${fieldId}-password`}
                type={revealPassword ? 'text' : 'password'}
                value={auth.password}
                onChange={(e) => onChange({ ...auth, password: e.target.value })}
                placeholder="Password"
                size="md"
                className="min-w-0 flex-1 font-mono"
              />
              <RevealButton
                revealed={revealPassword}
                onToggle={() => setRevealPassword((r) => !r)}
              />
            </div>
          </Field>
        </div>
      )}
    </div>
  )
}
