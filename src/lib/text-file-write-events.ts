type TextFileWriteListener = (path: string, content: string) => void

const listeners = new Set<TextFileWriteListener>()

/** Records a successful write so file watchers can distinguish it from an external edit. */
export function notifyTextFileWrite(path: string, content: string): void {
  listeners.forEach((listener) => listener(path, content))
}

export function subscribeTextFileWrite(listener: TextFileWriteListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
