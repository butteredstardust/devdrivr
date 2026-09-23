function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!isPlainObject(value)) return false
  return Object.values(value).every(isJsonValue)
}

function hasMatchingKind(defaultValue: unknown, savedValue: unknown): boolean {
  if (defaultValue === null || defaultValue === undefined) return isJsonValue(savedValue)
  if (typeof defaultValue === 'number') {
    return typeof savedValue === 'number' && Number.isFinite(savedValue)
  }
  if (typeof defaultValue === 'string' || typeof defaultValue === 'boolean') {
    return typeof savedValue === typeof defaultValue
  }
  if (Array.isArray(defaultValue)) return Array.isArray(savedValue)
  if (isPlainObject(defaultValue)) return isPlainObject(savedValue)
  return false
}

export function droppedToolStateKeys(defaults: Record<string, unknown>, saved: unknown): string[] {
  if (!isPlainObject(saved)) return []

  return Object.keys(saved).filter(
    (key) => !Object.hasOwn(defaults, key) || !hasMatchingKind(defaults[key], saved[key])
  )
}

export function mergeToolState<T extends Record<string, unknown>>(defaults: T, saved: unknown): T {
  if (!isPlainObject(saved)) return defaults

  const merged: Record<string, unknown> = { ...defaults }
  for (const key of Object.keys(defaults)) {
    if (Object.hasOwn(saved, key) && hasMatchingKind(defaults[key], saved[key])) {
      merged[key] = saved[key]
    }
  }
  return merged as T
}

export { isPlainObject }
