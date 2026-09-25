import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { readBytesWithLimit } from '@/lib/http-body'
import { useApiStore } from '@/stores/api.store'
import { useUiStore } from '@/stores/ui.store'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { buildExportFilename, exportFile } from '@/lib/file-io'
import { formatBytes } from '@/lib/format'
import {
  buildMultipartBody,
  contentTypeFor,
  FORMDATA_MODE,
  toCurl,
  type FormField,
} from '@/tools/api-client/form-body'
import {
  base64EncodeUtf8,
  BODY_METHODS,
  DEFAULT_TIMEOUT_MS,
  detectResponseLanguage,
  interpolate,
  isTextResponse,
  MAX_DISPLAY_BYTES,
  MAX_HISTORY_RESPONSE_CHARS,
  MAX_RESPONSE_BYTES,
  responseMime,
  unresolvedVariableNames,
  type RequestDraft,
  type ResponseData,
} from '@/tools/api-client/request-model'

type UseRequestTransportInput = {
  draft: RequestDraft
  state: { timeoutMs: number }
  envVars: Record<string, string>
  formFields: FormField[]
}

export function useRequestTransport({
  draft,
  state,
  envVars,
  formFields,
}: UseRequestTransportInput) {
  const addRequestHistory = useApiStore((s) => s.addRequestHistory)
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const { method, url, body, bodyMode, name, headers, auth } = draft
  const [response, setResponse] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unresolvedVariables, setUnresolvedVariables] = useState<string[]>([])
  const requestControllerRef = useRef<AbortController | null>(null)
  const timedOutRef = useRef(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  useEffect(
    () => () => {
      requestControllerRef.current?.abort()
    },
    []
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
          // Release the unread body on the Rust side before the request fails.
          await res.body?.cancel().catch(() => {})
          throw new Error(
            `Response is ${formatBytes(declaredLength)}, above the ${formatBytes(MAX_RESPONSE_BYTES)} limit. Use a direct download instead.`
          )
        }

        // A server that under-declared or omitted Content-Length still lands here. Stop reading
        // at the limit, so one bad response cannot download or pin gigabytes.
        const { bytes: responseBytes, truncated: overLimit } = await readBytesWithLimit(
          res,
          MAX_RESPONSE_BYTES
        )
        const size = responseBytes.byteLength

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

  return {
    response,
    setResponse,
    loading,
    error,
    setError,
    unresolvedVariables,
    setUnresolvedVariables,
    imagePreviewUrl,
    handleSend,
    handleCancelRequest,
    handleCopyAsCurl,
    responseLanguage,
    prettyBody,
    handleSaveResponse,
  }
}
