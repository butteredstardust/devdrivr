import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiHeader } from '@/types/models'
import { coerceApiHeaders, coerceApiRequestAuth } from '@/lib/schemas'
import {
  blankFormRows,
  contentTypeFor,
  FORMDATA_MODE,
  isBoilerplateContentType,
  parseFormBody,
  serializeFormBody,
  type FormField,
} from '@/tools/api-client/form-body'
import {
  applyMethodDefaults,
  BODY_METHODS,
  buildUrlWithParams,
  parseQueryParams,
  removeIndexedFile,
  type ApiClientState,
  type Param,
  type RequestDraft,
} from '@/tools/api-client/request-model'

type UseRequestEditorInput = {
  state: ApiClientState
  updateState: (patch: Partial<ApiClientState>) => void
}

export function useRequestEditor({ state, updateState }: UseRequestEditorInput) {
  // Destructure draft for convenience
  const { method, url, body, bodyMode, name } = state.draft

  const headers = useMemo(() => coerceApiHeaders(state.draft.headers), [state.draft.headers])
  const auth = useMemo(() => coerceApiRequestAuth(state.draft.auth), [state.draft.auth])

  const updateDraft = useCallback(
    (patch: Partial<RequestDraft>) => {
      updateState({ draft: { ...state.draft, ...patch } })
    },
    [state.draft, updateState]
  )

  // ---------------------------------------------------------------------------
  // Query params
  // ---------------------------------------------------------------------------

  const [params, setParams] = useState<Param[]>(() => parseQueryParams(url))
  const urlRef = useRef(url)

  useEffect(() => {
    if (url !== urlRef.current) {
      urlRef.current = url
      setParams(parseQueryParams(url))
    }
  }, [url])

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

  return {
    method,
    url,
    body,
    bodyMode,
    name,
    headers,
    auth,
    updateDraft,
    params,
    addParam,
    updateParam,
    removeParam,
    formFields,
    clearTransientFormState,
    handleBodyModeChange,
    addFormField,
    updateFormField,
    removeFormField,
    attachFile,
    addHeader,
    updateHeader,
    removeHeader,
    handleMethodChange,
  }
}
