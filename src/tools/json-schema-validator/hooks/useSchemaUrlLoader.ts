import { useCallback, useRef, useState } from 'react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { readTextWithLimit } from '@/lib/http-body'
import { useUiStore } from '@/stores/ui.store'
import { parseJson, type JsonSchemaState } from '@/tools/json-schema-validator/json-schema-helpers'
import {
  MAX_REMOTE_SCHEMA_BYTES,
  resolveRemoteRefs,
} from '@/tools/json-schema-validator/remote-refs'

/** A schema fetch that never answers should not leave the button spinning. */
const FETCH_TIMEOUT_MS = 15_000

type UseSchemaUrlLoaderOptions = {
  schemaUrl: string
  applyBuffers: (next: Partial<JsonSchemaState>, label: string) => void
}

export function useSchemaUrlLoader({ schemaUrl, applyBuffers }: UseSchemaUrlLoaderOptions) {
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const fetchIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const handleLoadUrl = useCallback(async () => {
    const url = schemaUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      setLastAction('Enter an http(s) URL', 'error')
      return
    }
    // Two loads in flight would otherwise race, and the slower one would win.
    const id = ++fetchIdRef.current
    // Abort a superseded request because its result cannot be used.
    abortRef.current?.abort()
    setLoadingUrl(true)
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      // The Tauri HTTP client, not the WebView's: schema hosts do not send
      // CORS headers, so a browser `fetch` fails on almost every real URL.
      const response = await tauriFetch(url, { signal: controller.signal })
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw new Error(`the server answered ${response.status}`)
      }
      const text = await readTextWithLimit(
        response,
        MAX_REMOTE_SCHEMA_BYTES,
        `the schema is larger than ${MAX_REMOTE_SCHEMA_BYTES / 1_000_000} MB`
      )
      const parsed = parseJson(text)
      if (parsed.status !== 'valid') throw new Error('the response is not valid JSON')
      if (id !== fetchIdRef.current) return
      const resolved = await resolveRemoteRefs(parsed.value, url, controller.signal)
      applyBuffers({ schema: JSON.stringify(resolved, null, 2) }, 'Load schema from URL')
      setLastAction('Loaded the schema from the URL', 'success')
    } catch (e) {
      if (id !== fetchIdRef.current) return
      const raw = e instanceof Error ? e.message : String(e)
      const message =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'the request timed out'
          : // Tauri denies hosts outside the capability scope with wording no
            // user could act on; naming the restriction is the actionable part.
            /scope/i.test(raw)
            ? 'this host is not in the app’s allowed list'
            : raw
      setLastAction(`Could not load the schema — ${message}`, 'error')
    } finally {
      clearTimeout(timeout)
      if (id === fetchIdRef.current) {
        abortRef.current = null
        setLoadingUrl(false)
      }
    }
  }, [schemaUrl, applyBuffers, setLastAction])

  return { loadingUrl, handleLoadUrl }
}
