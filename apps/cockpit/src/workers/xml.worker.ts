import { handleRpc } from './rpc'
import { validate, format, minify, toJson, stats, queryXPath } from './xml.api'

const api = {
  validate,
  format,
  minify,
  toJson,
  stats,
  queryXPath,
}

export type XmlWorker = typeof api

handleRpc(api)
