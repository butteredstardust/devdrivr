import type { FormatterWorker } from '@/workers/formatter.worker'

const formatterWorkerMethods = ['format', 'detectLanguage', 'getSupportedLanguages'] as const

type CompleteWorkerMethodList<Api, Methods extends readonly (keyof Api & string)[]> =
  Exclude<keyof Api, Methods[number]> extends never ? Methods : never

export const FORMATTER_WORKER_METHODS: CompleteWorkerMethodList<
  FormatterWorker,
  typeof formatterWorkerMethods
> = formatterWorkerMethods
