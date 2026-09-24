import { useMemo, type Dispatch, type SetStateAction } from 'react'
import type { EditorProps } from '@monaco-editor/react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { TabBar } from '@/components/shared/TabBar'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { EmptyState } from '@/components/shared/EmptyState'
import { Toolbar } from '@/components/shared/Toolbar'
import { Checkbox } from '@/components/shared/Checkbox'
import { AuthTab } from '@/tools/api-client/components/AuthTab'
import { useRequestEditor } from '@/tools/api-client/hooks/useRequestEditor'
import { BODY_MODES, BODY_METHODS } from '@/tools/api-client/request-model'
import { FORMDATA_MODE, isFormMode } from '@/tools/api-client/form-body'
import { formatBytes } from '@/lib/format'
import {
  CodeIcon,
  LinkIcon,
  ListBulletsIcon,
  PaperclipIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react'

type RequestPanelProps = {
  editor: ReturnType<typeof useRequestEditor>
  requestTab: string
  setRequestTab: Dispatch<SetStateAction<string>>
  monacoTheme: string
  monacoOptions: NonNullable<EditorProps['options']>
}

export function RequestPanel({
  editor,
  requestTab,
  setRequestTab,
  monacoTheme,
  monacoOptions,
}: RequestPanelProps) {
  const {
    method,
    body,
    bodyMode,
    headers,
    auth,
    updateDraft,
    params,
    addParam,
    updateParam,
    removeParam,
    formFields,
    handleBodyModeChange,
    addFormField,
    updateFormField,
    removeFormField,
    attachFile,
    addHeader,
    updateHeader,
    removeHeader,
  } = editor
  const showBody = BODY_METHODS.has(method) && bodyMode !== 'none'
  const showFormEditor = showBody && isFormMode(bodyMode)
  const bodyEditorLang = bodyMode === 'json' ? 'json' : 'plaintext'
  const activeHeaderCount = headers.filter((h) => h.enabled && h.key.trim()).length

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const requestTabs = useMemo(
    () => [
      { id: 'params', label: params.length > 0 ? `Params (${params.length})` : 'Params' },
      {
        id: 'headers',
        label: activeHeaderCount > 0 ? `Headers (${activeHeaderCount})` : 'Headers',
      },
      { id: 'auth', label: auth.type === 'none' ? 'Auth' : 'Auth (set)' },
      { id: 'body', label: 'Body' },
    ],
    [activeHeaderCount, auth.type, params.length]
  )

  return (
    // ── Request panel ───────────────────────────────────
    <section aria-label="Request" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <TabBar tabs={requestTabs} activeTab={requestTab} onTabChange={setRequestTab} />

      {/* Params tab */}
      {requestTab === 'params' && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs text-[var(--color-text-muted)]">Query Parameters</h3>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={addParam}
              className="gap-1"
            >
              <PlusIcon size={12} aria-hidden="true" />
              Add
            </Button>
          </div>
          {params.length > 0 ? (
            <div className="flex flex-col gap-1">
              {params.map((p, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    value={p.key}
                    onChange={(e) => updateParam(i, { key: e.target.value })}
                    placeholder="Key"
                    aria-label={`Query parameter ${i + 1} name`}
                    className="w-1/3 min-w-0 font-mono"
                  />
                  <Input
                    value={p.value}
                    onChange={(e) => updateParam(i, { value: e.target.value })}
                    placeholder="Value"
                    aria-label={`Query parameter ${i + 1} value`}
                    className="min-w-0 flex-1 font-mono"
                  />
                  <Button
                    type="button"
                    variant="icon"
                    size="xs"
                    onClick={() => removeParam(i)}
                    aria-label={`Remove query parameter ${p.key || i + 1}`}
                    className="hover:text-[var(--color-error)]"
                  >
                    <XIcon size={14} aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={LinkIcon}
              size="sm"
              title="No query parameters"
              description="Add them here, or type them straight into the URL."
            />
          )}
        </div>
      )}

      {/* Headers tab */}
      {requestTab === 'headers' && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs text-[var(--color-text-muted)]">
              Headers
              {activeHeaderCount > 0 && (
                <span className="ml-1 text-[var(--color-text)]">({activeHeaderCount})</span>
              )}
            </h3>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={addHeader}
              className="gap-1"
            >
              <PlusIcon size={12} aria-hidden="true" />
              Add
            </Button>
          </div>
          {headers.length > 0 ? (
            <div className="flex flex-col gap-1">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Checkbox
                    checked={h.enabled}
                    onChange={(e) => updateHeader(i, { enabled: e.target.checked })}
                    aria-label={`Send header ${h.key || i + 1}`}
                  />
                  <Input
                    value={h.key}
                    onChange={(e) => updateHeader(i, { key: e.target.value })}
                    placeholder="Header name"
                    aria-label={`Header ${i + 1} name`}
                    className="w-1/3 min-w-0 font-mono"
                  />
                  <Input
                    value={h.value}
                    onChange={(e) => updateHeader(i, { value: e.target.value })}
                    placeholder="Value (or {{env_var}})"
                    aria-label={`Header ${i + 1} value`}
                    className="min-w-0 flex-1 font-mono"
                  />
                  <Button
                    type="button"
                    variant="icon"
                    size="xs"
                    onClick={() => removeHeader(i)}
                    aria-label={`Remove header ${h.key || i + 1}`}
                    className="hover:text-[var(--color-error)]"
                  >
                    <XIcon size={14} aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ListBulletsIcon}
              size="sm"
              title="No headers"
              description="Add Accept, Authorization, or any custom header."
            />
          )}
        </div>
      )}

      {/* Auth tab */}
      {requestTab === 'auth' && <AuthTab auth={auth} onChange={(a) => updateDraft({ auth: a })} />}

      {/* Body tab */}
      {requestTab === 'body' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Toolbar className="gap-1" aria-label="Request body format">
            {BODY_MODES.map((mode) => (
              <Button
                key={mode.id}
                type="button"
                variant="ghost"
                size="xs"
                aria-pressed={bodyMode === mode.id}
                onClick={() => handleBodyModeChange(mode.id)}
                className={
                  bodyMode === mode.id
                    ? 'bg-[var(--color-accent-dim)] font-bold text-[var(--color-accent)]'
                    : ''
                }
              >
                {mode.label}
              </Button>
            ))}
            {!BODY_METHODS.has(method) && (
              <span className="ml-2 text-2xs text-[var(--color-text-muted)]">
                Body not available for {method}
              </span>
            )}
          </Toolbar>
          {showFormEditor ? (
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs text-[var(--color-text-muted)]">
                  {bodyMode === FORMDATA_MODE ? 'Multipart fields' : 'Form fields'}
                </h3>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={addFormField}
                  className="gap-1"
                >
                  <PlusIcon size={12} aria-hidden="true" />
                  Add
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                {formFields.map((f, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input
                      value={f.key}
                      onChange={(e) => updateFormField(i, { key: e.target.value })}
                      placeholder="Field name"
                      aria-label={`Field ${i + 1} name`}
                      className="w-1/3 min-w-0 font-mono"
                    />
                    {f.file ? (
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--color-text-muted)]">
                        {f.file.name} · {formatBytes(f.file.size)}
                      </span>
                    ) : (
                      <Input
                        value={f.value}
                        onChange={(e) => updateFormField(i, { value: e.target.value })}
                        placeholder="Value (or {{env_var}})"
                        aria-label={`Field ${i + 1} value`}
                        className="min-w-0 flex-1 font-mono"
                      />
                    )}
                    {bodyMode === FORMDATA_MODE && (
                      // Only multipart can carry a file; urlencoded has no way to express
                      // one, so offering the control there would be a lie.
                      <label
                        className="cursor-pointer p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                        title={f.file ? 'Replace file' : 'Attach file'}
                      >
                        <PaperclipIcon size={14} aria-hidden />
                        <span className="sr-only">
                          {f.file ? 'Replace file' : 'Attach file'} for field {f.key || i + 1}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => attachFile(i, e.target.files?.[0] ?? null)}
                        />
                      </label>
                    )}
                    <Button
                      type="button"
                      variant="icon"
                      size="xs"
                      onClick={() => (f.file ? attachFile(i, null) : removeFormField(i))}
                      aria-label={
                        f.file
                          ? `Detach file from field ${f.key || i + 1}`
                          : `Remove field ${f.key || i + 1}`
                      }
                      className="hover:text-[var(--color-error)]"
                    >
                      <XIcon size={14} aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
              {bodyMode === FORMDATA_MODE && (
                <p className="mt-3 text-2xs text-[var(--color-text-muted)]">
                  Attached files are not saved with the request — a file handle cannot outlive the
                  session, so re-attach after reopening.
                </p>
              )}
            </div>
          ) : showBody ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <Editor
                theme={monacoTheme}
                language={bodyEditorLang}
                value={body}
                onChange={(v) => updateDraft({ body: v ?? '' })}
                options={monacoOptions}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EmptyState
                icon={CodeIcon}
                size="sm"
                title={bodyMode === 'none' ? 'Body is disabled' : `No body for ${method}`}
                description={
                  bodyMode === 'none'
                    ? 'Pick JSON, Text, or a form mode above to send a request body.'
                    : `${method} requests do not include a body.`
                }
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
