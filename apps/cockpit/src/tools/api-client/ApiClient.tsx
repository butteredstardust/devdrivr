import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { useToolState } from '@/hooks/useToolState'
import { useMonaco } from '@/hooks/useMonaco'
import { useMonacoSelectionToolbar } from '@/hooks/useMonacoSelectionToolbar'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'
import { InlineInput } from '@/components/shared/InlineInput'
import { EmptyState } from '@/components/shared/EmptyState'
import { Spinner } from '@/components/shared/Spinner'
import { SelectionContextToolbar } from '@/components/shared/SelectionContextToolbar'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { Toolbar, ToolbarGroup, ToolbarSpacer } from '@/components/shared/Toolbar'
import { SplitPane } from '@/components/shared/SplitPane'
import { Alert } from '@/components/shared/Alert'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Checkbox } from '@/components/shared/Checkbox'
import { useUiStore } from '@/stores/ui.store'
import { sendToTool } from '@/lib/tool-handoff'
import { useToolAction } from '@/hooks/useToolAction'
import { useApiStore } from '@/stores/api.store'
import { buildExportFilename, exportFile } from '@/lib/file-io'
import { EnvironmentModal } from './components/EnvironmentModal'
import { AuthTab } from './components/AuthTab'
import { CollectionsSidebar } from './components/CollectionsSidebar'
import { httpMethodTextClass } from '@/lib/http-method'
import { ConfirmDialog } from './components/ConfirmDialog'
import { SaveRequestModal } from './components/SaveRequestModal'
import { ImportSpecModal } from './components/ImportSpecModal'
import { importApiSpec } from '@/lib/api-import'
import {
  blankFormRows,
  buildMultipartBody,
  contentTypeFor,
  isBoilerplateContentType,
  FORMDATA_MODE,
  isFormMode,
  parseFormBody,
  serializeFormBody,
  toCurl,
  type FormField,
} from '@/tools/api-client/form-body'
import type { ApiImportResult, ApiRequest, ApiHeader, HistoryEntry } from '@/types/models'
import {
  BracketsCurlyIcon,
  CodeIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FilePlusIcon,
  FloppyDiskBackIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  GearSixIcon,
  LinkIcon,
  ListBulletsIcon,
  PaperclipIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SidebarIcon,
  TerminalIcon,
  StopIcon,
  XIcon,
} from '@phosphor-icons/react'
import {
  METHODS,
  BODY_METHODS,
  DEFAULT_REQUEST_NAME,
  DEFAULT_TIMEOUT_MS,
  MAX_DISPLAY_BYTES,
  MAX_RESPONSE_BYTES,
  MAX_HISTORY_RESPONSE_CHARS,
  removeIndexedFile,
  RESPONSE_TABS,
  BODY_MODES,
  parseQueryParams,
  buildUrlWithParams,
  detectResponseLanguage,
  interpolate,
  unresolvedVariableNames,
  responseMime,
  isTextResponse,
  base64EncodeUtf8,
  createDefaultDraft,
  isDraftDirty,
  applyMethodDefaults,
  type Param,
  type RequestDraft,
  type ApiClientState,
  type ResponseData,
  type CollectionRun,
  type EditorInstance,
  type PendingNavigation,
} from '@/tools/api-client/request-model'
import { formatBytes } from '@/lib/format'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useTabDirty } from '@/hooks/useTabDirty'
import { formatShortcut } from '@/lib/shortcut-label'

/**
 * Request beside response when both are up, request alone when the response pane is hidden.
 *
 * A local wrapper rather than a conditional at the call site: the two panels are ~300 lines of
 * JSX, and lifting them into consts purely to choose a container is a lot of churn for one
 * branch. `false` is the shape `{cond && <section/>}` actually produces.
 */
function RequestResponseLayout({ children }: { children: [ReactNode, ReactNode | false] }) {
  const [request, response] = children
  if (!response) return <div className="flex min-h-0 flex-1">{request}</div>
  return (
    <SplitPane storageKey="api-client" stackBelow={1000} aria-label="Resize request and response">
      {request}
      {response}
    </SplitPane>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApiClient() {
  const responsePaneId = useId()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const init = useApiStore((s) => s.init)
  const environments = useApiStore((s) => s.environments)
  const activeEnvironmentId = useApiStore((s) => s.activeEnvironmentId)
  const setActiveEnvironmentId = useApiStore((s) => s.setActiveEnvironmentId)
  const collections = useApiStore((s) => s.collections)
  const requests = useApiStore((s) => s.requests)
  const createRequest = useApiStore((s) => s.createRequest)
  const createCollection = useApiStore((s) => s.createCollection)
  const updateRequest = useApiStore((s) => s.updateRequest)
  const importApiData = useApiStore((s) => s.importApiData)
  const addRequestHistory = useApiStore((s) => s.addRequestHistory)
  const [apiInitialized, setApiInitialized] = useState(false)
  useEffect(() => {
    let cancelled = false
    void init().then(() => {
      if (!cancelled) setApiInitialized(true)
    })
    return () => {
      cancelled = true
    }
  }, [init])

  const [state, updateState] = useToolState<ApiClientState>('api-client', {
    activeRequestId: null,
    libraryOpen: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    draft: createDefaultDraft(),
  })

  // Destructure draft for convenience
  const { method, url, headers, body, bodyMode, auth, name } = state.draft

  const updateDraft = useCallback(
    (patch: Partial<RequestDraft>) => {
      updateState({ draft: { ...state.draft, ...patch } })
    },
    [state.draft, updateState]
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [responseEditor, setResponseEditor] = useState<EditorInstance | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestTab, setRequestTab] = useState('params')
  const [responseTab, setResponseTab] = useState('body')
  const [showEnvModal, setShowEnvModal] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [saveMode, setSaveMode] = useState<'save' | 'save-as'>('save-as')
  const [responseCollapsed, setResponseCollapsed] = useState(true)
  const [responsePaneUserToggled, setResponsePaneUserToggled] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null)
  const [unresolvedVariables, setUnresolvedVariables] = useState<string[]>([])
  const requestControllerRef = useRef<AbortController | null>(null)
  const timedOutRef = useRef(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [collectionRun, setCollectionRun] = useState<CollectionRun | null>(null)
  const collectionRunAbortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      requestControllerRef.current?.abort()
      collectionRunAbortRef.current?.abort()
    },
    []
  )

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const envVars = useMemo(() => activeEnv?.variables ?? {}, [activeEnv])
  const responseVisible = !responseCollapsed

  const savedRequest = useMemo(
    () => requests.find((r) => r.id === state.activeRequestId),
    [requests, state.activeRequestId]
  )
  const dirty = useMemo(() => isDraftDirty(state.draft, savedRequest), [state.draft, savedRequest])
  useTabDirty(dirty)
  // Read inside stable callbacks so the discard guard never needs `dirty` as a dep.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  const activeCollectionName = useMemo(() => {
    if (!savedRequest?.collectionId) return null
    return collections.find((c) => c.id === savedRequest.collectionId)?.name ?? null
  }, [collections, savedRequest])

  // ---------------------------------------------------------------------------
  // Query params
  // ---------------------------------------------------------------------------

  const [params, setParams] = useState<Param[]>(() => parseQueryParams(url))
  const urlRef = useRef(url)
  const responseSelectionToolbar = useMonacoSelectionToolbar(
    responseEditor,
    responseTab === 'body' && response != null,
    response?.body ?? ''
  )

  useEffect(() => {
    if (url !== urlRef.current) {
      urlRef.current = url
      setParams(parseQueryParams(url))
    }
  }, [url])

  useEffect(() => {
    if (!responsePaneUserToggled && (loading || response || error)) setResponseCollapsed(false)
  }, [loading, response, error, responsePaneUserToggled])

  const toggleResponsePane = useCallback(() => {
    setResponsePaneUserToggled(true)
    setResponseCollapsed((collapsed) => !collapsed)
  }, [])

  const handleResponseEditorMount: OnMount = useCallback((editor) => {
    setResponseEditor(editor)
  }, [])

  const copyResponseSelection = useCallback(
    async (text: string) => {
      await copy(text, {
        success: 'Response selection copied to clipboard',
        failure: 'Failed to copy response selection',
      })
    },
    [copy]
  )

  const sendResponseSelectionToJsonTools = useCallback(
    (text: string) => {
      // `view`, not `activeTab` — JSON Tools has no such field, so the old key
      // switched nothing and was persisted as junk into its row.
      sendToTool('json-tools', { input: text, view: 'source', query: '' })
      setLastAction('Sent response selection to JSON Tools', 'success')
    },
    [setLastAction]
  )

  const responseSelectionActions = useMemo(
    () => [
      {
        id: 'copy',
        label: 'Copy selection',
        icon: <CopyIcon size={14} />,
        onSelect: copyResponseSelection,
      },
      {
        id: 'json-tools',
        label: 'Send to JSON Tools',
        icon: <BracketsCurlyIcon size={14} />,
        onSelect: sendResponseSelectionToJsonTools,
      },
    ],
    [copyResponseSelection, sendResponseSelectionToJsonTools]
  )

  const commitParams = useCallback(
    (newParams: Param[]) => {
      setParams(newParams)
      const newUrl = buildUrlWithParams(
        url,
        newParams.filter((p) => p.key.trim())
      )
      urlRef.current = newUrl
      updateDraft({ url: newUrl })
    },
    [url, updateDraft]
  )

  const addParam = useCallback(() => {
    commitParams([...params, { key: '', value: '' }])
  }, [params, commitParams])

  const updateParam = useCallback(
    (index: number, patch: Partial<Param>) => {
      const updated = params.map((p, i) => (i === index ? { ...p, ...patch } : p))
      commitParams(updated)
    },
    [params, commitParams]
  )

  const removeParam = useCallback(
    (index: number) => {
      commitParams(params.filter((_, i) => i !== index))
    },
    [params, commitParams]
  )

  // ---------------------------------------------------------------------------
  // Form bodies
  // ---------------------------------------------------------------------------

  /**
   * Attached files, keyed by row index.
   *
   * Component state rather than draft state on purpose: a `File` is a live handle to something on
   * disk and cannot be serialised into a saved request. Row indexes preserve valid repeated field
   * names and let a user name a row after selecting its file.
   */
  const [formFiles, setFormFiles] = useState<Record<number, File>>({})

  /**
   * Rows the user has started but not named yet.
   *
   * The body string is the single source of truth for the payload, and it cannot represent a pair
   * with no key — so "Add" appeared to do nothing: the new row was serialised away the instant it
   * was created. Blank rows live here instead, and graduate into the body as soon as they get a
   * name.
   */
  const [blankRows, setBlankRows] = useState(0)

  const clearTransientFormState = useCallback(() => {
    setFormFiles({})
    setBlankRows(0)
  }, [])

  const formFields = useMemo<FormField[]>(() => {
    const parsed = parseFormBody(body).map((f, index) => {
      const file = formFiles[index]
      return file ? { ...f, file } : f
    })
    // One empty row always shows, so a fresh form has somewhere to type without pressing Add first.
    const blanks = Math.max(blankRows, parsed.length === 0 ? 1 : 0)
    const blankFields = Array.from({ length: blanks }, (_, offset) => {
      const field: FormField = { key: '', value: '', enabled: true }
      const file = formFiles[parsed.length + offset]
      return file ? { ...field, file } : field
    })
    return [...parsed, ...blankFields]
  }, [body, formFiles, blankRows])

  const commitFormFields = useCallback(
    (fields: FormField[]) => {
      setBlankRows(blankFormRows(fields))
      updateDraft({ body: serializeFormBody(fields) })
    },
    [updateDraft]
  )

  /**
   * Change body mode, keeping the `Content-Type` header honest.
   *
   * A POST is created with `Content-Type: application/json`, so switching to a form mode without
   * this left the request declaring JSON while sending `a=1&b=2`. Only the app's own boilerplate
   * values are rewritten; a hand-typed content type is the user's decision and survives.
   */
  const handleBodyModeChange = useCallback(
    (nextMode: string) => {
      if (bodyMode === FORMDATA_MODE && nextMode !== FORMDATA_MODE) clearTransientFormState()
      const implied = contentTypeFor(nextMode)
      const nextHeaders = headers.flatMap((h) => {
        if (h.key.toLowerCase() !== 'content-type' || !isBoilerplateContentType(h.value)) return [h]
        // Multipart's header is generated at send time with the boundary, so the row goes away.
        if (nextMode === FORMDATA_MODE) return []
        return implied ? [{ ...h, value: implied }] : [h]
      })
      updateDraft({ bodyMode: nextMode, headers: nextHeaders })
    },
    [bodyMode, clearTransientFormState, headers, updateDraft]
  )

  const addFormField = useCallback(() => {
    commitFormFields([...formFields, { key: '', value: '', enabled: true }])
  }, [formFields, commitFormFields])

  const updateFormField = useCallback(
    (index: number, patch: Partial<FormField>) => {
      // An unnamed row is removed by serialization. Shift transient files in lockstep so a file
      // can never slide onto the following row merely because its preceding key was cleared.
      if (patch.key !== undefined && !patch.key.trim()) {
        setFormFiles((prev) => removeIndexedFile(prev, index))
      }
      commitFormFields(formFields.map((f, i) => (i === index ? { ...f, ...patch } : f)))
    },
    [formFields, commitFormFields]
  )

  const removeFormField = useCallback(
    (index: number) => {
      setFormFiles((prev) => removeIndexedFile(prev, index))
      commitFormFields(formFields.filter((_, i) => i !== index))
    },
    [formFields, commitFormFields]
  )

  const attachFile = useCallback(
    (index: number, file: File | null) => {
      const field = formFields[index]
      if (!field) return
      setFormFiles((prev) => {
        const next = { ...prev }
        if (file) next[index] = file
        else delete next[index]
        return next
      })
      // The filename lands in the stored value so a saved request still says *what* was attached,
      // even though the bytes are gone.
      updateFormField(index, { value: file ? file.name : '' })
    },
    [formFields, updateFormField]
  )

  // ---------------------------------------------------------------------------
  // Send request
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(
    async (sendAnyway = false) => {
      const variableInputs = [
        url,
        ...headers
          .filter((header) => header.enabled)
          .flatMap((header) => [header.key, header.value]),
        ...(auth.type === 'bearer'
          ? [auth.token]
          : auth.type === 'basic'
            ? [auth.username, auth.password]
            : []),
        ...(BODY_METHODS.has(method) && bodyMode !== 'none'
          ? bodyMode === FORMDATA_MODE
            ? formFields.flatMap((field) => [field.key, field.value])
            : [body]
          : []),
      ]
      const missingVariables = unresolvedVariableNames(variableInputs, envVars)
      if (!sendAnyway && missingVariables.length > 0) {
        setUnresolvedVariables(missingVariables)
        setLastAction('Resolve request variables or choose Send anyway', 'error')
        return
      }
      setUnresolvedVariables([])
      const interpolatedUrl = interpolate(url, envVars)
      if (!interpolatedUrl.trim()) {
        setLastAction('Enter a URL (or ensure {{variable}} is populated)', 'error')
        return
      }

      setLoading(true)
      setError(null)
      setResponse(null)
      const start = performance.now()
      const controller = new AbortController()
      requestControllerRef.current?.abort()
      requestControllerRef.current = controller
      timedOutRef.current = false
      const timeout = window.setTimeout(
        () => {
          timedOutRef.current = true
          controller.abort()
        },
        Math.max(1_000, state.timeoutMs || DEFAULT_TIMEOUT_MS)
      )

      try {
        const fetchHeaders: Record<string, string> = {}

        // Interpolate user headers
        for (const h of headers) {
          if (h.enabled && h.key.trim()) {
            fetchHeaders[interpolate(h.key, envVars)] = interpolate(h.value, envVars)
          }
        }

        // Add auth headers
        if (auth.type === 'bearer') {
          const token = interpolate(auth.token, envVars)
          fetchHeaders['Authorization'] = `Bearer ${token}`
        } else if (auth.type === 'basic') {
          const u = interpolate(auth.username, envVars)
          const p = interpolate(auth.password, envVars)
          fetchHeaders['Authorization'] = `Basic ${base64EncodeUtf8(`${u}:${p}`)}`
        }

        const opts: RequestInit = { method, headers: fetchHeaders, signal: controller.signal }

        // Header casing is the user's, so the check for an existing Content-Type has to be
        // case-insensitive — otherwise a hand-typed `content-type` would be silently duplicated.
        const hasContentType = Object.keys(fetchHeaders).some(
          (k) => k.toLowerCase() === 'content-type'
        )

        if (BODY_METHODS.has(method) && bodyMode === FORMDATA_MODE) {
          const { body: multipart, contentType } = await buildMultipartBody(
            formFields.map((f) => ({ ...f, value: interpolate(f.value, envVars) }))
          )
          // Always overwrite: the boundary is generated per request, so any Content-Type the user
          // typed for a multipart body is guaranteed to be the wrong one.
          for (const key of Object.keys(fetchHeaders)) {
            if (key.toLowerCase() === 'content-type') delete fetchHeaders[key]
          }
          fetchHeaders['Content-Type'] = contentType
          opts.body = multipart
        } else if (BODY_METHODS.has(method) && bodyMode !== 'none' && body.trim()) {
          opts.body = interpolate(body, envVars)
          const implied = contentTypeFor(bodyMode)
          if (implied && !hasContentType) fetchHeaders['Content-Type'] = implied
        }

        const res = await tauriFetch(interpolatedUrl, opts)
        const time = Math.round(performance.now() - start)

        // Refuse before reading when the server declares an oversized body — reading first and
        // capping afterwards is exactly the allocation this limit exists to avoid.
        const declaredLength = Number(res.headers.get('content-length') ?? Number.NaN)
        if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
          throw new Error(
            `Response is ${formatBytes(declaredLength)}, above the ${formatBytes(MAX_RESPONSE_BYTES)} limit. Use a direct download instead.`
          )
        }

        const fullBytes = new Uint8Array(await res.arrayBuffer())
        const size = fullBytes.byteLength
        const overLimit = size > MAX_RESPONSE_BYTES
        // A server that under-declared or omitted Content-Length still lands here; keep only the
        // retained prefix so one bad response cannot pin gigabytes for the rest of the session.
        const responseBytes = overLimit ? fullBytes.slice(0, MAX_RESPONSE_BYTES) : fullBytes

        const resHeaders: Record<string, string> = {}
        res.headers.forEach((value, key) => {
          resHeaders[key] = value
        })
        const mimeType = responseMime(resHeaders)
        const isBinary = !isTextResponse(mimeType)
        const displayTruncated = overLimit || (!isBinary && size > MAX_DISPLAY_BYTES)
        const displayBytes = displayTruncated
          ? responseBytes.slice(0, MAX_DISPLAY_BYTES)
          : responseBytes
        const resBody = isBinary ? '' : new TextDecoder().decode(displayBytes)
        const blob = new Blob([responseBytes], { type: mimeType })

        setResponse({
          status: res.status,
          statusText: res.statusText,
          headers: resHeaders,
          body: resBody,
          blob,
          mimeType,
          isBinary,
          displayTruncated,
          time,
          size,
        })
        setLastAction(`${res.status} ${res.statusText} (${time}ms)`, res.ok ? 'success' : 'error')

        // Log to history. exactOptionalPropertyTypes requires omitted optional
        // fields rather than an explicit `undefined` value.
        const historyEntry = {
          subTab: method,
          input: `${method} ${interpolatedUrl}`,
          output: `${res.status} ${res.statusText} · ${time}ms · ${formatBytes(size)}`,
          ...(isTextResponse(mimeType)
            ? { responseBody: resBody.slice(0, MAX_HISTORY_RESPONSE_CHARS) }
            : {}),
          responseMimeType: mimeType,
          responseStatus: res.status,
          responseStatusText: res.statusText,
        }
        // Persistence is independent of request success: a locked or full database must not
        // become an unhandled rejection, and the user should know the request was not recorded.
        void addRequestHistory(historyEntry).catch(() => {
          setLastAction('Request sent, but history could not be saved', 'error')
        })
      } catch (e) {
        if (requestControllerRef.current !== controller) return
        const msg = controller.signal.aborted
          ? timedOutRef.current
            ? `Request timed out after ${Math.round((state.timeoutMs || DEFAULT_TIMEOUT_MS) / 1000)} seconds`
            : 'Request cancelled'
          : (e as Error).message
        setResponse(null)
        setError(msg)
        setLastAction('Request failed', 'error')
      } finally {
        window.clearTimeout(timeout)
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null
          setLoading(false)
        }
      }
    },
    [
      url,
      method,
      headers,
      body,
      bodyMode,
      formFields,
      auth,
      envVars,
      setLastAction,
      addRequestHistory,
      state.timeoutMs,
    ]
  )

  const handleCancelRequest = useCallback(() => {
    timedOutRef.current = false
    requestControllerRef.current?.abort()
  }, [])

  const runCollection = useCallback(
    async (collection: { id: string }) => {
      collectionRunAbortRef.current?.abort()
      const controller = new AbortController()
      collectionRunAbortRef.current = controller
      const collectionRequests = requests.filter(
        (request) => request.collectionId === collection.id
      )
      setCollectionRun({ collectionId: collection.id, running: true, results: {} })
      const updateCurrentRun = (update: (current: CollectionRun) => CollectionRun) => {
        setCollectionRun((current) =>
          collectionRunAbortRef.current === controller && current?.collectionId === collection.id
            ? update(current)
            : current
        )
      }

      for (const request of collectionRequests) {
        if (controller.signal.aborted) break
        const variableValues = [
          request.url,
          request.body,
          ...request.headers.flatMap((header) => [header.key, header.value]),
          ...(request.auth.type === 'bearer'
            ? [request.auth.token]
            : request.auth.type === 'basic'
              ? [request.auth.username, request.auth.password]
              : []),
        ]
        const unresolved = unresolvedVariableNames(variableValues, envVars)
        if (unresolved.length > 0) {
          updateCurrentRun((current) => ({
            ...current,
            results: {
              ...current.results,
              [request.id]: {
                status: 'failed',
                detail: `Unresolved: ${unresolved.join(', ')}`.slice(0, 80),
              },
            },
          }))
          continue
        }
        updateCurrentRun((current) => ({
          ...current,
          results: {
            ...current.results,
            [request.id]: { status: 'running', detail: '…' },
          },
        }))
        const started = performance.now()
        const requestController = new AbortController()
        const abortRequest = () => requestController.abort()
        controller.signal.addEventListener('abort', abortRequest, { once: true })
        let timedOut = false
        const timeout = window.setTimeout(
          () => {
            timedOut = true
            requestController.abort()
          },
          Math.max(1_000, state.timeoutMs || DEFAULT_TIMEOUT_MS)
        )
        try {
          const requestHeaders: Record<string, string> = {}
          for (const header of request.headers) {
            if (header.enabled && header.key.trim()) {
              requestHeaders[interpolate(header.key, envVars)] = interpolate(header.value, envVars)
            }
          }
          if (request.auth.type === 'bearer') {
            requestHeaders.Authorization = `Bearer ${interpolate(request.auth.token, envVars)}`
          } else if (request.auth.type === 'basic') {
            requestHeaders.Authorization = `Basic ${base64EncodeUtf8(`${interpolate(request.auth.username, envVars)}:${interpolate(request.auth.password, envVars)}`)}`
          }
          const options: RequestInit = {
            method: request.method,
            headers: requestHeaders,
            signal: requestController.signal,
          }
          if (BODY_METHODS.has(request.method) && request.bodyMode === FORMDATA_MODE) {
            const multipart = await buildMultipartBody(
              parseFormBody(request.body).map((field) => ({
                ...field,
                value: interpolate(field.value, envVars),
              }))
            )
            for (const key of Object.keys(requestHeaders)) {
              if (key.toLowerCase() === 'content-type') delete requestHeaders[key]
            }
            requestHeaders['Content-Type'] = multipart.contentType
            options.body = multipart.body
          } else if (
            BODY_METHODS.has(request.method) &&
            request.bodyMode !== 'none' &&
            request.body
          ) {
            options.body = interpolate(request.body, envVars)
            const hasContentType = Object.keys(requestHeaders).some(
              (key) => key.toLowerCase() === 'content-type'
            )
            const implied = contentTypeFor(request.bodyMode)
            if (implied && !hasContentType) requestHeaders['Content-Type'] = implied
          }
          const result = await tauriFetch(interpolate(request.url, envVars), options)
          const elapsed = Math.round(performance.now() - started)
          updateCurrentRun((current) => ({
            ...current,
            results: {
              ...current.results,
              [request.id]: {
                status: result.ok ? 'passed' : 'failed',
                detail: `${result.status} · ${elapsed}ms`,
              },
            },
          }))
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          const detail = controller.signal.aborted
            ? 'Cancelled'
            : timedOut
              ? 'Timed out'
              : errorMessage
          updateCurrentRun((current) => ({
            ...current,
            results: {
              ...current.results,
              [request.id]: { status: 'failed', detail: detail.slice(0, 80) },
            },
          }))
          if (controller.signal.aborted) break
        } finally {
          window.clearTimeout(timeout)
          controller.signal.removeEventListener('abort', abortRequest)
        }
      }
      if (collectionRunAbortRef.current === controller) {
        collectionRunAbortRef.current = null
        setCollectionRun((current) => (current ? { ...current, running: false } : current))
      }
    },
    [envVars, requests, state.timeoutMs]
  )

  const cancelCollection = useCallback(() => {
    collectionRunAbortRef.current?.abort()
  }, [])

  /**
   * Copy the request as a runnable `curl` command — the inverse of the app's curl-to-fetch tool,
   * and the format every bug report and API doc asks for. Environment variables are interpolated so
   * the result runs as-is rather than pasting `{{token}}` into someone else's terminal.
   */
  const handleCopyAsCurl = useCallback(() => {
    const command = toCurl({
      method,
      url: interpolate(url, envVars),
      headers: headers.map((h) => ({
        ...h,
        key: interpolate(h.key, envVars),
        value: interpolate(h.value, envVars),
      })),
      body: BODY_METHODS.has(method) ? interpolate(body, envVars) : '',
      bodyMode: BODY_METHODS.has(method) ? bodyMode : 'none',
      formFields: formFields.map((f) => ({ ...f, value: interpolate(f.value, envVars) })),
    })
    void copy(command, {
      success: 'Request copied as cURL',
      failure: 'Failed to copy cURL command',
    })
  }, [method, url, headers, body, bodyMode, formFields, envVars, copy])

  // ---------------------------------------------------------------------------
  // Draft navigation — every path that replaces the draft goes through the guard
  // ---------------------------------------------------------------------------

  const guardUnsaved = useCallback((description: string, perform: () => void) => {
    if (dirtyRef.current) {
      setPendingNavigation({ description, perform })
      return
    }
    perform()
  }, [])

  const resetToNewRequest = useCallback(() => {
    clearTransientFormState()
    updateState({ activeRequestId: null, draft: createDefaultDraft() })
    setResponse(null)
    setError(null)
  }, [clearTransientFormState, updateState])

  const handleNewRequest = useCallback(() => {
    guardUnsaved('starting a new request', resetToNewRequest)
  }, [guardUnsaved, resetToNewRequest])

  const handleSelectLoadedRequest = useCallback(
    (req: ApiRequest) => {
      guardUnsaved(`opening “${req.name}”`, () => {
        clearTransientFormState()
        updateState({
          activeRequestId: req.id,
          draft: {
            name: req.name,
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body,
            bodyMode: req.bodyMode,
            auth: req.auth,
          },
        })
        setResponse(null)
        setError(null)
      })
    },
    [clearTransientFormState, guardUnsaved, updateState]
  )

  const handleLoadFromHistory = useCallback(
    (entry: HistoryEntry) => {
      const [histMethod, ...urlParts] = entry.input.split(' ')
      const histUrl = urlParts.join(' ')
      guardUnsaved('restoring a request from history', () => {
        clearTransientFormState()
        updateState({
          activeRequestId: null,
          draft: createDefaultDraft(histMethod ?? 'GET', { url: histUrl }),
        })
        if (entry.responseBody != null) {
          const mimeType = entry.responseMimeType ?? 'text/plain'
          setResponse({
            status: entry.responseStatus ?? 200,
            statusText: entry.responseStatusText ?? 'History snapshot',
            headers: { 'content-type': mimeType },
            body: entry.responseBody,
            blob: new Blob([entry.responseBody], { type: mimeType }),
            mimeType,
            isBinary: false,
            displayTruncated: entry.responseBody.length >= MAX_HISTORY_RESPONSE_CHARS,
            time: 0,
            size: new TextEncoder().encode(entry.responseBody).byteLength,
          })
          setResponseCollapsed(false)
        } else {
          setResponse(null)
          if (entry.responseMimeType && !isTextResponse(entry.responseMimeType)) {
            setError('Binary response bodies are not persisted in history; run the request again.')
            return
          }
        }
        setError(null)
      })
    },
    [clearTransientFormState, guardUnsaved, updateState]
  )

  // A saved request deleted elsewhere (or with its collection) must not leave a
  // phantom "saved" state behind — reset without prompting, there is nothing to
  // navigate back to.
  useEffect(() => {
    if (
      apiInitialized &&
      state.activeRequestId &&
      !requests.some((request) => request.id === state.activeRequestId)
    ) {
      resetToNewRequest()
    }
  }, [apiInitialized, resetToNewRequest, requests, state.activeRequestId])

  // ---------------------------------------------------------------------------
  // Save Request logic
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    // An already-saved request writes straight through — no dialog for every edit.
    if (state.activeRequestId && savedRequest) {
      setSaving(true)
      try {
        await updateRequest({
          ...savedRequest,
          ...state.draft,
          id: state.activeRequestId,
          collectionId: savedRequest.collectionId,
        })
        setLastAction('Request saved', 'success')
      } catch (e) {
        setLastAction(`Save failed — ${(e as Error).message}`, 'error')
      } finally {
        setSaving(false)
      }
      return
    }
    setSaveMode('save-as')
    setShowSaveModal(true)
  }, [savedRequest, setLastAction, state.activeRequestId, state.draft, updateRequest])

  const handleSaveAs = useCallback(() => {
    setSaveMode('save-as')
    setShowSaveModal(true)
  }, [])

  const handleSaveModalSubmit = useCallback(
    async (reqName: string, collectionIdOrNewName: string | null, isNew: boolean) => {
      setShowSaveModal(false)
      setSaving(true)

      try {
        let resolvedCollectionId: string | null = collectionIdOrNewName
        if (isNew && collectionIdOrNewName) {
          const newCol = await createCollection(collectionIdOrNewName)
          resolvedCollectionId = newCol.id
        }

        if (saveMode === 'save' && state.activeRequestId) {
          const existing = requests.find((r) => r.id === state.activeRequestId)
          await updateRequest({
            ...state.draft,
            id: state.activeRequestId,
            name: reqName,
            collectionId: resolvedCollectionId,
            createdAt: existing?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          })
          updateState({ draft: { ...state.draft, name: reqName } })
          setLastAction('Request updated', 'success')
        } else {
          const newReq = await createRequest({
            ...state.draft,
            name: reqName,
            collectionId: resolvedCollectionId,
          })
          updateState({ activeRequestId: newReq.id, draft: { ...state.draft, name: reqName } })
          setLastAction('Request saved', 'success')
        }
      } catch (e) {
        setLastAction(`Save failed — ${(e as Error).message}`, 'error')
      } finally {
        setSaving(false)
      }
    },
    [
      saveMode,
      state.activeRequestId,
      state.draft,
      requests,
      createCollection,
      createRequest,
      updateRequest,
      updateState,
      setLastAction,
    ]
  )

  const saveModalInitialCollectionId = useMemo(() => {
    if (!state.activeRequestId) return null
    return requests.find((r) => r.id === state.activeRequestId)?.collectionId ?? null
  }, [state.activeRequestId, requests])

  // ---------------------------------------------------------------------------
  // Import / Export
  // ---------------------------------------------------------------------------

  const handleImportData = useCallback(
    async (data: ApiImportResult) => {
      const result = await importApiData(data)
      setLastAction(
        `Imported ${result.requests} requests into ${result.collections} collections`,
        'success'
      )
    },
    [importApiData, setLastAction]
  )

  const handleImportContent = useCallback(
    async (content: string, filename: string) => {
      try {
        const parsed = importApiSpec({ content, filename })
        if (parsed.requests.length === 0) {
          setLastAction('Import found no executable HTTP requests', 'error')
          return
        }
        await handleImportData(parsed)
      } catch (err) {
        setLastAction((err as Error).message, 'error')
      }
    },
    [handleImportData, setLastAction]
  )

  const responseLanguage = useMemo(() => {
    if (!response) return 'json'
    return detectResponseLanguage(response.headers)
  }, [response])

  useEffect(() => {
    if (!response?.mimeType.startsWith('image/') || typeof URL.createObjectURL !== 'function') {
      setImagePreviewUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(response.blob)
    setImagePreviewUrl(objectUrl)
    return () => {
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl)
    }
  }, [response])

  const prettyBody = useMemo(() => {
    if (!response?.body) return ''
    if (responseLanguage === 'json' && !response.displayTruncated) {
      try {
        return JSON.stringify(JSON.parse(response.body), null, 2)
      } catch {
        return response.body
      }
    }
    return response.body
  }, [response, responseLanguage])

  const handleSaveResponse = useCallback(async () => {
    if (!response) {
      setLastAction('No response to save yet', 'error')
      return
    }
    const extension = response.mimeType.startsWith('image/')
      ? response.mimeType.split('/')[1] || 'bin'
      : responseLanguage === 'plaintext'
        ? response.isBinary
          ? 'bin'
          : 'txt'
        : responseLanguage
    const filename = buildExportFilename(name || 'response', extension)
    try {
      const path = await exportFile(response.blob, filename)
      if (path) setLastAction(`Saved ${filename}`, 'success')
    } catch (e) {
      setLastAction(`Save failed — ${(e as Error).message}`, 'error')
    }
  }, [name, response, responseLanguage, setLastAction])

  useToolAction((action) => {
    if (action.type === 'execute') {
      void handleSend()
    }
    if (action.type === 'save-file') {
      void handleSaveResponse()
    }
    if (action.type === 'open-file') {
      void handleImportContent(action.content, action.filename)
    }
  })

  const handleExport = useCallback(async () => {
    const exportCollectionById = new Map(
      collections.map((collection, index) => [
        collection.id,
        { key: `collection-${index + 1}`, name: collection.name },
      ])
    )
    const exportData = requests.map((r) => {
      const collection = r.collectionId ? exportCollectionById.get(r.collectionId) : undefined
      return {
        name: r.name,
        method: r.method,
        url: r.url,
        headers: r.headers,
        body: r.body,
        bodyMode: r.bodyMode,
        auth: r.auth,
        collectionKey: collection?.key ?? null,
        collectionName: collection?.name ?? null,
      }
    })
    await copy(JSON.stringify(exportData, null, 2), {
      success: `Exported ${exportData.length} requests to clipboard`,
      failure: 'Export failed — clipboard unavailable',
    })
  }, [collections, requests, copy])

  // ---------------------------------------------------------------------------
  // Header management
  // ---------------------------------------------------------------------------

  const addHeader = useCallback(() => {
    updateDraft({ headers: [...headers, { key: '', value: '', enabled: true }] })
  }, [headers, updateDraft])

  const updateHeader = useCallback(
    (index: number, patch: Partial<ApiHeader>) => {
      const newHeaders = headers.map((h, i) => (i === index ? { ...h, ...patch } : h))
      updateDraft({ headers: newHeaders })
    },
    [headers, updateDraft]
  )

  const removeHeader = useCallback(
    (index: number) => {
      updateDraft({ headers: headers.filter((_, i) => i !== index) })
    },
    [headers, updateDraft]
  )

  const handleMethodChange = useCallback(
    (nextMethod: string) => {
      if (bodyMode === FORMDATA_MODE && !BODY_METHODS.has(nextMethod)) clearTransientFormState()
      updateState({ draft: applyMethodDefaults(state.draft, nextMethod) })
    },
    [bodyMode, clearTransientFormState, state.draft, updateState]
  )

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const showBody = BODY_METHODS.has(method) && bodyMode !== 'none'
  const showFormEditor = showBody && isFormMode(bodyMode)
  const bodyEditorLang = bodyMode === 'json' ? 'json' : 'plaintext'
  const activeHeaderCount = headers.filter((h) => h.enabled && h.key.trim()).length

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

  const statusLine = dirty
    ? 'Unsaved changes'
    : state.activeRequestId
      ? `Saved in ${activeCollectionName ?? 'Unassigned'}`
      : 'New request — not saved yet'

  const toggleLibrary = useCallback(() => {
    updateState({ libraryOpen: !state.libraryOpen })
  }, [state.libraryOpen, updateState])

  return (
    <>
      <CollectionsSidebar
        activeRequestId={state.activeRequestId}
        open={state.libraryOpen}
        onSelect={handleSelectLoadedRequest}
        onLoadFromHistory={handleLoadFromHistory}
        onRunCollection={(collection) => void runCollection(collection)}
        onCancelCollection={cancelCollection}
        collectionRun={collectionRun}
        onImport={() => setShowImportModal(true)}
        onExport={() => void handleExport()}
      >
        <ToolLayout
          fullBleed
          toolbar={
            <>
              {/* Request identity + save actions */}
              <Toolbar aria-label="Request identity and save actions">
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={toggleLibrary}
                  aria-expanded={state.libraryOpen}
                  aria-label={state.libraryOpen ? 'Hide request library' : 'Show request library'}
                  title={state.libraryOpen ? 'Hide request library' : 'Show request library'}
                  className={
                    state.libraryOpen
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-muted)]'
                  }
                >
                  <SidebarIcon size={16} aria-hidden="true" />
                </Button>

                <div className="min-w-0 flex-1 basis-40">
                  <InlineInput
                    value={name}
                    onChange={(e) => updateDraft({ name: e.target.value })}
                    placeholder={DEFAULT_REQUEST_NAME}
                    aria-label="Request name"
                    className="w-full truncate"
                  />
                  <p
                    className={`text-2xs ${
                      dirty ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]'
                    }`}
                    aria-live="polite"
                  >
                    {statusLine}
                  </p>
                </div>

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
                  onClick={() => setShowImportModal(true)}
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
                    onClick={() => setShowEnvModal(true)}
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
                {/* The only optional control on this row — method, URL and Send all have to
                    stay reachable, so the timeout is what the row sheds when it narrows. */}
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
                  aria-controls={responsePaneId}
                >
                  {responseVisible ? 'Hide Response' : 'Show Response'}
                </Button>
              </Toolbar>
            </>
          }
        >
          {unresolvedVariables.length > 0 && (
            <Alert
              variant="warning"
              className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Unresolved request variable{unresolvedVariables.length === 1 ? '' : 's'}:{' '}
                  {unresolvedVariables.map((name) => `{{${name}}}`).join(', ')}
                </span>
                <Button variant="secondary" size="xs" onClick={() => void handleSend(true)}>
                  Send anyway
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setUnresolvedVariables([])}>
                  Dismiss
                </Button>
              </div>
            </Alert>
          )}
          <RequestResponseLayout>
            {/* ── Request panel ─────────────────────────────────── */}
            <section
              aria-label="Request"
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            >
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
              {requestTab === 'auth' && (
                <AuthTab auth={auth} onChange={(a) => updateDraft({ auth: a })} />
              )}

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
                                  {f.file ? 'Replace file' : 'Attach file'} for field{' '}
                                  {f.key || i + 1}
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
                          Attached files are not saved with the request — a file handle cannot
                          outlive the session, so re-attach after reopening.
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

            {/* ── Response panel ────────────────────────────────── */}
            {responseVisible && (
              <section
                id={responsePaneId}
                aria-label="Response"
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              >
                {error && (
                  <Alert
                    variant="error"
                    className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
                  >
                    {error}
                  </Alert>
                )}
                {response && (
                  <>
                    <Toolbar aria-label="Response summary and actions">
                      <StatusBadge
                        variant={response.status < 400 ? 'success' : 'error'}
                        className="font-mono"
                      >
                        {response.status} {response.statusText}
                      </StatusBadge>
                      <span className="text-2xs text-[var(--color-text-muted)]">
                        {response.time}ms
                      </span>
                      <span className="text-2xs text-[var(--color-text-muted)]">
                        {formatBytes(response.size)}
                      </span>
                      <ToolbarSpacer />
                      <ToolbarGroup>
                        {!response.isBinary && <CopyButton text={prettyBody} />}
                        <Button
                          type="button"
                          variant="icon"
                          size="xs"
                          onClick={() => void handleSaveResponse()}
                          title={`Save response to a file (${formatShortcut('mod+s')})`}
                          aria-label="Save response to a file"
                        >
                          <DownloadSimpleIcon size={14} aria-hidden="true" />
                        </Button>
                      </ToolbarGroup>
                    </Toolbar>
                    <TabBar
                      tabs={RESPONSE_TABS}
                      activeTab={responseTab}
                      onTabChange={setResponseTab}
                    />
                    <div className="min-h-0 flex-1 overflow-hidden">
                      {responseTab === 'body' ? (
                        response.mimeType.startsWith('image/') && imagePreviewUrl ? (
                          <div className="flex h-full items-center justify-center overflow-auto p-4">
                            <img
                              src={imagePreviewUrl}
                              alt="Response preview"
                              className="max-h-full max-w-full rounded border border-[var(--color-border)]"
                            />
                          </div>
                        ) : response.isBinary ? (
                          <EmptyState
                            icon={DownloadSimpleIcon}
                            title="Binary response"
                            description={`${response.mimeType} · ${formatBytes(response.size)}. Save the response to inspect the original bytes.`}
                          />
                        ) : (
                          <div className="flex h-full min-h-0 flex-col">
                            {response.displayTruncated && (
                              <Alert
                                variant="warning"
                                className="rounded-none border-b border-[var(--color-border)] px-3 py-2"
                              >
                                Response truncated for display — save to file for the full body.
                              </Alert>
                            )}
                            <div className="min-h-0 flex-1">
                              <Editor
                                theme={monacoTheme}
                                language={responseLanguage}
                                value={prettyBody}
                                onMount={handleResponseEditorMount}
                                options={{ ...monacoOptions, readOnly: true }}
                              />
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="h-full overflow-auto p-3">
                          {Object.entries(response.headers).map(([key, value]) => (
                            // Response headers are what the server sent, not chrome — the
                            // whole row is mono so the name, colon and value share metrics.
                            <div
                              key={key}
                              className="mb-1 flex items-start gap-1 font-mono text-xs"
                            >
                              <span className="shrink-0 font-bold text-[var(--color-accent)]">
                                {key}
                              </span>
                              <span className="text-[var(--color-text-muted)]">: </span>
                              <span className="break-all text-[var(--color-text)]">{value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
                {!response && !error && !loading && (
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <EmptyState
                      icon={PaperPlaneTiltIcon}
                      title="Send a request to see the response"
                      description={`${formatShortcut('mod+enter')} sends the current request.`}
                    />
                  </div>
                )}
                {loading && (
                  <div
                    className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]"
                    role="status"
                  >
                    <Spinner size="md" label="Sending request" />
                    Sending request…
                  </div>
                )}
              </section>
            )}
          </RequestResponseLayout>
        </ToolLayout>
      </CollectionsSidebar>

      {showEnvModal && <EnvironmentModal onClose={() => setShowEnvModal(false)} />}
      {showSaveModal && (
        <SaveRequestModal
          mode={saveMode}
          initialName={name}
          initialCollectionId={saveModalInitialCollectionId}
          collections={collections}
          onSave={(reqName, collectionIdOrNewName, isNew) => {
            void handleSaveModalSubmit(reqName, collectionIdOrNewName, isNew)
          }}
          onClose={() => setShowSaveModal(false)}
        />
      )}
      {showImportModal && (
        <ImportSpecModal onImport={handleImportData} onClose={() => setShowImportModal(false)} />
      )}
      {pendingNavigation && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          confirmLabel="Discard changes"
          onClose={() => setPendingNavigation(null)}
          onConfirm={() => {
            const { perform } = pendingNavigation
            setPendingNavigation(null)
            perform()
          }}
        >
          <p>
            “{name}” has unsaved changes. Continue {pendingNavigation.description} and lose them?
          </p>
          <p className="mt-2 text-[var(--color-text-muted)]">
            Cancel and use Save or Save As to keep this request.
          </p>
        </ConfirmDialog>
      )}
      <SelectionContextToolbar
        selection={responseSelectionToolbar.selection}
        actions={responseSelectionActions}
        onDismiss={responseSelectionToolbar.clearSelection}
      />
    </>
  )
}
