/**
 * One colour per HTTP verb, shared by the API client and the cURL converter.
 *
 * The two tools each carried their own map and they disagreed: one had POST as info and PATCH as
 * warning, the other POST as warning and PATCH as accent. Reading the same request in both tools
 * gave it two different colours, which quietly trains you that the colour means nothing.
 *
 * The scale it does mean: how much the verb changes on the server. Safe read, creates, replaces,
 * modifies, destroys — and metadata verbs stay muted because they change nothing at all.
 */
const METHOD_TOKENS: Record<string, string> = {
  GET: '--color-success',
  POST: '--color-info',
  PUT: '--color-warning',
  PATCH: '--color-warning',
  DELETE: '--color-error',
  HEAD: '--color-text-muted',
  OPTIONS: '--color-text-muted',
}

function methodToken(method: string): string {
  return METHOD_TOKENS[method.toUpperCase()] ?? '--color-text-muted'
}

/** Tailwind text colour class. */
export function httpMethodTextClass(method: string): string {
  return `text-[var(${methodToken(method)})]`
}

/** Raw `var(...)`, for the one caller that needs it inside a `color-mix()`. */
export function httpMethodColorVar(method: string): string {
  return `var(${methodToken(method)})`
}
