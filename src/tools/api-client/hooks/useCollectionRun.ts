import { useCallback, useEffect, useRef, useState } from 'react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { useApiStore } from '@/stores/api.store'
import {
  buildMultipartBody,
  contentTypeFor,
  FORMDATA_MODE,
  parseFormBody,
} from '@/tools/api-client/form-body'
import {
  base64EncodeUtf8,
  BODY_METHODS,
  DEFAULT_TIMEOUT_MS,
  interpolate,
  unresolvedVariableNames,
  type CollectionRun,
} from '@/tools/api-client/request-model'

export function useCollectionRun(envVars: Record<string, string>, timeoutMs: number) {
  const requests = useApiStore((s) => s.requests)
  const [collectionRun, setCollectionRun] = useState<CollectionRun | null>(null)
  const collectionRunAbortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      collectionRunAbortRef.current?.abort()
    },
    []
  )

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
        // Check the ref now, not in the updater. React can run the updater after this run
        // clears the ref, which drops the last results.
        if (collectionRunAbortRef.current !== controller) return
        setCollectionRun((current) =>
          current?.collectionId === collection.id ? update(current) : current
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
          Math.max(1_000, timeoutMs || DEFAULT_TIMEOUT_MS)
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
          // The run needs only the status. Cancel the body, because the HTTP plugin keeps an
          // unread body open on the Rust side until the app quits.
          result.body?.cancel().catch(() => {})
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
    [envVars, requests, timeoutMs]
  )

  const cancelCollection = useCallback(() => {
    collectionRunAbortRef.current?.abort()
  }, [])

  return { collectionRun, runCollection, cancelCollection }
}
