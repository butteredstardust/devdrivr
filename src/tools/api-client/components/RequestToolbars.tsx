import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'
import { InlineInput } from '@/components/shared/InlineInput'
import { Toolbar, ToolbarGroup, TwoLineDocumentIdentity } from '@/components/shared/Toolbar'
import { sendToTool } from '@/lib/tool-handoff'
import { httpMethodTextClass } from '@/lib/http-method'
import { formatShortcut } from '@/lib/shortcut-label'
import {
  DEFAULT_REQUEST_NAME,
  DEFAULT_TIMEOUT_MS,
  METHODS,
  type ApiClientState,
  type RequestDraft,
} from '@/tools/api-client/request-model'
import type { ApiEnvironment } from '@/types/models'
import {
  FilePlusIcon,
  FloppyDiskBackIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  GearSixIcon,
  PaperPlaneTiltIcon,
  SidebarIcon,
  StopIcon,
  TerminalIcon,
} from '@phosphor-icons/react'

type RequestToolbarsProps = {
  state: ApiClientState
  updateState: (patch: Partial<ApiClientState>) => void
  updateDraft: (patch: Partial<RequestDraft>) => void
  environments: ApiEnvironment[]
  activeEnvironmentId: string | null
  setActiveEnvironmentId: (id: string | null) => void
  name: string
  method: string
  url: string
  statusLine: string
  dirty: boolean
  saving: boolean
  loading: boolean
  libraryVisible: boolean
  responseVisible: boolean
  responsePaneId: string
  toggleLibrary: () => void
  toggleResponsePane: () => void
  handleNewRequest: () => void
  handleSave: () => Promise<void>
  handleSaveAs: () => void
  handleMethodChange: (method: string) => void
  handleSend: (sendAnyway?: boolean) => Promise<void>
  handleCancelRequest: () => void
  handleCopyAsCurl: () => void
  openImportModal: () => void
  openEnvironmentModal: () => void
}

export function RequestToolbars({
  state,
  updateState,
  updateDraft,
  environments,
  activeEnvironmentId,
  setActiveEnvironmentId,
  name,
  method,
  url,
  statusLine,
  dirty,
  saving,
  loading,
  libraryVisible,
  responseVisible,
  responsePaneId,
  toggleLibrary,
  toggleResponsePane,
  handleNewRequest,
  handleSave,
  handleSaveAs,
  handleMethodChange,
  handleSend,
  handleCancelRequest,
  handleCopyAsCurl,
  openImportModal,
  openEnvironmentModal,
}: RequestToolbarsProps) {
  return (
    <>
      {/* Request identity + save actions */}
      <Toolbar aria-label="Request identity and save actions">
        <Button
          type="button"
          variant="icon"
          size="sm"
          onClick={toggleLibrary}
          aria-expanded={libraryVisible}
          aria-label={libraryVisible ? 'Hide request library' : 'Show request library'}
          title={libraryVisible ? 'Hide request library' : 'Show request library'}
          className={
            libraryVisible ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'
          }
        >
          <SidebarIcon size={16} aria-hidden="true" />
        </Button>

        <TwoLineDocumentIdentity
          className="basis-40"
          title={
            <InlineInput
              value={name}
              onChange={(e) => updateDraft({ name: e.target.value })}
              placeholder={DEFAULT_REQUEST_NAME}
              aria-label="Request name"
              className="w-full"
            />
          }
          status={statusLine}
          statusTitle={statusLine}
          statusLive
          statusClassName={dirty ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]'}
        />

        {state.backlinkNoteId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              sendToTool('notes', {
                selectedId: state.backlinkNoteId,
                selectedFolderId: null,
                taskView: 'notes',
              })
            }
          >
            Back to note
          </Button>
        )}

        <Button
          type="button"
          variant="icon"
          size="sm"
          onClick={handleNewRequest}
          title="New request"
          aria-label="New request"
        >
          <FilePlusIcon size={16} aria-hidden="true" />
        </Button>

        <Button
          type="button"
          variant="icon"
          size="sm"
          onClick={openImportModal}
          title="Open or import an API specification"
          aria-label="Open API specification"
        >
          <FolderOpenIcon size={16} aria-hidden="true" />
        </Button>

        <ToolbarGroup label="Request file actions" separated>
          <Button
            type="button"
            variant={dirty ? 'primary' : 'secondary'}
            size="sm"
            loading={saving}
            disabled={!dirty && !!state.activeRequestId}
            onClick={() => void handleSave()}
            title="Save request"
            className="gap-1"
          >
            <FloppyDiskIcon size={14} aria-hidden="true" />
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleSaveAs}
            title="Save request as a new library entry"
            className="gap-1"
          >
            <FloppyDiskBackIcon size={14} aria-hidden="true" />
            Save As
          </Button>
        </ToolbarGroup>

        <ToolbarGroup label="Environment" separated>
          <Select
            value={activeEnvironmentId || ''}
            onChange={(e) => setActiveEnvironmentId(e.target.value || null)}
            aria-label="Active environment"
            title="Active environment"
            className="max-w-36"
          >
            <option value="">No Environment</option>
            {environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={openEnvironmentModal}
            title="Manage environments"
            aria-label="Manage environments"
          >
            <GearSixIcon size={16} aria-hidden="true" />
          </Button>
        </ToolbarGroup>
      </Toolbar>

      {/* URL bar */}
      <Toolbar aria-label="Request URL and send">
        <Select
          value={method}
          onChange={(e) => handleMethodChange(e.target.value)}
          aria-label="HTTP method"
          className={`font-mono font-bold ${httpMethodTextClass(method)}`}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Input
          value={url}
          onChange={(e) => updateDraft({ url: e.target.value })}
          placeholder="{{baseUrl}}/endpoint"
          aria-label="Request URL"
          size="md"
          className="min-w-24 flex-1 basis-48 font-mono"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSend()
          }}
        />
        {/* Method, URL and Send have to stay reachable at any width, so the timeout is
            among what the row sheds as it narrows — after the trailing actions below. */}
        <ToolbarGroup label="Timeout">
          <Select
            aria-label="Request timeout"
            value={state.timeoutMs || DEFAULT_TIMEOUT_MS}
            onChange={(event) => updateState({ timeoutMs: Number(event.target.value) })}
            title="Request timeout"
          >
            <option value={5000}>5s</option>
            <option value={15000}>15s</option>
            <option value={30000}>30s</option>
            <option value={60000}>60s</option>
          </Select>
        </ToolbarGroup>
        {loading ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCancelRequest}
            className="gap-1.5"
          >
            <StopIcon size={14} aria-hidden="true" />
            Cancel
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleSend()}
            className="gap-1.5"
            title={`Send request (${formatShortcut('mod+enter')})`}
          >
            <PaperPlaneTiltIcon size={14} aria-hidden="true" />
            Send
          </Button>
        )}
        {/* Grouped so the row can shed them. As bare children they were unshrinkable and
            uncollapsible: below roughly 900px of workspace they simply ran off the right
            edge of the toolbar, since `planCollapse` can only fold whole groups. Last in
            the row means first into the overflow menu, which is the right order — method,
            URL and Send are the row, these two are conveniences. */}
        <ToolbarGroup label="Request actions">
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={handleCopyAsCurl}
            aria-label="Copy request as cURL"
            title="Copy request as cURL"
          >
            <TerminalIcon size={14} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleResponsePane}
            aria-expanded={responseVisible}
            // The response pane only exists while visible, so naming it when hidden points
            // at nothing. `aria-expanded` alone carries the collapsed state.
            {...(responseVisible ? { 'aria-controls': responsePaneId } : {})}
          >
            {responseVisible ? 'Hide Response' : 'Show Response'}
          </Button>
        </ToolbarGroup>
      </Toolbar>
    </>
  )
}
